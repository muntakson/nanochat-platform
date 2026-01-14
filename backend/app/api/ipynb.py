"""
API endpoints for managing .ipynb files
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import os
import json
from pathlib import Path

from ..database import get_db
from ..auth import get_current_user
from ..models import User

router = APIRouter()

# Directory containing .ipynb files
IPYNB_DIR = Path(__file__).parent.parent.parent / "ipynb_files"


@router.get("/list")
async def list_ipynb_files(current_user: User = Depends(get_current_user)):
    """
    List all available .ipynb files
    """
    if not IPYNB_DIR.exists():
        return {"files": []}

    files = []
    for file_path in IPYNB_DIR.glob("*.ipynb"):
        try:
            # Get file info
            stat = file_path.stat()
            files.append({
                "name": file_path.name,
                "size": stat.st_size,
                "modified": stat.st_mtime,
            })
        except Exception as e:
            print(f"Error reading {file_path}: {e}")
            continue

    # Sort by name
    files.sort(key=lambda x: x["name"])

    return {"files": files}


@router.get("/load/{filename}")
async def load_ipynb_file(
    filename: str,
    current_user: User = Depends(get_current_user)
):
    """
    Load a .ipynb file and return its contents
    """
    # Sanitize filename to prevent directory traversal
    filename = os.path.basename(filename)
    if not filename.endswith('.ipynb'):
        raise HTTPException(status_code=400, detail="Invalid file type")

    file_path = IPYNB_DIR / filename

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            notebook_data = json.load(f)

        # Extract cells and convert to our format
        cells = []
        if 'cells' in notebook_data:
            for cell in notebook_data['cells']:
                cell_type = cell.get('cell_type', 'code')
                source = cell.get('source', [])

                # Join source lines if it's a list
                if isinstance(source, list):
                    source = ''.join(source)

                cells.append({
                    'type': cell_type,
                    'code': source,
                    'output': '',
                    'execution_count': cell.get('execution_count', None)
                })

        return {
            "filename": filename,
            "cells": cells,
            "metadata": notebook_data.get('metadata', {})
        }

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid notebook format")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading file: {str(e)}")
