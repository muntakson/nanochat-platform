"""
Evaluation API endpoints - uses subprocess to call nanochat in its own Python environment
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

# Nanochat paths
NANOCHAT_PATH = Path("/var/www/gpt2/nanochat")
NANOCHAT_VENV_PYTHON = NANOCHAT_PATH / ".venv" / "bin" / "python"
EVAL_SCRIPT = NANOCHAT_PATH / "scripts" / "eval_api.py"

# Store running evaluation tasks
_eval_tasks: Dict[str, Dict[str, Any]] = {}
_eval_lock = asyncio.Lock()

# Cache directory for evaluation results
EVAL_RESULTS_DIR = Path("/var/www/gpt2/nanochat-platform/backend/data/eval_results")
EVAL_RESULTS_DIR.mkdir(parents=True, exist_ok=True)

# Nanochat checkpoint directory
CHECKPOINT_BASE_DIR = Path.home() / ".cache" / "nanochat"


class EvaluationRequest(BaseModel):
    model_id: str  # e.g., "sft", "base-d12"
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
    """Start an evaluation task"""
    if not EVAL_SCRIPT.exists():
        raise HTTPException(status_code=500, detail="Evaluation script not found")

    task_id = str(uuid.uuid4())

    async with _eval_lock:
        _eval_tasks[task_id] = {
            "task_id": task_id,
            "status": "pending",
            "progress": 0.0,
            "current_benchmark": None,
            "results": {},
            "error": None,
            "started_at": datetime.now().isoformat(),
            "completed_at": None,
            "model_id": request.model_id,
            "benchmarks": request.benchmarks,
            "user_id": current_user.id
        }

    # Run evaluation in background
    background_tasks.add_task(
        run_evaluation_task,
        task_id,
        request.model_id,
        request.benchmarks,
        current_user.id
    )

    return {"task_id": task_id, "status": "started"}


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
            }
        ]
    }


@router.get("/models")
async def list_eval_models(current_user: User = Depends(get_current_user)):
    """List available models for evaluation"""
    models = []

    # Check for standard checkpoints
    checkpoint_types = {
        "base_checkpoints": "base",
        "mid_checkpoints": "mid",
        "chatsft_checkpoints": "sft",
        "rl_checkpoints": "rl"
    }

    for checkpoint_dir_name, checkpoint_type in checkpoint_types.items():
        checkpoint_path = CHECKPOINT_BASE_DIR / checkpoint_dir_name
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
            "id": "sft",
            "name": "SFT (default)",
            "type": "sft",
            "depth": "default"
        })

    return {"models": models}


async def run_evaluation_task(
    task_id: str,
    model_id: str,
    benchmarks: List[str],
    user_id: int
):
    """Run evaluation task in background using subprocess"""
    try:
        # Update status to running
        async with _eval_lock:
            _eval_tasks[task_id]["status"] = "running"

        # Prepare input data
        input_data = {
            "model_id": model_id,
            "benchmarks": benchmarks
        }

        # Start subprocess
        process = await asyncio.create_subprocess_exec(
            str(NANOCHAT_VENV_PYTHON),
            str(EVAL_SCRIPT),
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

        results = {}

        # Read and process output
        if process.stdout:
            while True:
                line = await process.stdout.readline()
                if not line:
                    break

                try:
                    data = json.loads(line.decode('utf-8').strip())

                    if data.get("type") == "progress":
                        # Update progress
                        async with _eval_lock:
                            _eval_tasks[task_id]["progress"] = data.get("progress", 0.0)
                            _eval_tasks[task_id]["current_benchmark"] = data.get("current_benchmark")

                    elif data.get("type") == "result":
                        # Store benchmark result
                        benchmark = data.get("benchmark")
                        results[benchmark] = {
                            "accuracy": data.get("accuracy"),
                            "correct": data.get("correct"),
                            "total": data.get("total")
                        }

                    elif data.get("type") == "done":
                        # Evaluation complete
                        if data.get("results"):
                            results.update(data.get("results"))
                        break

                    elif data.get("type") == "error":
                        # Error occurred
                        error_msg = data.get("message", "Unknown error")
                        async with _eval_lock:
                            _eval_tasks[task_id]["status"] = "failed"
                            _eval_tasks[task_id]["error"] = error_msg
                            _eval_tasks[task_id]["completed_at"] = datetime.now().isoformat()
                        return

                except json.JSONDecodeError:
                    # Skip invalid JSON lines
                    continue

        # Wait for process to complete
        await process.wait()

        # Check stderr for errors
        if process.stderr:
            stderr = await process.stderr.read()
            if stderr and process.returncode != 0:
                error_msg = stderr.decode('utf-8')
                print(f"Evaluation subprocess error: {error_msg}")
                async with _eval_lock:
                    _eval_tasks[task_id]["status"] = "failed"
                    _eval_tasks[task_id]["error"] = error_msg
                    _eval_tasks[task_id]["completed_at"] = datetime.now().isoformat()
                return

        # Mark as completed
        async with _eval_lock:
            _eval_tasks[task_id]["status"] = "completed"
            _eval_tasks[task_id]["progress"] = 100.0
            _eval_tasks[task_id]["results"] = results
            _eval_tasks[task_id]["completed_at"] = datetime.now().isoformat()

        # Save results to disk
        result_file = EVAL_RESULTS_DIR / f"{task_id}.json"
        with open(result_file, "w") as f:
            json.dump(_eval_tasks[task_id], f, indent=2)

        print(f"Evaluation {task_id} completed: {results}")

    except Exception as e:
        print(f"Evaluation {task_id} failed: {e}")
        async with _eval_lock:
            _eval_tasks[task_id]["status"] = "failed"
            _eval_tasks[task_id]["error"] = str(e)
            _eval_tasks[task_id]["completed_at"] = datetime.now().isoformat()
