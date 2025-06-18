"""
SQLite database connection and utilities
"""
import sqlite3
import json
import os
from contextlib import contextmanager
from typing import Optional, List, Dict, Any

DATABASE_PATH = os.getenv('DATABASE_PATH', '/data/betterman.db')

@contextmanager
def get_db():
    """Get SQLite database connection"""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

def search_man_pages(query: str, limit: int = 20) -> List[Dict[str, Any]]:
    """Search man pages using FTS5"""
    with get_db() as conn:
        # Use FTS5 for search
        cursor = conn.execute("""
            SELECT 
                mp.id,
                mp.name,
                mp.section,
                mp.title,
                mp.description,
                mp.category,
                mp.is_common,
                mp.complexity,
                snippet(man_pages_fts, 4, '<mark>', '</mark>', '...', 32) as snippet,
                rank
            FROM man_pages_fts
            JOIN man_pages mp ON man_pages_fts.rowid = mp.id
            WHERE man_pages_fts MATCH ?
            ORDER BY rank
            LIMIT ?
        """, (query, limit))
        
        results = []
        for row in cursor:
            results.append({
                'id': row['id'],
                'name': row['name'],
                'section': row['section'],
                'title': row['title'],
                'description': row['description'],
                'category': row['category'],
                'is_common': bool(row['is_common']),
                'complexity': row['complexity'],
                'snippet': row['snippet'],
                'score': -row['rank']  # Convert rank to score
            })
        
        return results

def get_man_page(name: str, section: Optional[int] = None) -> Optional[Dict[str, Any]]:
    """Get a specific man page"""
    with get_db() as conn:
        if section:
            cursor = conn.execute(
                "SELECT * FROM man_pages WHERE name = ? AND section = ?",
                (name, section)
            )
        else:
            cursor = conn.execute(
                "SELECT * FROM man_pages WHERE name = ? ORDER BY section LIMIT 1",
                (name,)
            )
        
        row = cursor.fetchone()
        if not row:
            return None
        
        # Convert row to dict and parse JSON fields
        page = dict(row)
        for field in ['keywords', 'see_also', 'related_commands', 'examples', 'options']:
            if page.get(field):
                try:
                    page[field] = json.loads(page[field])
                except json.JSONDecodeError:
                    page[field] = []
        
        page['is_common'] = bool(page.get('is_common'))
        
        return page

def get_common_commands(limit: int = 20) -> List[Dict[str, Any]]:
    """Get common commands"""
    with get_db() as conn:
        cursor = conn.execute("""
            SELECT name, section, title, description, category
            FROM man_pages
            WHERE is_common = 1
            ORDER BY name
            LIMIT ?
        """, (limit,))
        
        return [dict(row) for row in cursor]

def get_categories() -> List[Dict[str, Any]]:
    """Get all categories with counts"""
    with get_db() as conn:
        cursor = conn.execute("""
            SELECT category, COUNT(*) as count
            FROM man_pages
            GROUP BY category
            ORDER BY count DESC
        """)
        
        return [dict(row) for row in cursor]

def get_man_pages_by_category(category: str, limit: int = 50) -> List[Dict[str, Any]]:
    """Get man pages by category"""
    with get_db() as conn:
        cursor = conn.execute("""
            SELECT name, section, title, description
            FROM man_pages
            WHERE category = ?
            ORDER BY name
            LIMIT ?
        """, (category, limit))
        
        return [dict(row) for row in cursor]

def log_search(query: str, results_count: int, clicked_result: Optional[str] = None,
               user_ip: Optional[str] = None, user_agent: Optional[str] = None):
    """Log search analytics"""
    with get_db() as conn:
        conn.execute("""
            INSERT INTO search_analytics (query, results_count, clicked_result, user_ip, user_agent)
            VALUES (?, ?, ?, ?, ?)
        """, (query, results_count, clicked_result, user_ip, user_agent))
        conn.commit()

def get_search_analytics(days: int = 7) -> Dict[str, Any]:
    """Get search analytics for the last N days"""
    with get_db() as conn:
        # Popular searches
        cursor = conn.execute("""
            SELECT query, COUNT(*) as count
            FROM search_analytics
            WHERE created_at > datetime('now', '-' || ? || ' days')
            GROUP BY query
            ORDER BY count DESC
            LIMIT 10
        """, (days,))
        popular_searches = [dict(row) for row in cursor]
        
        # Search volume
        cursor = conn.execute("""
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as searches
            FROM search_analytics
            WHERE created_at > datetime('now', '-' || ? || ' days')
            GROUP BY DATE(created_at)
            ORDER BY date
        """, (days,))
        search_volume = [dict(row) for row in cursor]
        
        # Click-through rate
        cursor = conn.execute("""
            SELECT 
                COUNT(*) as total_searches,
                SUM(CASE WHEN clicked_result IS NOT NULL THEN 1 ELSE 0 END) as clicks
            FROM search_analytics
            WHERE created_at > datetime('now', '-' || ? || ' days')
        """, (days,))
        ctr_data = cursor.fetchone()
        ctr = (ctr_data['clicks'] / ctr_data['total_searches'] * 100) if ctr_data['total_searches'] > 0 else 0
        
        return {
            'popular_searches': popular_searches,
            'search_volume': search_volume,
            'click_through_rate': round(ctr, 2),
            'total_searches': ctr_data['total_searches']
        }

def get_database_stats() -> Dict[str, Any]:
    """Get database statistics"""
    with get_db() as conn:
        # Total pages
        cursor = conn.execute("SELECT COUNT(*) as count FROM man_pages")
        total_pages = cursor.fetchone()['count']
        
        # By section
        cursor = conn.execute("""
            SELECT section, COUNT(*) as count
            FROM man_pages
            GROUP BY section
            ORDER BY section
        """)
        by_section = {row['section']: row['count'] for row in cursor}
        
        # By category
        cursor = conn.execute("""
            SELECT category, COUNT(*) as count
            FROM man_pages
            GROUP BY category
            ORDER BY count DESC
            LIMIT 10
        """)
        by_category = [dict(row) for row in cursor]
        
        # Database size
        cursor = conn.execute("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()")
        db_size = cursor.fetchone()['size']
        
        return {
            'total_pages': total_pages,
            'by_section': by_section,
            'by_category': by_category,
            'database_size_mb': round(db_size / (1024 * 1024), 2)
        }