"""
Personalization service for user preferences and recommendations.
"""

import json
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from collections import Counter

from ..models.user import User, SearchHistory, UserFavorite
from ..models.document import Document
from ..models.oauth import (
    UserPreferences, UserCollection, LearningProgress, 
    CommandSnippet
)
from ..cache.cache_manager import CacheManager
import logging

logger = logging.getLogger(__name__)


class PersonalizationService:
    """Service for managing user personalization features."""
    
    def __init__(self, db, cache=None):
        self.db = db
        self.cache = cache
    
    def get_or_create_preferences(self, user: User) -> UserPreferences:
        """Get or create user preferences."""
        prefs = self.db.query(UserPreferences).filter(
            UserPreferences.user_id == user.id
        ).first()
        
        if not prefs:
            prefs = UserPreferences(user_id=user.id)
            self.db.add(prefs)
            self.db.commit()
            self.db.refresh(prefs)
        
        return prefs
    
    def update_preferences(
        self, user: User, preferences: Dict[str, Any]
    ) -> UserPreferences:
        """Update user preferences."""
        prefs = self.get_or_create_preferences(user)
        
        # Update allowed fields
        allowed_fields = [
            'theme', 'language', 'timezone', 'keyboard_shortcuts',
            'font_size', 'line_height', 'code_theme', 
            'enable_animations', 'enable_sounds', 'enable_notifications',
            'show_profile_publicly', 'share_statistics'
        ]
        
        for field, value in preferences.items():
            if field in allowed_fields:
                if field == 'keyboard_shortcuts':
                    # Validate and store as JSON
                    if isinstance(value, dict):
                        setattr(prefs, field, json.dumps(value))
                else:
                    setattr(prefs, field, value)
        
        self.db.commit()
        self.db.refresh(prefs)
        
        # Clear cache
        if self.cache:
            self.cache.delete(f"user_preferences:{user.id}")
        
        logger.info(f"Updated preferences for user {user.username}")
        
        return prefs
    
    def get_recommendations(
        self, user: User, limit: int = 10
    ) -> List[Document]:
        """Get personalized document recommendations."""
        # Cache key
        cache_key = f"recommendations:{user.id}"
        
        if self.cache:
            cached = self.cache.get(cache_key)
            if cached:
                doc_ids = cached
                return self.db.query(Document).filter(
                    Document.id.in_(doc_ids)
                ).all()
        
        recommendations = []
        
        # Get user's search history
        recent_searches = self.db.query(SearchHistory).filter(
            SearchHistory.user_id == user.id
        ).order_by(
            desc(SearchHistory.created_at)
        ).limit(50).all()
        
        # Get user's favorites
        favorites = self.db.query(UserFavorite).filter(
            UserFavorite.user_id == user.id
        ).all()
        
        favorite_ids = {fav.document_id for fav in favorites}
        
        # Extract common terms from searches
        search_terms = []
        for search in recent_searches:
            search_terms.extend(search.query.lower().split())
        
        # Get most common search terms
        term_counts = Counter(search_terms)
        common_terms = [term for term, count in term_counts.most_common(10)]
        
        if common_terms:
            # Find related documents
            for term in common_terms[:5]:  # Top 5 terms
                related = self.db.query(Document).filter(
                    (Document.name.contains(term)) | 
                    (Document.title.contains(term))
                ).filter(
                    ~Document.id.in_(favorite_ids)  # Exclude favorites
                ).limit(5).all()
                
                recommendations.extend(related)
        
        # Get popular documents in same sections as favorites
        if favorites:
            sections = [fav.document.section for fav in favorites if fav.document]
            section_counts = Counter(sections)
            
            for section, _ in section_counts.most_common(3):
                popular = self.db.query(Document).filter(
                    Document.section == section,
                    ~Document.id.in_(favorite_ids)
                ).order_by(
                    desc(Document.view_count)
                ).limit(5).all()
                
                recommendations.extend(popular)
        
        # Remove duplicates and limit
        seen = set()
        unique_recommendations = []
        for doc in recommendations:
            if doc.id not in seen:
                seen.add(doc.id)
                unique_recommendations.append(doc)
                if len(unique_recommendations) >= limit:
                    break
        
        # Cache results
        if self.cache and unique_recommendations:
            doc_ids = [doc.id for doc in unique_recommendations]
            self.cache.set(cache_key, doc_ids, expire=3600)  # 1 hour
        
        return unique_recommendations
    
    def get_or_create_learning_progress(self, user: User) -> LearningProgress:
        """Get or create learning progress."""
        progress = self.db.query(LearningProgress).filter(
            LearningProgress.user_id == user.id
        ).first()
        
        if not progress:
            progress = LearningProgress(user_id=user.id)
            self.db.add(progress)
            self.db.commit()
            self.db.refresh(progress)
        
        return progress
    
    def track_document_view(self, user: User, document: Document):
        """Track when user views a document."""
        progress = self.get_or_create_learning_progress(user)
        
        # Update counters
        progress.documents_viewed += 1
        
        # Check if it's a new command
        if document.name not in self._get_learned_commands(progress):
            progress.commands_learned += 1
        
        # Update streak
        today = datetime.utcnow().date()
        if progress.last_activity_date:
            last_activity = progress.last_activity_date.date()
            
            if last_activity == today:
                # Already active today
                pass
            elif last_activity == today - timedelta(days=1):
                # Consecutive day
                progress.current_streak += 1
                if progress.current_streak > progress.longest_streak:
                    progress.longest_streak = progress.current_streak
            else:
                # Streak broken
                progress.current_streak = 1
        else:
            # First activity
            progress.current_streak = 1
            progress.longest_streak = 1
        
        progress.last_activity_date = datetime.utcnow()
        
        # Check for achievements
        self._check_achievements(user, progress)
        
        self.db.commit()
        
        logger.info(f"Tracked document view for user {user.username}: {document.name}")
    
    def create_collection(
        self, user: User, name: str, description: Optional[str] = None,
        is_public: bool = False
    ) -> UserCollection:
        """Create a new collection."""
        collection = UserCollection(
            user_id=user.id,
            name=name,
            description=description,
            is_public=is_public
        )
        
        self.db.add(collection)
        self.db.commit()
        self.db.refresh(collection)
        
        logger.info(f"Created collection '{name}' for user {user.username}")
        
        return collection
    
    def add_to_collection(
        self, user: User, collection_id: int, document_id: int
    ) -> UserCollection:
        """Add document to collection."""
        collection = self.db.query(UserCollection).filter(
            UserCollection.id == collection_id,
            UserCollection.user_id == user.id
        ).first()
        
        if not collection:
            raise ValueError("Collection not found")
        
        # Get current items
        items = json.loads(collection.items)
        
        if document_id not in items:
            items.append(document_id)
            collection.items = json.dumps(items)
            self.db.commit()
        
        return collection
    
    def create_snippet(
        self, user: User, title: str, command: str,
        description: Optional[str] = None,
        category: Optional[str] = None,
        tags: Optional[List[str]] = None,
        is_public: bool = False
    ) -> CommandSnippet:
        """Create a command snippet."""
        snippet = CommandSnippet(
            user_id=user.id,
            title=title,
            command=command,
            description=description,
            category=category,
            tags=json.dumps(tags) if tags else None,
            is_public=is_public
        )
        
        self.db.add(snippet)
        self.db.commit()
        self.db.refresh(snippet)
        
        logger.info(f"Created snippet '{title}' for user {user.username}")
        
        return snippet
    
    def search_snippets(
        self, user: User, query: Optional[str] = None,
        category: Optional[str] = None,
        include_public: bool = True
    ) -> List[CommandSnippet]:
        """Search user's snippets."""
        q = self.db.query(CommandSnippet)
        
        if include_public:
            q = q.filter(
                (CommandSnippet.user_id == user.id) |
                (CommandSnippet.is_public == True)
            )
        else:
            q = q.filter(CommandSnippet.user_id == user.id)
        
        if query:
            q = q.filter(
                (CommandSnippet.title.contains(query)) |
                (CommandSnippet.command.contains(query)) |
                (CommandSnippet.description.contains(query))
            )
        
        if category:
            q = q.filter(CommandSnippet.category == category)
        
        return q.order_by(desc(CommandSnippet.usage_count)).all()
    
    def use_snippet(self, snippet: CommandSnippet):
        """Track snippet usage."""
        snippet.usage_count += 1
        snippet.last_used = datetime.utcnow()
        self.db.commit()
    
    def _get_learned_commands(self, progress: LearningProgress) -> set:
        """Get set of learned command names."""
        # This would ideally track in a separate table
        # For now, we'll estimate from favorites and search history
        return set()
    
    def _check_achievements(self, user: User, progress: LearningProgress):
        """Check and award achievements."""
        achievements = json.loads(progress.achievements)
        new_achievements = []
        
        # Document milestones
        doc_milestones = [10, 50, 100, 500, 1000]
        for milestone in doc_milestones:
            achievement_id = f"docs_{milestone}"
            if progress.documents_viewed >= milestone and achievement_id not in achievements:
                new_achievements.append({
                    "id": achievement_id,
                    "name": f"Documentation Explorer",
                    "description": f"Viewed {milestone} documents",
                    "points": milestone // 10,
                    "earned_at": datetime.utcnow().isoformat()
                })
        
        # Streak achievements
        streak_milestones = [7, 30, 100]
        for milestone in streak_milestones:
            achievement_id = f"streak_{milestone}"
            if progress.longest_streak >= milestone and achievement_id not in achievements:
                new_achievements.append({
                    "id": achievement_id,
                    "name": f"Dedicated Learner",
                    "description": f"Maintained a {milestone}-day streak",
                    "points": milestone * 2,
                    "earned_at": datetime.utcnow().isoformat()
                })
        
        # Add new achievements
        if new_achievements:
            for achievement in new_achievements:
                achievements[achievement["id"]] = achievement
                progress.achievement_points += achievement["points"]
            
            progress.achievements = json.dumps(achievements)
            
            # Log achievements
            for achievement in new_achievements:
                logger.info(
                    f"User {user.username} earned achievement: {achievement['name']}"
                )