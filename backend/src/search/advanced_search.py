"""
Advanced search functionality with fuzzy matching, relevance scoring, and ML features.
"""

import re
import math
import logging
from typing import List, Dict, Any, Optional, Tuple, Set
from datetime import datetime, timedelta
from collections import defaultdict, Counter
import difflib
from sqlalchemy.orm import Session
from sqlalchemy import text, func, and_, or_

from ..models.document import Document, Section
from ..cache.redis_cache import get_redis_cache, CacheKeys, cache_key_wrapper
from ..analytics.tracker import AnalyticsTracker

logger = logging.getLogger(__name__)


class AdvancedSearchEngine:
    """Enhanced search engine with advanced features."""
    
    def __init__(self, db: Session):
        self.db = db
        self.cache = get_redis_cache()
        self.analytics = AnalyticsTracker(db)
        
        # Search configuration
        self.min_query_length = 2
        self.max_query_length = 200
        self.fuzzy_threshold = 0.7
        self.snippet_length = 150
        
        # Weights for scoring
        self.weights = {
            "name_exact": 10.0,
            "name_fuzzy": 5.0,
            "title_exact": 7.0,
            "title_fuzzy": 3.5,
            "summary": 3.0,
            "content": 1.0,
            "popularity": 2.0,
            "recency": 1.5,
            "section_match": 2.0
        }
        
        # Common words to ignore in search
        self.stop_words = {
            "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
            "of", "with", "by", "from", "up", "about", "into", "through", "during",
            "before", "after", "above", "below", "between", "under", "again",
            "further", "then", "once", "that", "this", "these", "those", "is",
            "are", "was", "were", "been", "be", "have", "has", "had", "do", "does",
            "did", "will", "would", "could", "should", "may", "might", "must", "shall"
        }
    
    async def search(
        self,
        query: str,
        section: Optional[int] = None,
        filters: Optional[Dict[str, Any]] = None,
        limit: int = 20,
        offset: int = 0,
        user_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Perform advanced search with multiple strategies.
        
        Args:
            query: Search query
            section: Optional section filter
            filters: Additional filters
            limit: Maximum results
            offset: Results offset
            user_id: Optional user ID for personalization
            
        Returns:
            Search results with metadata
        """
        # Validate and normalize query
        query = self._normalize_query(query)
        if not query:
            return self._empty_results(limit, offset)
        
        # Check cache
        cache_key = CacheKeys.search_results(query, section, offset // limit + 1, filters)
        cached = self.cache.get(cache_key)
        if cached:
            logger.debug(f"Search cache hit for: {query}")
            return cached
        
        # Extract search terms
        terms = self._extract_terms(query)
        if not terms:
            return self._empty_results(limit, offset)
        
        # Perform search
        results = await self._multi_strategy_search(terms, section, filters, limit, offset)
        
        # Enhance results
        results = self._enhance_results(results, terms, user_id)
        
        # Track search
        if user_id:
            self.analytics.track_search(user_id, query, len(results["results"]))
        
        # Cache results
        self.cache.set(cache_key, results, expire=300)  # 5 minutes
        
        return results
    
    async def suggest(
        self,
        query: str,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Get search suggestions based on partial query.
        
        Args:
            query: Partial search query
            limit: Maximum suggestions
            
        Returns:
            List of suggestions
        """
        query = query.strip().lower()
        if len(query) < 2:
            return []
        
        # Check cache
        cache_key = f"suggest:{query}:{limit}"
        cached = self.cache.get(cache_key)
        if cached:
            return cached
        
        suggestions = []
        
        # Get name-based suggestions
        name_suggestions = self.db.query(
            Document.name,
            Document.title,
            func.count(Document.id).label('count')
        ).filter(
            func.lower(Document.name).like(f"{query}%")
        ).group_by(
            Document.name,
            Document.title
        ).order_by(
            func.count(Document.id).desc()
        ).limit(limit).all()
        
        for suggestion in name_suggestions:
            suggestions.append({
                "value": suggestion.name,
                "label": suggestion.title or suggestion.name,
                "type": "command",
                "count": suggestion.count
            })
        
        # Get popular searches starting with query
        if len(suggestions) < limit:
            # This would query a search history table
            # For now, we'll add some common patterns
            common_patterns = [
                "list", "show", "get", "set", "create", "delete", "update",
                "install", "remove", "config", "help", "man", "info"
            ]
            
            for pattern in common_patterns:
                if pattern.startswith(query) and len(suggestions) < limit:
                    suggestions.append({
                        "value": pattern,
                        "label": f"Search for '{pattern}'",
                        "type": "pattern",
                        "count": 0
                    })
        
        # Cache suggestions
        self.cache.set(cache_key, suggestions, expire=3600)  # 1 hour
        
        return suggestions[:limit]
    
    async def related_documents(
        self,
        document_id: int,
        limit: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Find related documents using various strategies.
        
        Args:
            document_id: Source document ID
            limit: Maximum related documents
            
        Returns:
            List of related documents
        """
        # Get source document
        doc = self.db.query(Document).filter(Document.id == document_id).first()
        if not doc:
            return []
        
        # Check cache
        cache_key = f"related:{document_id}:{limit}"
        cached = self.cache.get(cache_key)
        if cached:
            return cached
        
        related = []
        
        # Strategy 1: Same section documents
        if doc.section:
            same_section = self.db.query(Document).filter(
                Document.section == doc.section,
                Document.id != document_id
            ).order_by(
                Document.access_count.desc()
            ).limit(limit).all()
            
            for rel_doc in same_section:
                related.append({
                    "id": rel_doc.id,
                    "name": rel_doc.name,
                    "title": rel_doc.title,
                    "summary": rel_doc.summary,
                    "section": rel_doc.section,
                    "reason": "same_section",
                    "score": 0.8
                })
        
        # Strategy 2: Similar names (using fuzzy matching)
        if len(related) < limit:
            all_docs = self.db.query(
                Document.id,
                Document.name,
                Document.title,
                Document.summary,
                Document.section
            ).filter(
                Document.id != document_id
            ).all()
            
            name_scores = []
            for other_doc in all_docs:
                score = difflib.SequenceMatcher(
                    None,
                    doc.name.lower(),
                    other_doc.name.lower()
                ).ratio()
                
                if score > 0.6:
                    name_scores.append((other_doc, score))
            
            # Sort by score and add top matches
            name_scores.sort(key=lambda x: x[1], reverse=True)
            for other_doc, score in name_scores[:limit - len(related)]:
                related.append({
                    "id": other_doc.id,
                    "name": other_doc.name,
                    "title": other_doc.title,
                    "summary": other_doc.summary,
                    "section": other_doc.section,
                    "reason": "similar_name",
                    "score": score
                })
        
        # Strategy 3: Content similarity (if we have content vectors)
        # This would use embeddings or TF-IDF vectors
        # For now, we'll use keyword overlap
        
        if len(related) < limit and doc.summary:
            doc_keywords = set(self._extract_terms(doc.summary))
            
            if doc_keywords:
                keyword_matches = []
                
                other_docs = self.db.query(Document).filter(
                    Document.id != document_id,
                    Document.summary.isnot(None)
                ).limit(100).all()
                
                for other_doc in other_docs:
                    other_keywords = set(self._extract_terms(other_doc.summary or ""))
                    overlap = len(doc_keywords & other_keywords)
                    
                    if overlap > 0:
                        score = overlap / max(len(doc_keywords), len(other_keywords))
                        keyword_matches.append((other_doc, score))
                
                # Sort and add top matches
                keyword_matches.sort(key=lambda x: x[1], reverse=True)
                for other_doc, score in keyword_matches[:limit - len(related)]:
                    if not any(r["id"] == other_doc.id for r in related):
                        related.append({
                            "id": other_doc.id,
                            "name": other_doc.name,
                            "title": other_doc.title,
                            "summary": other_doc.summary,
                            "section": other_doc.section,
                            "reason": "content_similarity",
                            "score": score
                        })
        
        # Sort by score
        related.sort(key=lambda x: x["score"], reverse=True)
        
        # Cache results
        self.cache.set(cache_key, related[:limit], expire=3600)  # 1 hour
        
        return related[:limit]
    
    def _normalize_query(self, query: str) -> str:
        """Normalize search query."""
        # Remove extra whitespace
        query = " ".join(query.split())
        
        # Truncate if too long
        if len(query) > self.max_query_length:
            query = query[:self.max_query_length]
        
        return query.strip()
    
    def _extract_terms(self, text: str) -> List[str]:
        """Extract meaningful terms from text."""
        # Convert to lowercase
        text = text.lower()
        
        # Extract words
        words = re.findall(r'\b[a-z0-9_-]+\b', text)
        
        # Filter out stop words and short words
        terms = []
        for word in words:
            if len(word) >= 2 and word not in self.stop_words:
                terms.append(word)
        
        return terms
    
    async def _multi_strategy_search(
        self,
        terms: List[str],
        section: Optional[int],
        filters: Optional[Dict[str, Any]],
        limit: int,
        offset: int
    ) -> Dict[str, Any]:
        """Perform search using multiple strategies."""
        # Collect all matches with scores
        all_matches = defaultdict(lambda: {
            "scores": defaultdict(float),
            "matches": defaultdict(list)
        })
        
        # Strategy 1: Exact name match
        exact_name_results = self._search_exact_name(terms, section)
        for doc in exact_name_results:
            all_matches[doc.id]["doc"] = doc
            all_matches[doc.id]["scores"]["name_exact"] = self.weights["name_exact"]
            all_matches[doc.id]["matches"]["name"] = terms
        
        # Strategy 2: Fuzzy name match
        fuzzy_name_results = self._search_fuzzy_name(terms, section)
        for doc, score in fuzzy_name_results:
            all_matches[doc.id]["doc"] = doc
            all_matches[doc.id]["scores"]["name_fuzzy"] = self.weights["name_fuzzy"] * score
            all_matches[doc.id]["matches"]["name_fuzzy"] = terms
        
        # Strategy 3: Title search
        title_results = self._search_title(terms, section)
        for doc, match_type, score in title_results:
            all_matches[doc.id]["doc"] = doc
            if match_type == "exact":
                all_matches[doc.id]["scores"]["title_exact"] = self.weights["title_exact"]
            else:
                all_matches[doc.id]["scores"]["title_fuzzy"] = self.weights["title_fuzzy"] * score
            all_matches[doc.id]["matches"]["title"] = terms
        
        # Strategy 4: Summary search
        summary_results = self._search_summary(terms, section)
        for doc, score in summary_results:
            all_matches[doc.id]["doc"] = doc
            all_matches[doc.id]["scores"]["summary"] = self.weights["summary"] * score
            all_matches[doc.id]["matches"]["summary"] = terms
        
        # Strategy 5: Content search (if needed)
        if len(all_matches) < limit + offset:
            content_results = self._search_content(terms, section, limit * 2)
            for doc, score in content_results:
                all_matches[doc.id]["doc"] = doc
                all_matches[doc.id]["scores"]["content"] = self.weights["content"] * score
                all_matches[doc.id]["matches"]["content"] = terms
        
        # Calculate final scores
        scored_results = []
        for doc_id, data in all_matches.items():
            doc = data["doc"]
            
            # Sum component scores
            total_score = sum(data["scores"].values())
            
            # Add popularity boost
            if doc.access_count > 0:
                popularity_score = math.log(1 + doc.access_count) / 10.0
                total_score += self.weights["popularity"] * popularity_score
            
            # Add recency boost
            if hasattr(doc, 'updated_at') and doc.updated_at:
                days_old = (datetime.utcnow() - doc.updated_at).days
                recency_score = 1.0 / (1.0 + days_old / 365.0)
                total_score += self.weights["recency"] * recency_score
            
            # Section match bonus
            if section and doc.section == section:
                total_score += self.weights["section_match"]
            
            scored_results.append({
                "doc": doc,
                "score": total_score,
                "matches": dict(data["matches"]),
                "score_breakdown": dict(data["scores"])
            })
        
        # Sort by score
        scored_results.sort(key=lambda x: x["score"], reverse=True)
        
        # Apply filters
        if filters:
            scored_results = self._apply_filters(scored_results, filters)
        
        # Paginate
        total = len(scored_results)
        paginated = scored_results[offset:offset + limit]
        
        # Format results
        results = []
        for item in paginated:
            doc = item["doc"]
            snippet = self._generate_snippet(doc, terms)
            
            results.append({
                "id": doc.id,
                "name": doc.name,
                "title": doc.title or doc.name,
                "summary": doc.summary,
                "section": doc.section,
                "score": round(item["score"], 2),
                "snippet": snippet,
                "highlights": self._generate_highlights(doc, terms),
                "matches": item["matches"],
                "cache_status": doc.cache_status
            })
        
        return {
            "results": results,
            "total": total,
            "page": (offset // limit) + 1,
            "per_page": limit,
            "query": " ".join(terms),
            "filters": filters or {}
        }
    
    def _search_exact_name(self, terms: List[str], section: Optional[int]) -> List[Document]:
        """Search for exact name matches."""
        query = self.db.query(Document)
        
        if section:
            query = query.filter(Document.section == section)
        
        # Look for documents where name contains all terms
        for term in terms:
            query = query.filter(func.lower(Document.name).contains(term))
        
        return query.limit(50).all()
    
    def _search_fuzzy_name(self, terms: List[str], section: Optional[int]) -> List[Tuple[Document, float]]:
        """Search for fuzzy name matches."""
        # Get all documents
        query = self.db.query(Document)
        if section:
            query = query.filter(Document.section == section)
        
        docs = query.limit(500).all()
        
        # Calculate fuzzy scores
        results = []
        query_str = " ".join(terms)
        
        for doc in docs:
            score = difflib.SequenceMatcher(
                None,
                query_str.lower(),
                doc.name.lower()
            ).ratio()
            
            if score >= self.fuzzy_threshold:
                results.append((doc, score))
        
        # Sort by score
        results.sort(key=lambda x: x[1], reverse=True)
        
        return results[:50]
    
    def _search_title(self, terms: List[str], section: Optional[int]) -> List[Tuple[Document, str, float]]:
        """Search in titles."""
        results = []
        
        # Exact matches
        query = self.db.query(Document).filter(Document.title.isnot(None))
        if section:
            query = query.filter(Document.section == section)
        
        for term in terms:
            query = query.filter(func.lower(Document.title).contains(term))
        
        exact_matches = query.limit(50).all()
        for doc in exact_matches:
            results.append((doc, "exact", 1.0))
        
        # Fuzzy matches
        if len(results) < 50:
            all_titled = self.db.query(Document).filter(
                Document.title.isnot(None)
            ).limit(500).all()
            
            query_str = " ".join(terms)
            fuzzy_matches = []
            
            for doc in all_titled:
                if doc not in [r[0] for r in results]:
                    score = difflib.SequenceMatcher(
                        None,
                        query_str.lower(),
                        doc.title.lower()
                    ).ratio()
                    
                    if score >= self.fuzzy_threshold:
                        fuzzy_matches.append((doc, "fuzzy", score))
            
            fuzzy_matches.sort(key=lambda x: x[2], reverse=True)
            results.extend(fuzzy_matches[:50 - len(results)])
        
        return results
    
    def _search_summary(self, terms: List[str], section: Optional[int]) -> List[Tuple[Document, float]]:
        """Search in summaries."""
        query = self.db.query(Document).filter(Document.summary.isnot(None))
        
        if section:
            query = query.filter(Document.section == section)
        
        # Build OR conditions for terms
        conditions = []
        for term in terms:
            conditions.append(func.lower(Document.summary).contains(term))
        
        if conditions:
            query = query.filter(or_(*conditions))
        
        results = []
        for doc in query.limit(100).all():
            # Calculate relevance score based on term frequency
            summary_lower = doc.summary.lower()
            matches = sum(1 for term in terms if term in summary_lower)
            score = matches / len(terms)
            results.append((doc, score))
        
        results.sort(key=lambda x: x[1], reverse=True)
        return results[:50]
    
    def _search_content(self, terms: List[str], section: Optional[int], limit: int) -> List[Tuple[Document, float]]:
        """Search in full content."""
        query = self.db.query(Document)
        
        if section:
            query = query.filter(Document.section == section)
        
        # For content search, we'll use OR to avoid being too restrictive
        conditions = []
        for term in terms:
            conditions.append(func.lower(Document.raw_content).contains(term))
        
        if conditions:
            query = query.filter(or_(*conditions))
        
        results = []
        for doc in query.limit(limit).all():
            # Calculate relevance score
            content_lower = (doc.raw_content or "").lower()
            matches = sum(1 for term in terms if term in content_lower)
            score = matches / len(terms)
            
            # Reduce score for content matches (they're less relevant)
            score *= 0.5
            
            results.append((doc, score))
        
        results.sort(key=lambda x: x[1], reverse=True)
        return results
    
    def _apply_filters(self, results: List[Dict], filters: Dict[str, Any]) -> List[Dict]:
        """Apply additional filters to results."""
        filtered = results
        
        # Filter by section if specified
        if "sections" in filters and filters["sections"]:
            sections = filters["sections"]
            if not isinstance(sections, list):
                sections = [sections]
            filtered = [r for r in filtered if r["doc"].section in sections]
        
        # Filter by cache status
        if "cached_only" in filters and filters["cached_only"]:
            filtered = [r for r in filtered if r["doc"].cache_status == "cached"]
        
        # Filter by access count (popularity)
        if "min_popularity" in filters:
            min_pop = filters["min_popularity"]
            filtered = [r for r in filtered if r["doc"].access_count >= min_pop]
        
        return filtered
    
    def _generate_snippet(self, doc: Document, terms: List[str]) -> str:
        """Generate relevant snippet with term highlighting."""
        # Try summary first
        if doc.summary:
            return self._highlight_terms(doc.summary[:self.snippet_length], terms)
        
        # Fall back to content
        if doc.raw_content:
            # Find first occurrence of any term
            content_lower = doc.raw_content.lower()
            best_pos = len(content_lower)
            
            for term in terms:
                pos = content_lower.find(term)
                if pos != -1 and pos < best_pos:
                    best_pos = pos
            
            # Extract snippet around the term
            start = max(0, best_pos - 50)
            end = min(len(doc.raw_content), best_pos + self.snippet_length - 50)
            
            snippet = doc.raw_content[start:end]
            if start > 0:
                snippet = "..." + snippet
            if end < len(doc.raw_content):
                snippet += "..."
            
            return self._highlight_terms(snippet, terms)
        
        return ""
    
    def _generate_highlights(self, doc: Document, terms: List[str]) -> Dict[str, List[str]]:
        """Generate highlighted sections for each field."""
        highlights = {}
        
        # Highlight in name
        if any(term in doc.name.lower() for term in terms):
            highlights["name"] = [self._highlight_terms(doc.name, terms)]
        
        # Highlight in title
        if doc.title and any(term in doc.title.lower() for term in terms):
            highlights["title"] = [self._highlight_terms(doc.title, terms)]
        
        # Highlight in summary
        if doc.summary:
            summary_highlights = []
            summary_lower = doc.summary.lower()
            
            for term in terms:
                if term in summary_lower:
                    # Find all occurrences
                    pos = 0
                    while pos < len(summary_lower):
                        pos = summary_lower.find(term, pos)
                        if pos == -1:
                            break
                        
                        # Extract context
                        start = max(0, pos - 30)
                        end = min(len(doc.summary), pos + len(term) + 30)
                        
                        highlight = doc.summary[start:end]
                        if start > 0:
                            highlight = "..." + highlight
                        if end < len(doc.summary):
                            highlight += "..."
                        
                        summary_highlights.append(self._highlight_terms(highlight, [term]))
                        pos += len(term)
            
            if summary_highlights:
                highlights["summary"] = summary_highlights[:3]  # Limit to 3 highlights
        
        return highlights
    
    def _highlight_terms(self, text: str, terms: List[str]) -> str:
        """Highlight search terms in text."""
        highlighted = text
        
        # Sort terms by length (longest first) to handle overlaps
        sorted_terms = sorted(terms, key=len, reverse=True)
        
        for term in sorted_terms:
            # Case-insensitive replacement with highlight tags
            pattern = re.compile(re.escape(term), re.IGNORECASE)
            highlighted = pattern.sub(f"<mark>{term}</mark>", highlighted)
        
        return highlighted
    
    def _enhance_results(self, results: Dict[str, Any], terms: List[str], user_id: Optional[int]) -> Dict[str, Any]:
        """Enhance search results with additional data."""
        # Add search metadata
        results["metadata"] = {
            "terms": terms,
            "processing_time": 0,  # Would be measured in real implementation
            "strategies_used": ["exact", "fuzzy", "title", "summary", "content"],
            "personalized": user_id is not None
        }
        
        # Add facets (counts by section)
        if results["results"]:
            section_counts = Counter()
            for result in results["results"]:
                if result["section"]:
                    section_counts[result["section"]] += 1
            
            results["facets"] = {
                "sections": dict(section_counts)
            }
        
        # Add suggestions for no/few results
        if results["total"] < 5:
            results["suggestions"] = self._generate_suggestions(terms)
        
        return results
    
    def _generate_suggestions(self, terms: List[str]) -> List[str]:
        """Generate alternative search suggestions."""
        suggestions = []
        
        # Suggest removing terms if query is long
        if len(terms) > 3:
            suggestions.append(" ".join(terms[:2]))
        
        # Suggest common variations
        for term in terms:
            # Plural/singular
            if term.endswith('s'):
                suggestions.append(term[:-1])
            else:
                suggestions.append(term + 's')
            
            # Common typos
            if len(term) > 4:
                # Character swap
                if len(term) > 1:
                    swapped = term[1] + term[0] + term[2:]
                    suggestions.append(swapped)
        
        # Remove duplicates and limit
        unique_suggestions = list(set(suggestions))[:5]
        
        return unique_suggestions
    
    def _empty_results(self, limit: int, offset: int) -> Dict[str, Any]:
        """Return empty search results structure."""
        return {
            "results": [],
            "total": 0,
            "page": (offset // limit) + 1,
            "per_page": limit,
            "query": "",
            "filters": {},
            "metadata": {
                "terms": [],
                "processing_time": 0,
                "strategies_used": [],
                "personalized": False
            },
            "facets": {},
            "suggestions": []
        }