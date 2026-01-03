"""
Debug endpoint to check database status
Add this temporarily to main.py to debug the issue
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging

from .db.postgres_connection import get_db

logger = logging.getLogger(__name__)
debug_router = APIRouter()


@debug_router.get("/debug/db-status")
async def debug_db_status(db: Session = Depends(get_db)):
    """Check database status and man_pages table"""
    try:
        result = {}
        
        # Check connection
        db.execute(text("SELECT 1"))
        result["connection"] = "OK"
        
        # Check if man_pages table exists
        check_table = db.execute(text("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'man_pages'
            );
        """)).scalar()
        
        result["man_pages_table_exists"] = check_table
        
        if check_table:
            # Count man pages
            count = db.execute(text("SELECT COUNT(*) FROM man_pages")).scalar()
            result["total_man_pages"] = count
            
            # Get sample commands
            samples = db.execute(text("""
                SELECT name, section, category 
                FROM man_pages 
                WHERE name IN ('ls', 'grep', 'curl', 'git', 'tar')
                ORDER BY name
                LIMIT 5
            """)).fetchall()
            
            result["sample_commands"] = [
                {"name": s[0], "section": s[1], "category": s[2]} 
                for s in samples
            ]
            
            # Get categories
            categories = db.execute(text("""
                SELECT category, COUNT(*) as count 
                FROM man_pages 
                GROUP BY category 
                ORDER BY count DESC 
                LIMIT 5
            """)).fetchall()
            
            result["top_categories"] = [
                {"category": c[0], "count": c[1]} 
                for c in categories
            ]
        
        # Check what tables exist
        tables = db.execute(text("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name
        """)).fetchall()
        
        result["all_tables"] = [t[0] for t in tables]
        
        return result
        
    except Exception as e:
        logger.error(f"Debug endpoint error: {e}")
        return {
            "error": str(e),
            "error_type": type(e).__name__
        }


@debug_router.get("/debug/test-search")
async def debug_test_search(q: str = "ls", db: Session = Depends(get_db)):
    """Test basic search functionality"""
    try:
        # Simple LIKE search
        results = db.execute(text("""
            SELECT name, section, description 
            FROM man_pages 
            WHERE name ILIKE :pattern
            LIMIT 5
        """), {"pattern": f"%{q}%"}).fetchall()
        
        return {
            "query": q,
            "results": [
                {"name": r[0], "section": r[1], "description": r[2][:100] if r[2] else None}
                for r in results
            ]
        }
    except Exception as e:
        return {"error": str(e)}