# NanoChat Platform

A Google Colab-style notebook platform for running nanochat code with Jupyter-style cells.

## Features

- 🔐 User authentication and registration
- 📁 Project management
- 📓 Jupyter-style notebooks with code cells
- ▶️ Execute Python code with nanochat environment
- 💾 Save and manage multiple notebooks
- 🔄 Real-time code execution with streaming output

## Quick Start

### Backend

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Run the server
python main.py
```

Backend will run on `http://localhost:8001`

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev
```

Frontend will run on `http://localhost:3006`

## Usage

1. Open `http://localhost:3006` in your browser
2. Register a new account
3. Create a new project
4. Create notebooks and start coding!

## API Documentation

Visit `http://localhost:8001/docs` for interactive API documentation.

## Architecture

- **Backend**: FastAPI + SQLAlchemy + SQLite
- **Frontend**: React + Vite + Monaco Editor
- **Authentication**: JWT tokens
- **Code Execution**: Subprocess with timeout controls

## Security Notes

- Change `SECRET_KEY` in `backend/app/auth.py` for production
- Code execution uses nanochat's virtual environment
- Timeout controls prevent runaway processes
- User isolation through authentication

## Database

SQLite database will be created at `backend/data/nanochat_platform.db`

## Nanochat Integration

The platform executes code using nanochat's virtual environment at `/var/www/gpt2/nanochat/.venv`

Students can:
- Train models using nanochat scripts
- Run inference with trained models
- Evaluate model performance
- Experiment with nanochat code

## Development

Created: 2026-01-14
