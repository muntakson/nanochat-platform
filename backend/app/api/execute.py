"""Code execution API endpoints"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import subprocess
import asyncio
import json
import os
import sys
import tempfile
from pathlib import Path
from app.auth import get_current_active_user
from app.models import User

router = APIRouter()

# Nanochat paths
NANOCHAT_PATH = Path("/var/www/gpt2/nanochat")
NANOCHAT_VENV_PYTHON = NANOCHAT_PATH / ".venv" / "bin" / "python"


class ExecuteRequest(BaseModel):
    code: str
    timeout: Optional[int] = 300  # 5 minutes default
    working_dir: Optional[str] = None


class ExecuteResponse(BaseModel):
    output: str
    error: Optional[str] = None
    return_code: int


async def execute_code_stream(code: str, timeout: int = 300, working_dir: Optional[str] = None):
    """Execute Python code and stream output"""
    try:
        # Create temporary file for code
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
            f.write(code)
            temp_file = f.name

        # Set working directory
        if working_dir:
            cwd = Path(working_dir)
            if not cwd.exists():
                cwd = NANOCHAT_PATH
        else:
            cwd = NANOCHAT_PATH

        # Use nanochat's virtual environment Python
        if NANOCHAT_VENV_PYTHON.exists():
            python_executable = str(NANOCHAT_VENV_PYTHON)
        else:
            python_executable = sys.executable

        # Start process
        process = await asyncio.create_subprocess_exec(
            python_executable,
            temp_file,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(cwd),
            env={
                **os.environ,
                "PYTHONUNBUFFERED": "1",
                "PYTHONPATH": str(NANOCHAT_PATH)
            }
        )

        # Stream output
        async def stream_output():
            try:
                # Read stdout
                while True:
                    if process.stdout:
                        line = await asyncio.wait_for(
                            process.stdout.readline(),
                            timeout=timeout
                        )
                        if not line:
                            break
                        text = line.decode('utf-8', errors='replace')
                        yield f"data: {json.dumps({'type': 'stdout', 'text': text})}\n\n"

                # Wait for process to complete
                await asyncio.wait_for(process.wait(), timeout=timeout)

                # Read stderr
                if process.stderr:
                    stderr_data = await process.stderr.read()
                    if stderr_data:
                        error_text = stderr_data.decode('utf-8', errors='replace')
                        yield f"data: {json.dumps({'type': 'stderr', 'text': error_text})}\n\n"

                # Send completion
                yield f"data: {json.dumps({'type': 'done', 'return_code': process.returncode})}\n\n"

            except asyncio.TimeoutError:
                process.kill()
                yield f"data: {json.dumps({'type': 'error', 'text': 'Execution timeout'})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'text': str(e)})}\n\n"
            finally:
                # Clean up temp file
                try:
                    os.unlink(temp_file)
                except:
                    pass

        return stream_output()

    except Exception as e:
        async def error_stream():
            yield f"data: {json.dumps({'type': 'error', 'text': str(e)})}\n\n"
        return error_stream()


@router.post("/stream")
async def execute_code_stream_endpoint(
    request: ExecuteRequest,
    current_user: User = Depends(get_current_active_user)
):
    """Execute Python code and stream output (SSE)"""
    return StreamingResponse(
        await execute_code_stream(request.code, request.timeout, request.working_dir),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


@router.post("/", response_model=ExecuteResponse)
async def execute_code_endpoint(
    request: ExecuteRequest,
    current_user: User = Depends(get_current_active_user)
):
    """Execute Python code and return complete output"""
    try:
        # Create temporary file for code
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
            f.write(request.code)
            temp_file = f.name

        # Set working directory
        if request.working_dir:
            cwd = Path(request.working_dir)
            if not cwd.exists():
                cwd = NANOCHAT_PATH
        else:
            cwd = NANOCHAT_PATH

        # Use nanochat's virtual environment Python
        if NANOCHAT_VENV_PYTHON.exists():
            python_executable = str(NANOCHAT_VENV_PYTHON)
        else:
            python_executable = sys.executable

        # Execute code
        result = subprocess.run(
            [python_executable, temp_file],
            capture_output=True,
            text=True,
            timeout=request.timeout,
            cwd=str(cwd),
            env={
                **os.environ,
                "PYTHONUNBUFFERED": "1",
                "PYTHONPATH": str(NANOCHAT_PATH)
            }
        )

        # Clean up
        try:
            os.unlink(temp_file)
        except:
            pass

        return ExecuteResponse(
            output=result.stdout,
            error=result.stderr if result.stderr else None,
            return_code=result.returncode
        )

    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=408, detail="Execution timeout")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Execution failed: {str(e)}")


@router.get("/nanochat-status")
async def get_nanochat_status(
    current_user: User = Depends(get_current_active_user)
):
    """Get nanochat environment status"""
    return {
        "nanochat_path": str(NANOCHAT_PATH),
        "nanochat_exists": NANOCHAT_PATH.exists(),
        "venv_python_exists": NANOCHAT_VENV_PYTHON.exists(),
        "python_executable": str(NANOCHAT_VENV_PYTHON if NANOCHAT_VENV_PYTHON.exists() else sys.executable)
    }
