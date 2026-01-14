# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NanoChat Platform is a Jupyter-style notebook interface for educational LLM training using Karpathy's nanochat framework. It provides a web-based environment where students can execute Python code, train models, and learn about LLMs through interactive notebooks.

## Development Commands

### Backend (FastAPI)

```bash
# Start backend server (development with auto-reload)
cd backend
./venv_new/bin/python main.py
# OR
./venv_new/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload

# Backend runs on http://localhost:8001
# API docs available at http://localhost:8001/docs
```

### Frontend (React + Vite)

```bash
# Start frontend development server
cd frontend
npm run dev
# Frontend runs on http://localhost:3006

# Build for production
npm run build

# Preview production build
npm run preview
```

### Database

```bash
# Database is automatically created on first run at:
# backend/data/nanochat_platform.db

# To reset database, delete the file and restart backend
rm backend/data/nanochat_platform.db
```

## Architecture Overview

### Backend Structure

**FastAPI Application** (`backend/main.py`):
- Modular router-based architecture
- Six main routers: auth, projects, notebooks, execute, inference, ipynb
- No `/api` prefix in routes (nginx handles this in production)
- SQLAlchemy ORM with SQLite database

**Key Backend Components**:

1. **Authentication** (`app/auth.py`, `app/api/auth.py`):
   - JWT token-based auth with pbkdf2_sha256 password hashing
   - Token stored in localStorage on frontend
   - All API routes require authentication except `/auth/register` and `/auth/login`

2. **Code Execution** (`app/api/execute.py`):
   - Executes Python code in isolated subprocess using nanochat's venv
   - Uses `/var/www/gpt2/nanochat/.venv/bin/python` by default
   - Streams output via Server-Sent Events (SSE)
   - Default timeout: 300 seconds
   - Sets `PYTHONPATH` to nanochat directory for imports

3. **Notebook Files** (`app/api/ipynb.py`):
   - Loads `.ipynb` files from `backend/ipynb_files/` directory
   - Converts Jupyter notebook format to platform's cell format
   - Includes `nanochat_tutorial.ipynb` (30-cell LLM tutorial)

4. **Data Models** (`app/models.py`):
   - `User` → `Project` (one-to-many) → `Notebook` (one-to-many)
   - Notebooks store cells as JSON array: `[{type: 'code'|'markdown', content: str, output: str}]`
   - Cascade deletes: deleting user deletes all projects and notebooks

### Frontend Structure

**React SPA with React Router**:
- Routes: `/login`, `/register`, `/dashboard`, `/notebook/:id`
- Protected routes use `PrivateRoute` wrapper
- Global auth state managed by `AuthContext`

**Key Frontend Components**:

1. **CodeCell** (`src/components/CodeCell.jsx`):
   - Dual-mode component: handles both code and markdown cells
   - **Code cells**: Monaco editor + Run button + streaming output
   - **Markdown cells**: ReactMarkdown rendering + Edit/Preview toggle (no Run button)
   - Streams execution output using Fetch API with ReadableStream
   - Markdown styled with `CodeCell.css` (H1-H5, lists, code blocks, etc.)

2. **NotebookPage** (`src/pages/NotebookPage.jsx`):
   - Manages array of cells with add/delete/update operations
   - "📂 Open" button loads `.ipynb` files from backend
   - Auto-save on cell changes
   - Toolbar: Open, Run All, Clear Output, Add Cell

3. **Authentication** (`src/store/AuthContext.jsx`):
   - Provides `user`, `login`, `logout` to all components
   - Stores JWT token in localStorage
   - Axios interceptor adds Authorization header to all requests

### Request Flow

**Code Execution Flow**:
1. User edits code in Monaco editor (CodeCell)
2. Click Run → POST `/api/execute/stream` with code
3. Backend creates temp file, executes with nanochat Python
4. Output streams back via SSE (data: {type: 'stdout', text: '...'})
5. Frontend reads stream, updates output in real-time
6. Cell state updated, auto-saved to database

**Notebook Cell Storage**:
- Cells stored as JSON in `notebooks.cells` column
- Format: `[{type: 'code', content: 'print("hi")', output: 'hi\n', execution_count: 1}]`
- Frontend maintains cell array in React state
- Changes batched and saved on blur or explicit save

### Production Deployment Notes

**Nginx Configuration**:
- Reverse proxy strips `/api` prefix before forwarding to backend
- Frontend: `location / → localhost:3006`
- Backend: `location /api/ → rewrite ^/api/(.*) /$1 → localhost:8001`
- SSL handled by nginx (Let's Encrypt)

**Backend Environment**:
- Uses `venv_new` (not `venv`) for Python dependencies
- Password hashing changed from bcrypt to pbkdf2_sha256 for compatibility
- SECRET_KEY in `app/auth.py` should be changed for production

**NanoChat Integration**:
- Platform assumes nanochat installed at `/var/www/gpt2/nanochat`
- Uses nanochat's virtual environment for code execution
- Students can import nanochat modules, train models, run evaluations
- Tutorial notebook updated for local GPU (no Google Colab dependencies)

### Important Path Constants

Backend:
- `NANOCHAT_PATH = Path("/var/www/gpt2/nanochat")`
- `NANOCHAT_VENV_PYTHON = NANOCHAT_PATH / ".venv" / "bin" / "python"`
- `IPYNB_DIR = backend/ipynb_files/`
- Database: `backend/data/nanochat_platform.db`

Frontend:
- API base URL: `/api/` (relative, proxied by nginx in production)
- Token storage: `localStorage.getItem('token')`

### Adding New Features

**New API Endpoint**:
1. Create router file in `backend/app/api/`
2. Import and register in `backend/main.py`: `app.include_router(new_router, prefix="/route")`
3. Add authentication: `current_user: User = Depends(get_current_user)`

**New Frontend Page**:
1. Create component in `frontend/src/pages/`
2. Add route in `frontend/src/App.jsx`
3. Wrap with `<PrivateRoute>` if authentication required

**Add Jupyter Notebooks**:
1. Copy `.ipynb` file to `backend/ipynb_files/`
2. Available immediately in "📂 Open" dialog
3. Converts automatically to platform format on load

### Common Issues

**Backend won't start**: Check if port 8001 is in use (`lsof -i :8001`)

**Frontend can't reach API**: Verify nginx config strips `/api` prefix, backend routes have no prefix

**Code execution fails**: Verify nanochat venv exists at `/var/www/gpt2/nanochat/.venv/bin/python`

**Markdown not rendering**: Check `react-markdown` dependency installed, CSS imported in CodeCell.jsx

**Database locked**: SQLite can't handle concurrent writes; consider PostgreSQL for multi-user production

### Security Considerations

- All routes except auth require JWT authentication
- Code execution is sandboxed but runs as platform user (not Docker/VM isolated)
- Timeout prevents runaway processes (default 300s)
- Filename sanitization prevents directory traversal in ipynb loader
- User isolation: users only see their own projects/notebooks
- CORS set to `allow_origins=["*"]` for development (restrict in production)
