"""Analytics tracking functions."""

import hashlib
import logging
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import text

from .models import PageView, SearchAnalytics, FeatureUsage
from ..models.document import Document

logger = logging.getLogger(__name__)


class AnalyticsTracker:
    """Handle analytics tracking operations."""
    
    def __init__(self, db):
        self.db = db
    
    def track_page_view(
        self,
        document_id: int,
        user_id: Optional[int] = None,
        session_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        referrer: Optional[str] = None
    ) -> None:
        """Track a document page view."""
        try:
            # Hash IP address for privacy
            ip_hash = None
            if ip_address:
                ip_hash = hashlib.sha256(ip_address.encode()).hexdigest()[:16]
            
            # Create page view record
            page_view = PageView(
                document_id=document_id,
                user_id=user_id,
                session_id=session_id,
                ip_hash=ip_hash,
                user_agent=user_agent,
                referrer=referrer
            )
            self.db.add(page_view)
            
            # Update document view count and last accessed
            # Use explicit SQL to avoid SQLAlchemy ORM issues
            self.db.execute(
                "UPDATE documents SET view_count = COALESCE(view_count, 0) + 1, "
                "last_accessed = ?, access_count = COALESCE(access_count, 0) + 1 "
                "WHERE id = ?",
                (datetime.utcnow(), document_id)
            )
            
            self.db.commit()
            logger.info(f"Tracked page view for document {document_id}")
            
        except Exception as e:
            logger.error(f"Error tracking page view: {e}")
            self.db.rollback()
    
    def track_search(
        self,
        query: str,
        results_count: int,
        user_id: Optional[int] = None,
        session_id: Optional[str] = None,
        duration_ms: Optional[int] = None
    ) -> Optional[int]:
        """Track a search query."""
        try:
            search = SearchAnalytics(
                query=query,
                results_count=results_count,
                user_id=user_id,
                session_id=session_id,
                search_duration_ms=duration_ms
            )
            self.db.add(search)
            self.db.commit()
            logger.info(f"Tracked search: '{query}' with {results_count} results")
            return search.id
            
        except Exception as e:
            logger.error(f"Error tracking search: {e}")
            self.db.rollback()
            return None
    
    def track_search_click(
        self,
        search_id: int,
        document_id: int,
        position: int
    ) -> None:
        """Track when a user clicks on a search result."""
        try:
            search = self.db.query(SearchAnalytics).filter(
                SearchAnalytics.id == search_id
            ).first()
            
            if search:
                search.clicked_result_id = document_id
                search.clicked_position = position
                self.db.commit()
                logger.info(f"Tracked search click: search {search_id}, doc {document_id}")
                
        except Exception as e:
            logger.error(f"Error tracking search click: {e}")
            self.db.rollback()
    
    def track_feature_usage(
        self,
        user_id: int,
        feature_name: str,
        action: str,
        metadata: Optional[dict] = None
    ) -> None:
        """Track feature usage."""
        try:
            import json
            
            feature = FeatureUsage(
                user_id=user_id,
                feature_name=feature_name,
                action=action,
                feature_metadata=json.dumps(metadata) if metadata else None
            )
            self.db.add(feature)
            self.db.commit()
            logger.info(f"Tracked feature usage: {feature_name}/{action} by user {user_id}")
            
        except Exception as e:
            logger.error(f"Error tracking feature usage: {e}")
            self.db.rollback()
    
    def get_popular_commands(self, limit: int = 10, days: int = 7) -> list:
        """Get popular commands based on page views."""
        try:
            # Query popular documents based on recent views
            query = text("""
                SELECT 
                    d.id,
                    d.name,
                    d.title,
                    d.summary,
                    d.section,
                    COUNT(DISTINCT pv.id) as view_count,
                    COUNT(DISTINCT pv.user_id) as unique_users,
                    MAX(pv.created_at) as last_viewed
                FROM documents d
                JOIN page_views pv ON d.id = pv.document_id
                WHERE pv.created_at >= datetime('now', '-' || :days || ' days')
                GROUP BY d.id, d.name, d.title, d.summary, d.section
                ORDER BY view_count DESC
                LIMIT :limit
            """)
            
            results = self.db.execute(query, {"days": days, "limit": limit}).fetchall()
            
            popular_commands = []
            for row in results:
                # Calculate trend (simplified - in production, compare with previous period)
                trend = "stable"
                
                popular_commands.append({
                    "id": str(row[0]),
                    "name": row[1],
                    "title": row[2],
                    "summary": row[3],
                    "section": row[4],
                    "view_count": row[5],
                    "unique_users": row[6],
                    "trend": trend
                })
            
            return popular_commands
            
        except Exception as e:
            logger.error(f"Error getting popular commands: {e}")
            return []
    
    def get_trending_searches(self, limit: int = 10, days: int = 1) -> list:
        """Get trending search queries."""
        try:
            query = text("""
                SELECT 
                    query,
                    COUNT(*) as search_count,
                    AVG(results_count) as avg_results,
                    COUNT(DISTINCT user_id) as unique_users
                FROM search_analytics
                WHERE created_at >= datetime('now', '-' || :days || ' days')
                GROUP BY query
                ORDER BY search_count DESC
                LIMIT :limit
            """)
            
            results = self.db.execute(query, {"days": days, "limit": limit}).fetchall()
            
            return [
                {
                    "query": row[0],
                    "count": row[1],
                    "avg_results": row[2],
                    "unique_users": row[3]
                }
                for row in results
            ]
            
        except Exception as e:
            logger.error(f"Error getting trending searches: {e}")
            return []
    
    def get_analytics_overview(self, days: int = 7) -> dict:
        """Get analytics overview."""
        try:
            # Total searches
            total_searches = self.db.execute(
                text("""
                    SELECT COUNT(*) FROM search_analytics
                    WHERE created_at >= datetime('now', '-' || :days || ' days')
                """),
                {"days": days}
            ).scalar() or 0
            
            # Total page views
            total_views = self.db.execute(
                text("""
                    SELECT COUNT(*) FROM page_views
                    WHERE created_at >= datetime('now', '-' || :days || ' days')
                """),
                {"days": days}
            ).scalar() or 0
            
            # Active users
            active_users = self.db.execute(
                text("""
                    SELECT COUNT(DISTINCT user_id) FROM (
                        SELECT user_id FROM page_views 
                        WHERE created_at >= datetime('now', '-' || :days || ' days') 
                        AND user_id IS NOT NULL
                        UNION
                        SELECT user_id FROM search_analytics 
                        WHERE created_at >= datetime('now', '-' || :days || ' days')
                        AND user_id IS NOT NULL
                    )
                """),
                {"days": days}
            ).scalar() or 0
            
            return {
                "total_searches": total_searches,
                "total_page_views": total_views,
                "active_users": active_users,
                "popular_commands": self.get_popular_commands(limit=6, days=days),
                "trending_searches": self.get_trending_searches(limit=5, days=days)
            }
            
        except Exception as e:
            logger.error(f"Error getting analytics overview: {e}")
            return {
                "total_searches": 0,
                "total_page_views": 0,
                "active_users": 0,
                "popular_commands": [],
                "trending_searches": []
            }