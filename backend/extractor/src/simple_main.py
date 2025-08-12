"""Simplified main for debugging Railway deployment."""

import os
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(title="BetterMan API", version="1.0.0")

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
        "status": "online"
    }

@app.get("/health")
async def health_check():
    """Simple health check."""
    return {
        "status": "healthy",
        "service": "betterman-api",
        "environment": os.environ.get('ENVIRONMENT', 'unknown')
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    logger.info(f"Starting server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)