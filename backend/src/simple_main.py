"""Simplified main for debugging Railway deployment."""

import os
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .cache.redis_simple import cache_result, get_cached, set_cached
from .monitoring_simple import metrics, track_request
from .search_enhanced import get_search

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
    """Get a specific man page with caching."""
    import psycopg
    import json
    
    # Try cache first
    cache_key = f"man:{command}:{section}"
    cached = get_cached(cache_key)
    if cached:
        return cached
    
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
            
            result = {
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
            
            # Cache for 1 hour
            set_cached(cache_key, result, ttl=3600)
            
            return result
        else:
            return {"error": "Man page not found"}, 404
            
    except Exception as e:
        return {"error": str(e)[:200]}, 500

# Enhanced search with fuzzy matching
@app.get("/api/search")
async def search_man_pages(
    q: str = "",
    limit: int = 20,
    section: str = None,
    fuzzy: bool = True,
    threshold: float = 0.3
):
    """Search man pages with fuzzy matching."""
    try:
        search = get_search()
        return search.search(
            query=q,
            limit=limit,
            section=section,
            fuzzy=fuzzy,
            threshold=threshold
        )
    except Exception as e:
        logger.error(f"Search error: {e}")
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

# Add common commands endpoint
@app.get("/api/common")
async def get_common_commands():
    """Get common/popular commands."""
    import psycopg
    
    try:
        db_url = os.environ.get('DATABASE_URL', '')
        conn = psycopg.connect(db_url)
        cur = conn.cursor()
        
        cur.execute("""
            SELECT name, section, title, description, category
            FROM man_pages 
            WHERE is_common = true OR name IN (
                'ls', 'cd', 'grep', 'find', 'ssh', 'git', 'docker', 'curl',
                'vim', 'cat', 'echo', 'mkdir', 'rm', 'cp', 'mv', 'chmod',
                'ps', 'kill', 'tar', 'sed', 'awk', 'man', 'touch', 'head', 'tail'
            )
            ORDER BY name
            LIMIT 50
        """)
        
        results = cur.fetchall()
        cur.close()
        conn.close()
        
        return {
            "commands": [
                {
                    "name": r[0],
                    "section": r[1],
                    "title": r[2],
                    "description": r[3][:200] if r[3] else None,
                    "category": r[4]
                }
                for r in results
            ]
        }
        
    except Exception as e:
        return {"error": str(e)[:200]}, 500

# Add categories endpoint
@app.get("/api/categories")
async def get_categories():
    """Get all available categories with counts."""
    import psycopg
    
    try:
        db_url = os.environ.get('DATABASE_URL', '')
        conn = psycopg.connect(db_url)
        cur = conn.cursor()
        
        cur.execute("""
            SELECT category, COUNT(*) as count
            FROM man_pages 
            WHERE category IS NOT NULL
            GROUP BY category
            ORDER BY count DESC
        """)
        
        results = cur.fetchall()
        cur.close()
        conn.close()
        
        return {
            "categories": [
                {"category": r[0], "count": r[1]}
                for r in results
            ]
        }
        
    except Exception as e:
        return {"error": str(e)[:200]}, 500

# Add stats endpoint
@app.get("/api/stats")
@track_request
async def get_stats():
    """Get database statistics."""
    import psycopg
    
    # Try cache first
    cache_key = "stats:db"
    cached = get_cached(cache_key)
    if cached:
        metrics.record_cache_hit()
        return cached
    
    metrics.record_cache_miss()
    
    try:
        db_url = os.environ.get('DATABASE_URL', '')
        conn = psycopg.connect(db_url)
        cur = conn.cursor()
        
        # Get total count
        cur.execute("SELECT COUNT(*) FROM man_pages")
        total = cur.fetchone()[0]
        
        # Get sections count
        cur.execute("SELECT COUNT(DISTINCT section) FROM man_pages")
        sections = cur.fetchone()[0]
        
        # Get categories count
        cur.execute("SELECT COUNT(DISTINCT category) FROM man_pages WHERE category IS NOT NULL")
        categories = cur.fetchone()[0]
        
        # Get common commands count
        cur.execute("SELECT COUNT(*) FROM man_pages WHERE is_common = true")
        common = cur.fetchone()[0]
        
        cur.close()
        conn.close()
        
        result = {
            "total_pages": total,
            "total_sections": sections,
            "total_categories": categories,
            "common_commands": common
        }
        
        # Cache for 5 minutes
        set_cached(cache_key, result, ttl=300)
        
        return result
        
    except Exception as e:
        return {"error": str(e)[:200]}, 500

# Add metrics endpoint
@app.get("/api/metrics")
async def get_metrics():
    """Get application metrics."""
    return metrics.get_metrics()

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    logger.info(f"Starting server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)