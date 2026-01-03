"""Main FastAPI application for BetterMan API - Railway optimized."""

import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from src.config import get_settings
from src.db.postgres_connection import init_db, check_database_health

# Initialize settings
settings = get_settings()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle."""
    logger.info("Starting BetterMan API...")
    
    try:
        # Initialize database
        logger.info("Initializing database connection...")
        init_db()
        logger.info("Database initialized successfully")
        
    except Exception as e:
        logger.error(f"Startup failed: {e}")
        # Don't raise - let Railway handle retries
    
    yield
    
    logger.info("Shutting down BetterMan API...")


# Create FastAPI app
app = FastAPI(
    title="BetterMan API",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
cors_origins = os.environ.get('CORS_ORIGINS', '*').split(',')
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "BetterMan API",
        "version": "1.0.0",
        "status": "online",
        "environment": settings.ENVIRONMENT
    }


@app.get("/health")
async def health_check():
    """Health check endpoint for Railway."""
    try:
        db_status = await check_database_health()
        
        return {
            "status": "healthy" if db_status["status"] == "healthy" else "degraded",
            "service": "betterman-api",
            "database": db_status,
            "environment": settings.ENVIRONMENT
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return JSONResponse(
            status_code=503,
            content={
                "status": "unhealthy",
                "error": str(e)
            }
        )


@app.get("/api/test")
async def test_endpoint():
    """Test endpoint to verify API is working."""
    return {
        "message": "API is working!",
        "database_url": os.environ.get('DATABASE_URL', 'Not configured')[:20] + "...",
        "redis_url": "configured" if os.environ.get('REDIS_URL') else "not configured",
        "cors_origins": cors_origins
    }


if __name__ == "__main__":
    import uvicorn
    
    port = int(os.environ.get("PORT", 8000))
    host = "0.0.0.0"
    
    logger.info(f"Starting server on {host}:{port}")
    
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=False,
        log_level="info"
    )