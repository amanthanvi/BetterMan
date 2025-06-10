"""
Fuzzy search implementation with typo tolerance and intelligent matching.
"""

import re
import math
import logging
from typing import List, Dict, Any, Optional, Tuple, Set
from collections import defaultdict
from functools import lru_cache
from difflib import SequenceMatcher
try:
    import Levenshtein
    has_levenshtein = True
except ImportError:
    try:
        # Fallback to python-Levenshtein
        from Levenshtein import distance, ratio
        has_levenshtein = True
    except ImportError:
        # No Levenshtein library available
        has_levenshtein = False
from sqlalchemy import text, and_, or_, func, case
from sqlalchemy.orm import Session

from ..models.document import Document, Section
from ..config import get_settings
from ..errors import SearchError

logger = logging.getLogger(__name__)
settings = get_settings()


class FuzzyMatcher:
    """Handles fuzzy string matching and similarity calculations."""
    
    # Common command typos and variations
    COMMON_TYPOS = {
        'grpe': 'grep',
        'gerp': 'grep',
        'gre': 'grep',
        'fidm': 'find',
        'finf': 'find',
        'fnd': 'find',
        'car': 'cat',
        'cta': 'cat',
        'ct': 'cat',
        'lss': 'ls',
        'sl': 'ls',
        'ks': 'ls',
        'chmdo': 'chmod',
        'chomd': 'chmod',
        'chmo': 'chmod',
        'gti': 'git',
        'got': 'git',
        'gir': 'git',
        'shh': 'ssh',
        'shs': 'ssh',
        'ss': 'ssh',
        'vim.': 'vim',
        'vi,': 'vim',
        'vom': 'vim',
        'pyhton': 'python',
        'pythin': 'python',
        'pyton': 'python',
        'dicker': 'docker',
        'doker': 'docker',
        'dcker': 'docker',
        'sudp': 'sudo',
        'suod': 'sudo',
        'sud': 'sudo',
        'mann': 'man',
        'mna': 'man',
        'mn': 'man',
        'tuch': 'touch',
        'touvh': 'touch',
        'touh': 'touch',
        'ehco': 'echo',
        'exho': 'echo',
        'eco': 'echo',
        'killal': 'killall',
        'kilall': 'killall',
        'killa': 'killall',
        'systemct': 'systemctl',
        'systmctl': 'systemctl',
        'sysctl': 'systemctl',
    }
    
    # Command abbreviations
    ABBREVIATIONS = {
        'k': 'kubectl',
        'd': 'docker',
        'g': 'git',
        'p': 'python',
        'n': 'npm',
        'v': 'vim',
        's': 'ssh',
        'l': 'ls',
        'c': 'cat',
        'f': 'find',
        'h': 'history',
        'e': 'echo',
        'm': 'man',
        't': 'tar',
        'r': 'rm',
        'mk': 'mkdir',
        'mv': 'move',
        'cp': 'copy',
        'ps': 'process',
        'df': 'disk',
        'du': 'disk usage',
        'cd': 'change directory',
        'pwd': 'present working directory',
    }
    
    @staticmethod
    def levenshtein_distance(s1: str, s2: str) -> int:
        """Calculate Levenshtein distance between two strings."""
        if has_levenshtein:
            try:
                return Levenshtein.distance(s1.lower(), s2.lower())
            except NameError:
                return distance(s1.lower(), s2.lower())
        else:
            # Fallback to difflib
            return len(s1) - int(SequenceMatcher(None, s1.lower(), s2.lower()).ratio() * len(s1))
    
    @staticmethod
    def similarity_ratio(s1: str, s2: str) -> float:
        """Calculate similarity ratio between two strings (0-1)."""
        return SequenceMatcher(None, s1.lower(), s2.lower()).ratio()
    
    @classmethod
    def fuzzy_match_score(cls, query: str, target: str) -> float:
        """
        Calculate fuzzy match score between query and target.
        Returns score between 0 and 1, where 1 is exact match.
        """
        query_lower = query.lower()
        target_lower = target.lower()
        
        # Exact match
        if query_lower == target_lower:
            return 1.0
        
        # Check common typos
        if query_lower in cls.COMMON_TYPOS and cls.COMMON_TYPOS[query_lower] == target_lower:
            return 0.95
        
        # Check abbreviations
        if query_lower in cls.ABBREVIATIONS and cls.ABBREVIATIONS[query_lower] == target_lower:
            return 0.9
        
        # Prefix match
        if target_lower.startswith(query_lower):
            return 0.8 + (0.2 * len(query) / len(target))
        
        # Contains match
        if query_lower in target_lower:
            return 0.6 + (0.2 * len(query) / len(target))
        
        # Calculate edit distance
        max_len = max(len(query), len(target))
        if max_len == 0:
            return 0.0
        
        distance = cls.levenshtein_distance(query, target)
        
        # Allow up to 2 character differences for short words
        if len(query) <= 4 and distance <= 2:
            return 0.7 - (0.2 * distance)
        
        # For longer words, use ratio
        similarity = 1 - (distance / max_len)
        
        # Boost if first characters match
        if query_lower[0] == target_lower[0]:
            similarity += 0.1
        
        # Penalize if too different
        if similarity < 0.5:
            return 0.0
        
        return min(similarity, 0.8)  # Cap at 0.8 for non-exact matches
    
    @classmethod
    def suggest_corrections(cls, query: str, candidates: List[str], max_suggestions: int = 5) -> List[Tuple[str, float]]:
        """
        Suggest corrections for a query based on candidates.
        Returns list of (suggestion, score) tuples.
        """
        suggestions = []
        
        # Check common typos first
        if query.lower() in cls.COMMON_TYPOS:
            correction = cls.COMMON_TYPOS[query.lower()]
            if correction in candidates:
                suggestions.append((correction, 0.95))
        
        # Check abbreviations
        if query.lower() in cls.ABBREVIATIONS:
            expansion = cls.ABBREVIATIONS[query.lower()]
            for candidate in candidates:
                if candidate.lower() == expansion or expansion in candidate.lower():
                    suggestions.append((candidate, 0.9))
        
        # Calculate fuzzy scores for all candidates
        for candidate in candidates:
            score = cls.fuzzy_match_score(query, candidate)
            if score > 0.5:  # Threshold for suggestions
                suggestions.append((candidate, score))
        
        # Sort by score and remove duplicates
        seen = set()
        unique_suggestions = []
        for suggestion, score in sorted(suggestions, key=lambda x: x[1], reverse=True):
            if suggestion not in seen:
                seen.add(suggestion)
                unique_suggestions.append((suggestion, score))
        
        return unique_suggestions[:max_suggestions]


