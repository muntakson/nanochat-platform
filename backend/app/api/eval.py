"""
Evaluation API endpoints - simplified version to avoid import conflicts
Full evaluation will be implemented with subprocess approach like chat
"""
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import asyncio
import json
import uuid
from datetime import datetime

from app.auth import get_current_user
from app.models import User

router = APIRouter()

# Store running evaluation tasks
_eval_tasks: Dict[str, Dict[str, Any]] = {}
_eval_lock = asyncio.Lock()

# Cache directory for evaluation results
EVAL_RESULTS_DIR = Path("/var/www/gpt2/nanochat-platform/backend/data/eval_results")
EVAL_RESULTS_DIR.mkdir(parents=True, exist_ok=True)

# Nanochat checkpoint directory
CHECKPOINT_BASE_DIR = Path.home() / ".cache" / "nanochat"


class EvaluationRequest(BaseModel):
    model_id: str  # e.g., "sft", "base", "mid"
    benchmarks: List[str]  # e.g., ["gsm8k", "mmlu", "arc"]
    use_cached: Optional[bool] = True


class EvaluationStatus(BaseModel):
    task_id: str
    status: str  # "pending", "running", "completed", "failed"
    progress: Optional[float] = 0.0
    current_benchmark: Optional[str] = None
    results: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


@router.post("/run")
async def run_evaluation(
    request: EvaluationRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user)
):
    """Start an evaluation task (placeholder - not yet fully implemented)"""
    task_id = str(uuid.uuid4())

    async with _eval_lock:
        _eval_tasks[task_id] = {
            "task_id": task_id,
            "status": "failed",
            "progress": 0.0,
            "current_benchmark": None,
            "results": {},
            "error": "Evaluation feature is not yet fully implemented. Coming soon!",
            "started_at": datetime.now().isoformat(),
            "completed_at": datetime.now().isoformat(),
            "model_id": request.model_id,
            "benchmarks": request.benchmarks,
            "user_id": current_user.id
        }

    return {
        "task_id": task_id,
        "status": "failed",
        "message": "Evaluation feature coming soon! Currently working on fixing import issues."
    }


@router.get("/status/{task_id}")
async def get_evaluation_status(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get the status of an evaluation task"""
    async with _eval_lock:
        if task_id not in _eval_tasks:
            raise HTTPException(status_code=404, detail=f"Task {task_id} not found")

        task = _eval_tasks[task_id]

        # Check authorization
        if task["user_id"] != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to view this task")

        return EvaluationStatus(**task)


@router.get("/results")
async def get_all_results(current_user: User = Depends(get_current_user)):
    """Get all completed evaluation results for the current user"""
    async with _eval_lock:
        user_results = [
            task for task in _eval_tasks.values()
            if task["user_id"] == current_user.id and task["status"] == "completed"
        ]

    # Also load cached results from disk
    cached_results = []
    if EVAL_RESULTS_DIR.exists():
        for result_file in EVAL_RESULTS_DIR.glob("*.json"):
            try:
                with open(result_file, "r") as f:
                    result = json.load(f)
                    # Only include results for this user
                    if result.get("user_id") == current_user.id:
                        cached_results.append(result)
            except Exception as e:
                print(f"Error loading cached result {result_file}: {e}")

    return {
        "active": user_results,
        "cached": cached_results
    }


@router.get("/benchmarks")
async def list_benchmarks(current_user: User = Depends(get_current_user)):
    """List available evaluation benchmarks"""
    return {
        "benchmarks": [
            {
                "id": "gsm8k",
                "name": "GSM8K",
                "description": "Grade School Math 8K - Math word problems",
                "num_examples": 1319
            },
            {
                "id": "mmlu",
                "name": "MMLU",
                "description": "Massive Multitask Language Understanding",
                "num_examples": 14042
            },
            {
                "id": "humaneval",
                "name": "HumanEval",
                "description": "Python coding problems",
                "num_examples": 164
            },
            {
                "id": "arc",
                "name": "ARC",
                "description": "AI2 Reasoning Challenge",
                "num_examples": 1000
            },
            {
                "id": "hellaswag",
                "name": "HellaSwag",
                "description": "Commonsense reasoning",
                "num_examples": 10000
            }
        ]
    }


@router.get("/models")
async def list_eval_models(current_user: User = Depends(get_current_user)):
    """List available models for evaluation"""
    models = []

    # Check for standard checkpoints
    for checkpoint_type in ["base", "mid", "sft", "rl"]:
        checkpoint_path = CHECKPOINT_BASE_DIR / f"{checkpoint_type}_checkpoints"
        if checkpoint_path.exists():
            # Find all depth directories
            for depth_dir in checkpoint_path.glob("d*"):
                if depth_dir.is_dir():
                    models.append({
                        "id": f"{checkpoint_type}-{depth_dir.name}",
                        "name": f"{checkpoint_type.upper()} - {depth_dir.name}",
                        "type": checkpoint_type,
                        "depth": depth_dir.name
                    })

    if not models:
        # Add default if no models found
        models.append({
            "id": "sft-d12",
            "name": "SFT - d12 (default)",
            "type": "sft",
            "depth": "d12"
        })

    return {"models": models}
