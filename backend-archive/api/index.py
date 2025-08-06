"""
Vercel serverless function entry point for FastAPI
"""
import sys
import os

# Add the backend directory to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from src.main import app

# Export the FastAPI app for Vercel
handler = app