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

# Add database check endpoint
@app.get("/db-check")
async def db_check():
    """Check if database has man pages."""
    import psycopg
    from urllib.parse import urlparse
    
    try:
        db_url = os.environ.get('DATABASE_URL', '')
        # psycopg3 uses psycopg instead of psycopg2
        conn = psycopg.connect(db_url)
        cur = conn.cursor()
        
        # Count man pages
        cur.execute("SELECT COUNT(*) FROM man_pages")
        count = cur.fetchone()[0]
        
        # Get sample commands
        cur.execute("""
            SELECT name, section, category 
            FROM man_pages 
            WHERE name IN ('ls', 'grep', 'curl', 'git', 'tar')
            ORDER BY name
            LIMIT 5
        """)
        samples = cur.fetchall()
        
        cur.close()
        conn.close()
        
        return {
            "status": "connected",
            "man_pages_count": count,
            "sample_commands": [
                {"name": s[0], "section": s[1], "category": s[2]} 
                for s in samples
            ]
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e)[:200]
        }

# Add simple man page retrieval (support both URL patterns)
@app.get("/api/man/{command}/{section}")
@app.get("/api/man/commands/{command}/{section}")
async def get_man_page(command: str, section: str):
    """Get a specific man page."""
    import psycopg
    import json
    
    try:
        db_url = os.environ.get('DATABASE_URL', '')
        conn = psycopg.connect(db_url)
        cur = conn.cursor()
        
        cur.execute("""
            SELECT id, name, section, title, description, synopsis, 
                   content, category, meta_data, is_common
            FROM man_pages 
            WHERE name = %s AND section = %s
            LIMIT 1
        """, (command, section))
        
        row = cur.fetchone()
        cur.close()
        conn.close()
        
        if row:
            # Handle content field - it might already be a dict or a JSON string
            if row[6]:
                if isinstance(row[6], dict):
                    content_data = row[6]
                else:
                    try:
                        content_data = json.loads(row[6])
                    except (json.JSONDecodeError, TypeError):
                        content_data = {"raw": str(row[6])}
            else:
                content_data = {}
            
            return {
                "id": row[0],
                "name": row[1],
                "section": row[2],
                "title": row[3],
                "description": row[4],
                "synopsis": row[5],
                "content": content_data.get('raw', ''),
                "category": row[7],
                "is_common": row[9]
            }
        else:
            return {"error": "Man page not found"}, 404
            
    except Exception as e:
        return {"error": str(e)[:200]}, 500

# Add simple search
@app.get("/api/search")
async def search_man_pages(q: str = ""):
    """Search man pages."""
    import psycopg
    
    try:
        db_url = os.environ.get('DATABASE_URL', '')
        conn = psycopg.connect(db_url)
        cur = conn.cursor()
        
        if q:
            cur.execute("""
                SELECT name, section, title, description, category
                FROM man_pages 
                WHERE name ILIKE %s OR title ILIKE %s OR description ILIKE %s
                LIMIT 20
            """, (f"%{q}%", f"%{q}%", f"%{q}%"))
        else:
            cur.execute("""
                SELECT name, section, title, description, category
                FROM man_pages 
                WHERE is_common = true
                LIMIT 20
            """)
        
        results = cur.fetchall()
        cur.close()
        conn.close()
        
        return {
            "query": q,
            "results": [
                {
                    "name": r[0],
                    "section": r[1],
                    "title": r[2],
                    "description": r[3][:200] if r[3] else None,
                    "category": r[4]
                }
                for r in results
            ],
            "total": len(results)
        }
        
    except Exception as e:
        return {"error": str(e)[:200]}, 500

# Add list all commands endpoint
@app.get("/api/man/commands")
async def list_commands(limit: int = 100, offset: int = 0, category: str = None):
    """List all available man page commands."""
    import psycopg
    
    try:
        db_url = os.environ.get('DATABASE_URL', '')
        conn = psycopg.connect(db_url)
        cur = conn.cursor()
        
        if category:
            cur.execute("""
                SELECT DISTINCT name, section, title, category
                FROM man_pages 
                WHERE category = %s
                ORDER BY name
                LIMIT %s OFFSET %s
            """, (category, limit, offset))
        else:
            cur.execute("""
                SELECT DISTINCT name, section, title, category
                FROM man_pages 
                ORDER BY name
                LIMIT %s OFFSET %s
            """, (limit, offset))
        
        results = cur.fetchall()
        
        # Get total count
        if category:
            cur.execute("SELECT COUNT(DISTINCT name) FROM man_pages WHERE category = %s", (category,))
        else:
            cur.execute("SELECT COUNT(DISTINCT name) FROM man_pages")
        total = cur.fetchone()[0]
        
        cur.close()
        conn.close()
        
        return {
            "commands": [
                {
                    "name": r[0],
                    "section": r[1],
                    "title": r[2],
                    "category": r[3]
                }
                for r in results
            ],
            "total": total,
            "limit": limit,
            "offset": offset
        }
        
    except Exception as e:
        return {"error": str(e)[:200]}, 500

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    logger.info(f"Starting server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)