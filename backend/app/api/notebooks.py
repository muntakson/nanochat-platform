"""Notebook management API endpoints"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional, Any
from datetime import datetime
from app.database import get_db
from app.models import User, Project, Notebook
from app.auth import get_current_active_user

router = APIRouter()


class NotebookCreate(BaseModel):
    name: str
    project_id: int


class CellData(BaseModel):
    type: str  # 'code' or 'markdown'
    content: str
    output: Optional[str] = None
    execution_count: Optional[int] = None


class NotebookUpdate(BaseModel):
    name: Optional[str] = None
    cells: Optional[List[CellData]] = None


class NotebookResponse(BaseModel):
    id: int
    name: str
    project_id: int
    cells: List[dict]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.post("/", response_model=NotebookResponse)
def create_notebook(
    notebook_data: NotebookCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Create a new notebook"""
    # Verify project ownership
    project = db.query(Project).filter(
        Project.id == notebook_data.project_id,
        Project.owner_id == current_user.id
    ).first()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Create notebook with default cell
    default_cells = [
        {
            "type": "code",
            "content": "# Welcome to NanoChat Notebook\nimport sys\nprint(f'Python {sys.version}')\nprint('Ready to run nanochat code!')",
            "output": None,
            "execution_count": None
        }
    ]

    db_notebook = Notebook(
        name=notebook_data.name,
        project_id=notebook_data.project_id,
        cells=default_cells
    )
    db.add(db_notebook)
    db.commit()
    db.refresh(db_notebook)
    return db_notebook


@router.get("/project/{project_id}", response_model=List[NotebookResponse])
def list_notebooks(
    project_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """List all notebooks in a project"""
    # Verify project ownership
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.owner_id == current_user.id
    ).first()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    notebooks = db.query(Notebook).filter(Notebook.project_id == project_id).all()
    return notebooks


@router.get("/{notebook_id}", response_model=NotebookResponse)
def get_notebook(
    notebook_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get a specific notebook"""
    notebook = db.query(Notebook).join(Project).filter(
        Notebook.id == notebook_id,
        Project.owner_id == current_user.id
    ).first()

    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")

    return notebook


@router.put("/{notebook_id}", response_model=NotebookResponse)
def update_notebook(
    notebook_id: int,
    notebook_data: NotebookUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update a notebook"""
    notebook = db.query(Notebook).join(Project).filter(
        Notebook.id == notebook_id,
        Project.owner_id == current_user.id
    ).first()

    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")

    if notebook_data.name is not None:
        notebook.name = notebook_data.name

    if notebook_data.cells is not None:
        # Convert Pydantic models to dicts
        notebook.cells = [cell.dict() for cell in notebook_data.cells]

    db.commit()
    db.refresh(notebook)
    return notebook


@router.delete("/{notebook_id}")
def delete_notebook(
    notebook_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Delete a notebook"""
    notebook = db.query(Notebook).join(Project).filter(
        Notebook.id == notebook_id,
        Project.owner_id == current_user.id
    ).first()

    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")

    db.delete(notebook)
    db.commit()
    return {"message": "Notebook deleted successfully"}


@router.post("/{notebook_id}/cells")
def add_cell(
    notebook_id: int,
    cell: CellData,
    index: Optional[int] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Add a new cell to a notebook"""
    notebook = db.query(Notebook).join(Project).filter(
        Notebook.id == notebook_id,
        Project.owner_id == current_user.id
    ).first()

    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")

    cells = notebook.cells or []
    cell_dict = cell.dict()

    if index is None:
        cells.append(cell_dict)
    else:
        cells.insert(index, cell_dict)

    notebook.cells = cells
    db.commit()
    db.refresh(notebook)
    return notebook


@router.delete("/{notebook_id}/cells/{cell_index}")
def delete_cell(
    notebook_id: int,
    cell_index: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Delete a cell from a notebook"""
    notebook = db.query(Notebook).join(Project).filter(
        Notebook.id == notebook_id,
        Project.owner_id == current_user.id
    ).first()

    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")

    cells = notebook.cells or []
    if cell_index < 0 or cell_index >= len(cells):
        raise HTTPException(status_code=400, detail="Invalid cell index")

    cells.pop(cell_index)
    notebook.cells = cells
    db.commit()
    return {"message": "Cell deleted successfully"}
