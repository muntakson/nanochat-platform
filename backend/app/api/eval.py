"""
Evaluation API endpoints - integrates with nanochat evaluation system
"""
import sys
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import asyncio
import json
import uuid
from datetime import datetime

# Add nanochat to path
NANOCHAT_PATH = Path("/var/www/gpt2/nanochat")
sys.path.insert(0, str(NANOCHAT_PATH))

from app.auth import get_current_user
from app.models import User

router = APIRouter()

# Store running evaluation tasks
_eval_tasks: Dict[str, Dict[str, Any]] = {}
_eval_lock = asyncio.Lock()

# Cache directory for evaluation results
EVAL_RESULTS_DIR = Path("/var/www/gpt2/nanochat-platform/backend/data/eval_results")
EVAL_RESULTS_DIR.mkdir(parents=True, exist_ok=True)


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
    """Start an evaluation task"""
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
        request.use_cached
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
    checkpoint_dir = Path.home() / ".cache" / "nanochat"

    models = []

    # Check for standard checkpoints
    for checkpoint_type in ["base", "mid", "sft", "rl"]:
        checkpoint_path = checkpoint_dir / f"{checkpoint_type}_checkpoints"
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

    return {"models": models}


async def run_evaluation_task(
    task_id: str,
    model_id: str,
    benchmarks: List[str],
    use_cached: bool
):
    """Run evaluation task in background"""
    try:
        # Update status to running
        async with _eval_lock:
            _eval_tasks[task_id]["status"] = "running"

        # Import nanochat modules
        import torch
        from nanochat.checkpoint_manager import load_model
        from nanochat.engine import Engine
        from nanochat.common import autodetect_device_type

        # Load model
        print(f"Loading model {model_id} for evaluation...")
        device_type = autodetect_device_type()

        # Parse model_id (e.g., "sft-d20" -> source="sft", depth=20)
        if "-d" in model_id:
            source, depth_str = model_id.split("-")
            depth = int(depth_str.replace("d", ""))
        else:
            source = model_id
            depth = None

        model, tokenizer, meta = await asyncio.to_thread(
            load_model,
            source,
            device=device_type
        )
        engine = Engine(model, tokenizer, device=device_type)

        results = {}

        # Run each benchmark
        for i, benchmark in enumerate(benchmarks):
            async with _eval_lock:
                _eval_tasks[task_id]["current_benchmark"] = benchmark
                _eval_tasks[task_id]["progress"] = (i / len(benchmarks)) * 100

            print(f"Running {benchmark} evaluation...")

            # Run benchmark evaluation
            try:
                result = await run_benchmark(engine, tokenizer, benchmark)
                results[benchmark] = result
            except Exception as e:
                print(f"Error running {benchmark}: {e}")
                results[benchmark] = {"error": str(e)}

        # Update status to completed
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


async def run_benchmark(engine, tokenizer, benchmark: str) -> Dict[str, Any]:
    """Run a specific benchmark evaluation"""
    # Import evaluation tasks
    from tasks.gsm8k import GSM8K
    from tasks.mmlu import MMLU
    from tasks.humaneval import HumanEval
    from tasks.arc import ARC

    benchmark_map = {
        "gsm8k": GSM8K,
        "mmlu": MMLU,
        "humaneval": HumanEval,
        "arc": ARC
    }

    if benchmark not in benchmark_map:
        raise ValueError(f"Unknown benchmark: {benchmark}")

    # Create task instance
    task_class = benchmark_map[benchmark]
    task = task_class()

    # Run evaluation (simplified - you may need to adapt this)
    correct = 0
    total = 0

    # Get a sample of examples
    examples = list(task.get_examples())[:100]  # Limit to 100 for speed

    for example in examples:
        # Generate response
        prompt = example.get("prompt", "")
        tokens = tokenizer.encode(prompt)

        # Generate up to 512 tokens
        response_tokens = []
        for _ in range(512):
            next_token = await asyncio.to_thread(
                engine.generate_token,
                tokens,
                temperature=0.0,  # Deterministic for eval
                top_p=1.0
            )

            if next_token == tokenizer.eot_token:
                break

            tokens.append(next_token)
            response_tokens.append(next_token)

        response = tokenizer.decode(response_tokens)

        # Check if correct
        is_correct = task.check_answer(example, response)
        if is_correct:
            correct += 1
        total += 1

    accuracy = (correct / total) * 100 if total > 0 else 0

    return {
        "accuracy": accuracy,
        "correct": correct,
        "total": total,
        "benchmark": benchmark
    }
