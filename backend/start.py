#!/usr/bin/env python3
"""Startup script for FastAPI application."""

import os
import sys
import uvicorn

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    
    # Check if we should use simple mode for debugging
    if os.environ.get("USE_SIMPLE_MODE", "false").lower() == "true":
        print(f"Starting SIMPLE FastAPI server on port {port}...")
        uvicorn.run(
            "src.simple_main:app",
            host="0.0.0.0",
            port=port,
            reload=False
        )
    else:
        print(f"Starting FastAPI server on port {port}...")
        try:
            uvicorn.run(
                "src.main:app",
                host="0.0.0.0",
                port=port,
                reload=False
            )
        except Exception as e:
            print(f"Failed to start main app: {e}")
            print("Falling back to simple mode...")
            uvicorn.run(
                "src.simple_main:app",
                host="0.0.0.0",
                port=port,
                reload=False
            )