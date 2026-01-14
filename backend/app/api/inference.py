"""
Inference API endpoints for chatting with trained models
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import json
import os
import sys
from pathlib import Path
import asyncio

router = APIRouter()

# Add nanochat and its virtual environment to Python path
NANOCHAT_PATH = Path("/var/www/gpt2/nanochat")
NANOCHAT_VENV_PATH = NANOCHAT_PATH / ".venv" / "lib" / "python3.10" / "site-packages"

# Add nanochat venv site-packages first (for flash-attention and other dependencies)
if NANOCHAT_VENV_PATH.exists() and str(NANOCHAT_VENV_PATH) not in sys.path:
    sys.path.insert(0, str(NANOCHAT_VENV_PATH))

# Then add nanochat itself
if str(NANOCHAT_PATH) not in sys.path:
    sys.path.insert(0, str(NANOCHAT_PATH))

# Delay imports to avoid loading issues
NANOCHAT_AVAILABLE = False

def _check_nanochat():
    """Check if nanochat is available and import modules"""
    global NANOCHAT_AVAILABLE
    try:
        import torch
        from nanochat.common import compute_init, autodetect_device_type
        from nanochat.checkpoint_manager import load_model
        from nanochat.engine import Engine
        from contextlib import nullcontext
        NANOCHAT_AVAILABLE = True
        return True
    except Exception as e:
        print(f"Warning: Could not import nanochat modules: {e}")
        return False

# Checkpoint base directory
CHECKPOINT_BASE_DIR = Path.home() / ".cache" / "nanochat"


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    model: str
    temperature: float = 0.8
    top_k: int = 50
    max_tokens: int = 512


class ModelInfo(BaseModel):
    name: str
    path: str
    type: str  # "base", "mid", "sft"
    step: Optional[int] = None
    meta: Optional[Dict[str, Any]] = None


# Global model cache
_model_cache: Dict[str, tuple] = {}


def discover_models() -> List[ModelInfo]:
    """Discover all available trained models"""
    models = []

    if not CHECKPOINT_BASE_DIR.exists():
        return models

    # Check different checkpoint directories
    checkpoint_types = {
        "base_checkpoints": "base",
        "mid_checkpoints": "mid",
        "chatsft_checkpoints": "sft"
    }

    for checkpoint_dir, model_type in checkpoint_types.items():
        checkpoint_path = CHECKPOINT_BASE_DIR / checkpoint_dir
        if not checkpoint_path.exists():
            continue

        # Find model directories
        for model_dir in checkpoint_path.iterdir():
            if not model_dir.is_dir():
                continue

            # Find model checkpoint files
            model_files = list(model_dir.glob("model_*.pt"))
            if not model_files:
                continue

            # Get all checkpoints for this model
            for model_file in model_files:
                # Extract step number from filename
                step_str = model_file.stem.split("_")[-1]
                try:
                    step = int(step_str)
                except ValueError:
                    continue

                # Load metadata if available
                meta_file = model_dir / f"meta_{step_str}.json"
                meta = None
                if meta_file.exists():
                    try:
                        with open(meta_file, 'r') as f:
                            meta = json.load(f)
                    except:
                        pass

                model_info = ModelInfo(
                    name=f"{model_dir.name}_step{step}",
                    path=str(model_file),
                    type=model_type,
                    step=step,
                    meta=meta
                )
                models.append(model_info)

    # Sort by type and step
    models.sort(key=lambda m: (m.type, m.name))
    return models


async def load_inference_model(model_path: str):
    """Load a model for inference"""
    global _model_cache

    # Check nanochat availability on first use
    if not _check_nanochat():
        raise HTTPException(status_code=500, detail="Nanochat modules not available")

    # Import here to avoid loading issues
    import torch
    from nanochat.common import compute_init, autodetect_device_type
    from nanochat.checkpoint_manager import load_model
    from nanochat.engine import Engine
    from contextlib import nullcontext

    # Check cache
    if model_path in _model_cache:
        return _model_cache[model_path]

    try:
        # Determine model source from path
        if "chatsft_checkpoints" in model_path:
            source = "sft"
        elif "mid_checkpoints" in model_path:
            source = "mid"
        else:
            source = "base"

        # Extract model tag and step from path
        path_parts = Path(model_path).parts
        model_tag = None
        step = None

        for i, part in enumerate(path_parts):
            if part.endswith("_checkpoints"):
                if i + 1 < len(path_parts):
                    model_tag = path_parts[i + 1]
                break

        # Extract step from filename
        filename = Path(model_path).stem
        if "_" in filename:
            step_str = filename.split("_")[-1]
            try:
                step = int(step_str)
            except ValueError:
                pass

        # Initialize device
        device_type = autodetect_device_type()
        ddp, ddp_rank, ddp_local_rank, ddp_world_size, device = compute_init(device_type)
        ptdtype = torch.bfloat16
        autocast_ctx = torch.amp.autocast(device_type=device_type, dtype=ptdtype) if device_type == "cuda" else nullcontext()

        # Load model
        model, tokenizer, meta = load_model(source, device, phase="eval", model_tag=model_tag, step=step)

        # Create engine
        engine = Engine(model, tokenizer)

        # Cache the model
        _model_cache[model_path] = (engine, tokenizer, autocast_ctx, device_type)

        return _model_cache[model_path]

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load model: {str(e)}")


@router.get("/models")
async def list_models():
    """List all available trained models"""
    try:
        models = discover_models()
        return {"models": [model.dict() for model in models]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to discover models: {str(e)}")


@router.post("/chat")
async def chat_completion(request: ChatRequest):
    """Chat with a trained model (streaming response)"""
    raise HTTPException(
        status_code=503,
        detail="Web-based inference is not available. Flash Attention 3 kernels are not compiled for GB10 GPU (compute capability 12.1). " +
               "PyTorch 2.9.1 only supports up to compute capability 12.0. " +
               "Please use the nanochat CLI for inference: " +
               "cd /var/www/gpt2/nanochat && source .venv/bin/activate && python -m scripts.chat_cli -i sft"
    )

    try:
        # Load the model
        engine, tokenizer, autocast_ctx, device_type = await load_inference_model(request.model)

        # Get special tokens
        bos = tokenizer.get_bos_token_id()
        user_start = tokenizer.encode_special("<|user_start|>")
        user_end = tokenizer.encode_special("<|user_end|>")
        assistant_start = tokenizer.encode_special("<|assistant_start|>")
        assistant_end = tokenizer.encode_special("<|assistant_end|>")

        # Build conversation tokens
        conversation_tokens = [bos]
        for message in request.messages:
            if message.role == "user":
                conversation_tokens.append(user_start)
                conversation_tokens.extend(tokenizer.encode(message.content))
                conversation_tokens.append(user_end)
            elif message.role == "assistant":
                conversation_tokens.append(assistant_start)
                conversation_tokens.extend(tokenizer.encode(message.content))
                conversation_tokens.append(assistant_end)

        # Start assistant response
        conversation_tokens.append(assistant_start)

        # Streaming generator
        async def generate_response():
            try:
                generate_kwargs = {
                    "num_samples": 1,
                    "max_tokens": request.max_tokens,
                    "temperature": request.temperature,
                    "top_k": request.top_k,
                }

                with autocast_ctx:
                    for token_column, token_masks in engine.generate(conversation_tokens, **generate_kwargs):
                        token = token_column[0]  # pop batch dimension

                        # Stop if we hit the assistant end token
                        if token == assistant_end:
                            break

                        token_text = tokenizer.decode([token])

                        # Yield SSE format
                        yield f"data: {json.dumps({'token': token_text})}\n\n"

                        # Small delay to prevent overwhelming the client
                        await asyncio.sleep(0.01)

                # Send completion marker
                yield f"data: {json.dumps({'done': True})}\n\n"

            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"

        return StreamingResponse(
            generate_response(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            }
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")


@router.get("/model-info/{model_path:path}")
async def get_model_info(model_path: str):
    """Get detailed information about a specific model"""
    try:
        # Find the model in discovered models
        models = discover_models()
        for model in models:
            if model.path == model_path or model.name in model_path:
                return model.dict()

        raise HTTPException(status_code=404, detail="Model not found")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get model info: {str(e)}")


@router.post("/clear-cache")
async def clear_model_cache():
    """Clear the model cache to free GPU memory"""
    global _model_cache

    try:
        # Clear cache
        _model_cache.clear()

        # Force garbage collection
        if _check_nanochat():
            import torch
            import gc
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

        return {"status": "success", "message": "Model cache cleared"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear cache: {str(e)}")
