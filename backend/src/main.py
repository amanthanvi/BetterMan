from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from pathlib import Path

from .api.routes import router
from .db.direct_init import init_db

# Create data directory if it doesn't exist
data_dir = Path(__file__).parent.parent / "data"
data_dir.mkdir(exist_ok=True)

# Initialize database with direct SQL
init_db()

app = FastAPI(
    title="BetterMan API",
    description="Modern API for Linux man pages",
    version="0.1.0",
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(router, prefix="/api")


@app.get("/")
async def root():
    """Root endpoint returning API information."""
    return {
        "name": "BetterMan API",
        "version": "0.1.0",
        "description": "Modern API for Linux man pages",
    }


@app.get("/health")
async def health_check():
    """Health check endpoint for container orchestration."""
    return {"status": "healthy"}
