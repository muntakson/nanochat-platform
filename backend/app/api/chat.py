"""
Chat API endpoints - integrates with nanochat Engine for chat completions
"""
import sys
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, AsyncGenerator
import asyncio
import json

# Add nanochat to path
NANOCHAT_PATH = Path("/var/www/gpt2/nanochat")
sys.path.insert(0, str(NANOCHAT_PATH))

from app.auth import get_current_user
from app.models import User

router = APIRouter()

# Global engine instance (lazy loaded)
_engine = None
_engine_lock = asyncio.Lock()


async def get_engine():
    """Get or create the inference engine"""
    global _engine
    async with _engine_lock:
        if _engine is None:
            from nanochat.engine import Engine
            from nanochat.checkpoint_manager import load_model

            # Load the default SFT model
            print("Loading nanochat model for chat...")
            try:
                model, tokenizer, meta = load_model("sft", device="cuda")
                _engine = Engine(model, tokenizer, device="cuda")
                print(f"Model loaded successfully: {meta}")
            except Exception as e:
                print(f"Error loading model: {e}")
                raise HTTPException(status_code=500, detail=f"Failed to load model: {str(e)}")

        return _engine


class Message(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatCompletionRequest(BaseModel):
    messages: List[Message]
    temperature: Optional[float] = 1.0
    top_p: Optional[float] = 0.9
    max_tokens: Optional[int] = 2048
    stream: Optional[bool] = True


@router.post("/completions")
async def chat_completions(
    request: ChatCompletionRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Generate chat completions (streaming or non-streaming)
    Compatible with OpenAI chat completion API format
    """
    engine = await get_engine()

    # Convert messages to prompt format
    # Format: <|user|>message<|endoftext|><|assistant|>
    prompt_parts = []
    for msg in request.messages:
        if msg.role == "user":
            prompt_parts.append(f"<|user|>{msg.content}<|endoftext|>")
        elif msg.role == "assistant":
            prompt_parts.append(f"<|assistant|>{msg.content}<|endoftext|>")

    prompt_parts.append("<|assistant|>")
    prompt = "".join(prompt_parts)

    if request.stream:
        return StreamingResponse(
            stream_chat_response(engine, prompt, request),
            media_type="text/event-stream"
        )
    else:
        # Non-streaming response
        response_text = await generate_response(
            engine,
            prompt,
            request.temperature,
            request.top_p,
            request.max_tokens
        )
        return {
            "id": "chatcmpl-" + str(hash(prompt))[:8],
            "object": "chat.completion",
            "model": "nanochat-sft",
            "choices": [{
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": response_text
                },
                "finish_reason": "stop"
            }]
        }


async def stream_chat_response(
    engine,
    prompt: str,
    request: ChatCompletionRequest
) -> AsyncGenerator[str, None]:
    """Stream chat response as SSE events"""
    try:
        tokens = engine.tokenizer.encode(prompt)

        # Stream generation
        for i in range(request.max_tokens):
            # Generate next token
            next_token = await asyncio.to_thread(
                engine.generate_token,
                tokens,
                temperature=request.temperature,
                top_p=request.top_p
            )

            if next_token == engine.tokenizer.eot_token:
                break

            tokens.append(next_token)

            # Decode and send token
            text = engine.tokenizer.decode([next_token])

            # Send as SSE event
            chunk = {
                "id": "chatcmpl-" + str(hash(prompt))[:8],
                "object": "chat.completion.chunk",
                "model": "nanochat-sft",
                "choices": [{
                    "index": 0,
                    "delta": {"content": text},
                    "finish_reason": None
                }]
            }
            yield f"data: {json.dumps(chunk)}\n\n"
            await asyncio.sleep(0)  # Allow other tasks to run

        # Send final chunk
        final_chunk = {
            "id": "chatcmpl-" + str(hash(prompt))[:8],
            "object": "chat.completion.chunk",
            "model": "nanochat-sft",
            "choices": [{
                "index": 0,
                "delta": {},
                "finish_reason": "stop"
            }]
        }
        yield f"data: {json.dumps(final_chunk)}\n\n"
        yield "data: [DONE]\n\n"

    except Exception as e:
        error_chunk = {
            "error": {
                "message": str(e),
                "type": "internal_error"
            }
        }
        yield f"data: {json.dumps(error_chunk)}\n\n"


async def generate_response(
    engine,
    prompt: str,
    temperature: float,
    top_p: float,
    max_tokens: int
) -> str:
    """Generate non-streaming response"""
    tokens = engine.tokenizer.encode(prompt)
    response_tokens = []

    for i in range(max_tokens):
        next_token = await asyncio.to_thread(
            engine.generate_token,
            tokens,
            temperature=temperature,
            top_p=top_p
        )

        if next_token == engine.tokenizer.eot_token:
            break

        tokens.append(next_token)
        response_tokens.append(next_token)

    return engine.tokenizer.decode(response_tokens)


@router.get("/models")
async def list_models(current_user: User = Depends(get_current_user)):
    """List available chat models"""
    return {
        "models": [
            {
                "id": "nanochat-sft",
                "name": "NanoChat SFT",
                "description": "Fine-tuned chat model"
            }
        ]
    }
