"""
Chat API endpoints - uses subprocess to call nanochat in its own Python environment
"""
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, AsyncGenerator
import asyncio
import json
import subprocess

from app.auth import get_current_user
from app.models import User

router = APIRouter()

# Nanochat paths
NANOCHAT_PATH = Path("/var/www/gpt2/nanochat")
NANOCHAT_VENV_PYTHON = NANOCHAT_PATH / ".venv" / "bin" / "python"
CHAT_SCRIPT = NANOCHAT_PATH / "scripts" / "chat_api.py"


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
    if not CHAT_SCRIPT.exists():
        raise HTTPException(status_code=500, detail="Chat script not found")

    if request.stream:
        return StreamingResponse(
            stream_chat_response(request),
            media_type="text/event-stream"
        )
    else:
        # Non-streaming not yet implemented
        raise HTTPException(status_code=501, detail="Non-streaming not implemented")


async def stream_chat_response(
    request: ChatCompletionRequest
) -> AsyncGenerator[str, None]:
    """Stream chat response as SSE events using subprocess"""
    try:
        # Prepare input data
        input_data = {
            "messages": [{"role": msg.role, "content": msg.content} for msg in request.messages],
            "temperature": request.temperature,
            "top_p": request.top_p,
            "max_tokens": request.max_tokens
        }

        # Start subprocess
        process = await asyncio.create_subprocess_exec(
            str(NANOCHAT_VENV_PYTHON),
            str(CHAT_SCRIPT),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(NANOCHAT_PATH)
        )

        # Send input data
        input_json = json.dumps(input_data).encode('utf-8')
        if process.stdin:
            process.stdin.write(input_json)
            await process.stdin.drain()
            process.stdin.close()

        # Read and stream output
        if process.stdout:
            while True:
                line = await process.stdout.readline()
                if not line:
                    break

                try:
                    data = json.loads(line.decode('utf-8').strip())

                    if data.get("type") == "token":
                        # Send token as SSE
                        chunk = {
                            "id": "chatcmpl-nanochat",
                            "object": "chat.completion.chunk",
                            "model": "nanochat-sft",
                            "choices": [{
                                "index": 0,
                                "delta": {"content": data.get("content", "")},
                                "finish_reason": None
                            }]
                        }
                        yield f"data: {json.dumps(chunk)}\n\n"

                    elif data.get("type") == "done":
                        # Send final chunk
                        final_chunk = {
                            "id": "chatcmpl-nanochat",
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
                        break

                    elif data.get("type") == "error":
                        error_chunk = {
                            "error": {
                                "message": data.get("message", "Unknown error"),
                                "type": "internal_error"
                            }
                        }
                        yield f"data: {json.dumps(error_chunk)}\n\n"
                        break

                except json.JSONDecodeError:
                    # Skip lines that aren't valid JSON
                    continue

        # Wait for process to complete
        await process.wait()

        # Check for errors in stderr
        if process.stderr:
            stderr = await process.stderr.read()
            if stderr and process.returncode != 0:
                print(f"Chat subprocess error: {stderr.decode('utf-8')}")

    except Exception as e:
        error_chunk = {
            "error": {
                "message": str(e),
                "type": "internal_error"
            }
        }
        yield f"data: {json.dumps(error_chunk)}\n\n"


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