class FuzzySearchEngine:
    """Enhanced search engine with fuzzy matching and intelligent features."""
    
    def __init__(self, db):
        """Initialize the fuzzy search engine."""
        self.db = db
        self.fuzzy_matcher = FuzzyMatcher()
        self._init_search_data()
    
    def _init_search_data(self):
        """Initialize search data and caches."""
        # Cache all command names for fuzzy matching
        self._update_command_cache()
    
    @lru_cache(maxsize=1)
    def _update_command_cache(self) -> List[str]:
        """Update cached list of all command names."""
        try:
            commands = self.db.query(Document.name).distinct().all()
            self.all_commands = [cmd.name for cmd in commands]
            return self.all_commands
        except Exception as e:
            logger.error(f"Error updating command cache: {e}")
            self.all_commands = []
            return []
    
    def search_with_fuzzy(
        self,
        query: str,
        section: Optional[int] = None,
        limit: int = 20,
        offset: int = 0,
        fuzzy_threshold: float = 0.7
    ) -> Dict[str, Any]:
        """
        Perform search with fuzzy matching and typo tolerance.
        
        Args:
            query: Search query
            section: Optional section filter
            limit: Maximum results
            offset: Pagination offset
            fuzzy_threshold: Minimum fuzzy match score (0-1)
            
        Returns:
            Search results with fuzzy matches and suggestions
        """
        try:
            # Parse query
            query_clean = query.strip().lower()
            
            # First, try exact and prefix matches
            exact_results = self._exact_search(query_clean, section, limit, offset)
            
            # If we have good results, return them
            if exact_results["total"] >= 5:
                return exact_results
            
            # Otherwise, perform fuzzy search
            fuzzy_results = self._fuzzy_search(
                query_clean, 
                section, 
                limit, 
                offset, 
                fuzzy_threshold,
                existing_results=exact_results["results"]
            )
            
            # Check for suggestions if few results
            suggestions = []
            if fuzzy_results["total"] < 3:
                suggestions = self._get_suggestions(query_clean)
            
            # Combine results
            combined_results = exact_results["results"] + fuzzy_results["results"]
            
            # Remove duplicates while preserving order
            seen_ids = set()
            unique_results = []
            for result in combined_results:
                if result["id"] not in seen_ids:
                    seen_ids.add(result["id"])
                    unique_results.append(result)
            
            # Sort by score
            unique_results.sort(key=lambda x: x["score"], reverse=True)
            
            return {
                "results": unique_results[:limit],
                "total": len(unique_results),
                "query": query,
                "suggestions": suggestions,
                "did_you_mean": suggestions[0]["command"] if suggestions else None,
                "fuzzy_matched": len(fuzzy_results["results"]) > 0
            }
            
        except Exception as e:
            logger.error(f"Fuzzy search error: {e}")
            raise SearchError("Fuzzy search failed", query)
    
    def _exact_search(
        self,
        query: str,
        section: Optional[int],
        limit: int,
        offset: int
    ) -> Dict[str, Any]:
        """Perform exact and prefix search."""
        # Build query using SQLAlchemy
        base_query = self.db.query(Document)
        
        # Apply filters
        if query:
            base_query = base_query.filter(
                or_(
                    func.lower(Document.name) == query,
                    func.lower(Document.name).like(f"{query}%"),
                    func.lower(Document.title).contains(query)
                )
            )
        
        if section is not None:
            base_query = base_query.filter(Document.section == section)
        
        # Get total
        total = base_query.count()
        
        # Get results with scoring
        results = []
        for doc in base_query.limit(limit).offset(offset).all():
            score = 1.0
            name_lower = doc.name.lower()
            
            if name_lower == query:
                score = 10.0  # Exact match
            elif name_lower.startswith(query):
                score = 5.0 + (len(query) / len(name_lower))  # Prefix match
            
            # Popularity boost
            score *= (1.0 + math.log(1 + doc.access_count) / 10.0)
            
            results.append({
                "id": doc.id,
                "name": doc.name,
                "title": doc.title or doc.name,
                "summary": doc.summary or "",
                "section": doc.section,
                "score": score,
                "match_type": "exact" if name_lower == query else "prefix"
            })
        
        return {
            "results": results,
            "total": total,
            "query": query
        }
    
    def _fuzzy_search(
        self,
        query: str,
        section: Optional[int],
        limit: int,
        offset: int,
        threshold: float,
        existing_results: List[Dict]
    ) -> Dict[str, Any]:
        """Perform fuzzy search for typo tolerance."""
        # Get existing result IDs to avoid duplicates
        existing_ids = {r["id"] for r in existing_results}
        
        # Find fuzzy matches from command cache
        fuzzy_matches = self.fuzzy_matcher.suggest_corrections(
            query, 
            self.all_commands,
            max_suggestions=20
        )
        
        # Filter by threshold
        matching_commands = [
            cmd for cmd, score in fuzzy_matches 
            if score >= threshold
        ]
        
        if not matching_commands:
            return {"results": [], "total": 0, "query": query}
        
        # Query documents for fuzzy matches
        base_query = self.db.query(Document).filter(
            Document.name.in_(matching_commands)
        )
        
        if section is not None:
            base_query = base_query.filter(Document.section == section)
        
        # Get results
        results = []
        fuzzy_scores = {cmd: score for cmd, score in fuzzy_matches}
        
        for doc in base_query.all():
            if doc.id in existing_ids:
                continue
            
            # Calculate fuzzy score
            fuzzy_score = fuzzy_scores.get(doc.name, 0.5)
            
            # Adjust for popularity
            popularity_boost = 1.0 + math.log(1 + doc.access_count) / 10.0
            final_score = fuzzy_score * popularity_boost * 0.8  # Slightly penalize fuzzy matches
            
            results.append({
                "id": doc.id,
                "name": doc.name,
                "title": doc.title or doc.name,
                "summary": doc.summary or "",
                "section": doc.section,
                "score": final_score,
                "match_type": "fuzzy",
                "fuzzy_score": fuzzy_score
            })
        
        # Sort by score
        results.sort(key=lambda x: x["score"], reverse=True)
        
        return {
            "results": results[:limit],
            "total": len(results),
            "query": query
        }
    
    def _get_suggestions(self, query: str) -> List[Dict[str, Any]]:
        """Get 'Did you mean?' suggestions."""
        suggestions = []
        
        # Get fuzzy matches
        fuzzy_matches = self.fuzzy_matcher.suggest_corrections(
            query, 
            self.all_commands,
            max_suggestions=3
        )
        
        for command, score in fuzzy_matches:
            if score >= 0.6:  # Only suggest reasonably close matches
                # Get document info
                doc = self.db.query(Document).filter(
                    Document.name == command
                ).first()
                
                if doc:
                    suggestions.append({
                        "command": command,
                        "title": doc.title or command,
                        "score": score,
                        "distance": self.fuzzy_matcher.levenshtein_distance(query, command)
                    })
        
        return suggestions
    
    def autocomplete(self, prefix: str, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Get autocomplete suggestions for a prefix.
        
        Args:
            prefix: Query prefix
            limit: Maximum suggestions
            
        Returns:
            List of autocomplete suggestions
        """
        prefix_lower = prefix.lower().strip()
        
        if not prefix_lower:
            return []
        
        suggestions = []
        
        # Check abbreviations
        if prefix_lower in self.fuzzy_matcher.ABBREVIATIONS:
            expansion = self.fuzzy_matcher.ABBREVIATIONS[prefix_lower]
            suggestions.append({
                "value": expansion,
                "type": "abbreviation",
                "display": f"{prefix} → {expansion}"
            })
        
        # Check common typos
        if prefix_lower in self.fuzzy_matcher.COMMON_TYPOS:
            correction = self.fuzzy_matcher.COMMON_TYPOS[prefix_lower]
            suggestions.append({
                "value": correction,
                "type": "correction",
                "display": f"{prefix} → {correction}"
            })
        
        # Get prefix matches from database
        prefix_matches = self.db.query(Document.name, Document.title).filter(
            func.lower(Document.name).like(f"{prefix_lower}%")
        ).order_by(
            Document.access_count.desc()
        ).limit(limit).all()
        
        for name, title in prefix_matches:
            suggestions.append({
                "value": name,
                "type": "command",
                "display": name,
                "description": title or name
            })
        
        # If few results, try fuzzy matching
        if len(suggestions) < 5:
            fuzzy_matches = self.fuzzy_matcher.suggest_corrections(
                prefix_lower,
                self.all_commands,
                max_suggestions=5
            )
            
            for command, score in fuzzy_matches:
                if score >= 0.7 and not any(s["value"] == command for s in suggestions):
                    doc = self.db.query(Document.name, Document.title).filter(
                        Document.name == command
                    ).first()
                    
                    if doc:
                        suggestions.append({
                            "value": doc.name,
                            "type": "fuzzy",
                            "display": doc.name,
                            "description": doc.title or doc.name,
                            "score": score
                        })
        
        return suggestions[:limit]