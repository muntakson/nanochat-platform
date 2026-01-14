"""
NanoChat Platform - Main FastAPI Application

A Google Colab-style notebook platform for running nanochat code
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base
from app.api import auth, projects, notebooks, execute, inference, ipynb, chat, eval

# Create database tables
Base.metadata.create_all(bind=engine)

# Create FastAPI app
app = FastAPI(
    title="NanoChat Platform API",
    description="Backend API for NanoChat educational platform",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers (no /api prefix - that's handled by nginx)
app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
app.include_router(projects.router, prefix="/projects", tags=["Projects"])
app.include_router(notebooks.router, prefix="/notebooks", tags=["Notebooks"])
app.include_router(execute.router, prefix="/execute", tags=["Execute"])
app.include_router(inference.router, prefix="/inference", tags=["Inference"])
app.include_router(ipynb.router, prefix="/ipynb", tags=["IPYNB Files"])
app.include_router(chat.router, prefix="/chat", tags=["Chat"])
app.include_router(eval.router, prefix="/eval", tags=["Evaluation"])


@app.get("/")
def root():
    """Root endpoint"""
    return {
        "message": "NanoChat Platform API",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001, reload=True)
