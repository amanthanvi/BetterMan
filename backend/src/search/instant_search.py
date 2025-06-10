"""
Instant search with autocomplete, natural language processing, and smart features.
"""

import re
import json
import logging
from typing import List, Dict, Any, Optional, Tuple, Set
from collections import defaultdict, Counter
from functools import lru_cache
from datetime import datetime, timedelta
from sqlalchemy import text, func, and_, or_
from sqlalchemy.orm import Session

from ..models.document import Document, Section
from ..models.user import SearchHistory
from ..cache.cache_manager import CacheManager
from ..config import get_settings
from ..errors import SearchError
from .fuzzy_search import FuzzySearchEngine, FuzzyMatcher
from .optimized_search import OptimizedSearchEngine

logger = logging.getLogger(__name__)
settings = get_settings()


class NaturalLanguageProcessor:
    """Process natural language queries into command searches."""
    
    # Natural language patterns to commands
    LANGUAGE_PATTERNS = {
        # File operations
        r'(?:how to |how do i |)list (?:files|directories|folders)': ['ls', 'dir', 'find'],
        r'(?:how to |)show (?:files|directory|folder) content': ['ls', 'tree'],
        r'(?:how to |)view (?:file|text) content': ['cat', 'less', 'more', 'head', 'tail'],
        r'(?:how to |)create (?:a |)(?:file|document)': ['touch', 'vim', 'nano'],
        r'(?:how to |)create (?:a |)(?:directory|folder)': ['mkdir'],
        r'(?:how to |)(?:remove|delete) (?:a |)(?:file|document)': ['rm', 'unlink'],
        r'(?:how to |)(?:remove|delete) (?:a |)(?:directory|folder)': ['rm', 'rmdir'],
        r'(?:how to |)(?:copy|duplicate) (?:a |)file': ['cp', 'rsync'],
        r'(?:how to |)(?:move|rename) (?:a |)file': ['mv'],
        r'(?:how to |)find (?:a |)file': ['find', 'locate', 'whereis', 'which'],
        r'search (?:for |)(?:text|string) in files': ['grep', 'ack', 'ag', 'rg'],
        
        # Permissions
        r'(?:how to |)change (?:file |)permissions': ['chmod', 'chown', 'chgrp'],
        r'(?:how to |)make (?:a |)file executable': ['chmod'],
        r'(?:how to |)change (?:file |)ownership': ['chown', 'chgrp'],
        
        # Process management
        r'(?:how to |)(?:list|show|view) (?:running |)processes': ['ps', 'top', 'htop'],
        r'(?:how to |)kill (?:a |)process': ['kill', 'killall', 'pkill'],
        r'(?:how to |)(?:check|monitor) (?:system |)(?:resources|performance)': ['top', 'htop', 'vmstat', 'iostat'],
        
        # Network
        r'(?:how to |)(?:check|test) (?:network |)connection': ['ping', 'traceroute', 'mtr'],
        r'(?:how to |)download (?:a |)file': ['wget', 'curl'],
        r'(?:how to |)(?:check|show) network (?:configuration|settings)': ['ifconfig', 'ip', 'netstat'],
        r'(?:how to |)connect (?:to |)(?:remote |)(?:server|machine)': ['ssh', 'telnet'],
        r'(?:how to |)transfer files (?:to |from |)(?:remote |)server': ['scp', 'rsync', 'sftp'],
        
        # System info
        r'(?:how to |)(?:check|show) disk (?:usage|space)': ['df', 'du'],
        r'(?:how to |)(?:check|show) memory usage': ['free', 'vmstat'],
        r'(?:how to |)(?:check|show) system information': ['uname', 'hostnamectl', 'lsb_release'],
        r'(?:how to |)(?:check|show) (?:cpu|processor) info': ['lscpu', 'cat /proc/cpuinfo'],
        
        # Package management
        r'(?:how to |)install (?:a |)(?:package|software|program)': ['apt', 'yum', 'dnf', 'pacman', 'brew'],
        r'(?:how to |)(?:update|upgrade) (?:packages|system)': ['apt', 'yum', 'dnf', 'pacman', 'brew'],
        r'(?:how to |)(?:remove|uninstall) (?:a |)(?:package|software|program)': ['apt', 'yum', 'dnf', 'pacman', 'brew'],
        
        # Archive operations
        r'(?:how to |)(?:compress|zip|archive) files': ['tar', 'zip', 'gzip', 'bzip2', '7z'],
        r'(?:how to |)(?:extract|unzip|decompress) (?:files|archive)': ['tar', 'unzip', 'gunzip', 'bunzip2', '7z'],
        
        # User management
        r'(?:how to |)(?:create|add) (?:a |)(?:user|account)': ['useradd', 'adduser'],
        r'(?:how to |)(?:change|set) password': ['passwd'],
        r'(?:how to |)switch user': ['su', 'sudo'],
        
        # Text processing
        r'(?:how to |)(?:sort|order) (?:text|lines|data)': ['sort'],
        r'(?:how to |)(?:count|number) (?:lines|words|characters)': ['wc'],
        r'(?:how to |)(?:filter|select) (?:unique|distinct) lines': ['uniq'],
        r'(?:how to |)(?:replace|substitute) text': ['sed', 'awk', 'perl'],
        
        # Git operations
        r'(?:how to |)(?:create|initialize) (?:a |)git repository': ['git init'],
        r'(?:how to |)(?:clone|copy) (?:a |)repository': ['git clone'],
        r'(?:how to |)(?:commit|save) changes': ['git commit'],
        r'(?:how to |)(?:push|upload) (?:changes|commits)': ['git push'],
        r'(?:how to |)(?:pull|download) (?:changes|updates)': ['git pull'],
        
        # Docker operations
        r'(?:how to |)(?:list|show) docker (?:containers|images)': ['docker ps', 'docker images'],
        r'(?:how to |)(?:run|start) (?:a |)docker container': ['docker run'],
        r'(?:how to |)(?:stop|kill) (?:a |)docker container': ['docker stop', 'docker kill'],
        r'(?:how to |)build (?:a |)docker image': ['docker build'],
    }
    
    # Common verbs and their command associations
    VERB_COMMANDS = {
        'list': ['ls', 'find', 'ps', 'docker ps'],
        'show': ['cat', 'less', 'more', 'ls', 'ps'],
        'view': ['cat', 'less', 'more', 'vim', 'nano'],
        'create': ['touch', 'mkdir', 'vim', 'nano'],
        'delete': ['rm', 'rmdir'],
        'remove': ['rm', 'rmdir'],
        'copy': ['cp', 'rsync', 'scp'],
        'move': ['mv'],
        'find': ['find', 'locate', 'grep'],
        'search': ['find', 'grep', 'locate'],
        'change': ['chmod', 'chown', 'cd'],
        'check': ['ps', 'df', 'du', 'ping', 'test'],
        'monitor': ['top', 'htop', 'watch'],
        'install': ['apt', 'yum', 'dnf', 'brew', 'npm', 'pip'],
        'download': ['wget', 'curl', 'git clone'],
        'connect': ['ssh', 'telnet', 'nc'],
        'compress': ['tar', 'zip', 'gzip'],
        'extract': ['tar', 'unzip', 'gunzip'],
    }
    
    @classmethod
    def parse_natural_language(cls, query: str) -> List[str]:
        """
        Parse natural language query and return relevant commands.
        
        Args:
            query: Natural language query
            
        Returns:
            List of relevant command names
        """
        query_lower = query.lower().strip()
        commands = []
        
        # Check pattern matches
        for pattern, cmds in cls.LANGUAGE_PATTERNS.items():
            if re.search(pattern, query_lower):
                commands.extend(cmds)
        
        # Check verb associations
        words = query_lower.split()
        for word in words:
            if word in cls.VERB_COMMANDS:
                commands.extend(cls.VERB_COMMANDS[word])
        
        # Remove duplicates while preserving order
        seen = set()
        unique_commands = []
        for cmd in commands:
            if cmd not in seen:
                seen.add(cmd)
                unique_commands.append(cmd)
        
        return unique_commands[:10]  # Limit to top 10


class CommandShortcuts:
    """Handle command shortcuts and quick navigation."""
    
    # Direct command shortcuts (prefix with !)
    SHORTCUTS = {
        '!ls': 'ls',
        '!cd': 'cd',
        '!pwd': 'pwd',
        '!cat': 'cat',
        '!grep': 'grep',
        '!find': 'find',
        '!man': 'man',
        '!git': 'git',
        '!docker': 'docker',
        '!ssh': 'ssh',
        '!vim': 'vim',
        '!nano': 'nano',
        '!ps': 'ps',
        '!kill': 'kill',
        '!top': 'top',
        '!df': 'df',
        '!du': 'du',
        '!tar': 'tar',
        '!curl': 'curl',
        '!wget': 'wget',
    }
    
    @classmethod
    def is_shortcut(cls, query: str) -> bool:
        """Check if query is a shortcut."""
        return query.startswith('!') and len(query) > 1
    
    @classmethod
    def resolve_shortcut(cls, query: str) -> Optional[str]:
        """Resolve shortcut to command name."""
        if query in cls.SHORTCUTS:
            return cls.SHORTCUTS[query]
        
        # Handle dynamic shortcuts (e.g., !command)
        if cls.is_shortcut(query):
            return query[1:]  # Remove the ! prefix
        
        return None


class InstantSearchEngine:
    """
    Instant search engine with autocomplete, natural language support,
    and intelligent features.
    """
    
    def __init__(self, db, cache_manager=None):
        """Initialize instant search engine."""
        self.db = db
        self.cache = cache_manager
        self.fuzzy_engine = FuzzySearchEngine(db)
        self.optimized_engine = OptimizedSearchEngine(db)
        self.nlp = NaturalLanguageProcessor()
        self.shortcuts = CommandShortcuts()
        self._init_search_data()
    
    def _init_search_data(self):
        """Initialize search data and caches."""
        # Popular commands for suggestions
        self.popular_commands = self._get_popular_commands()
        
        # Command categories
        self.command_categories = self._build_command_categories()
    
    @lru_cache(maxsize=1)
    def _get_popular_commands(self) -> List[str]:
        """Get list of popular commands based on access count."""
        try:
            popular = self.db.query(Document.name).order_by(
                Document.access_count.desc()
            ).limit(100).all()
            return [cmd.name for cmd in popular]
        except Exception as e:
            logger.error(f"Error getting popular commands: {e}")
            return []
    
    def _build_command_categories(self) -> Dict[str, List[str]]:
        """Build command categories for smart suggestions."""
        return {
            'file_operations': ['ls', 'cd', 'cp', 'mv', 'rm', 'mkdir', 'rmdir', 'touch', 'find'],
            'text_processing': ['cat', 'less', 'more', 'grep', 'sed', 'awk', 'sort', 'uniq', 'cut'],
            'system_info': ['ps', 'top', 'df', 'du', 'free', 'uname', 'uptime', 'who', 'whoami'],
            'network': ['ping', 'curl', 'wget', 'ssh', 'scp', 'netstat', 'ifconfig', 'ip'],
            'package_management': ['apt', 'yum', 'dnf', 'pacman', 'brew', 'snap', 'pip', 'npm'],
            'version_control': ['git', 'svn', 'hg'],
            'containers': ['docker', 'podman', 'kubectl'],
            'editors': ['vim', 'nano', 'emacs', 'vi'],
            'archive': ['tar', 'zip', 'unzip', 'gzip', 'gunzip', 'bzip2'],
            'permissions': ['chmod', 'chown', 'chgrp', 'umask'],
        }
    
    async def instant_search(
        self,
        query: str,
        user_id: Optional[int] = None,
        limit: int = 10
    ) -> Dict[str, Any]:
        """
        Perform instant search with all intelligent features.
        
        Args:
            query: Search query
            user_id: Optional user ID for personalization
            limit: Maximum results
            
        Returns:
            Instant search results with suggestions
        """
        try:
            # Clean query
            query_clean = query.strip()
            
            # Skip cache for now since CacheManager doesn't support async operations
            # cache_key = f"instant_search:{query_clean}:{limit}"
            
            results = {
                "query": query,
                "results": [],
                "suggestions": [],
                "shortcuts": [],
                "natural_language": [],
                "categories": [],
                "instant": True,
                "timestamp": datetime.utcnow().isoformat()
            }
            
            # Handle empty query
            if not query_clean:
                results["suggestions"] = self.popular_commands[:limit]
                return results
            
            # Check for shortcuts
            if self.shortcuts.is_shortcut(query_clean):
                command = self.shortcuts.resolve_shortcut(query_clean)
                if command:
                    # Direct navigation to command
                    doc = self.db.query(Document).filter(
                        Document.name == command
                    ).first()
                    
                    if doc:
                        results["shortcuts"] = [{
                            "command": command,
                            "action": "navigate",
                            "document": {
                                "id": doc.id,
                                "name": doc.name,
                                "title": doc.title or doc.name,
                                "summary": doc.summary or ""
                            }
                        }]
                        return results
            
            # Parse natural language
            nl_commands = self.nlp.parse_natural_language(query_clean)
            if nl_commands:
                results["natural_language"] = nl_commands
            
            # Perform fuzzy search
            fuzzy_results = self.fuzzy_engine.search_with_fuzzy(
                query_clean,
                limit=limit,
                fuzzy_threshold=0.6
            )
            
            results["results"] = fuzzy_results["results"]
            
            # Add autocomplete suggestions
            autocomplete = self.fuzzy_engine.autocomplete(query_clean, limit=5)
            results["suggestions"] = [s["value"] for s in autocomplete]
            
            # Add "Did you mean?" if available
            if fuzzy_results.get("did_you_mean"):
                results["did_you_mean"] = fuzzy_results["did_you_mean"]
            
            # Get related categories
            if results["results"]:
                categories = self._get_related_categories(
                    [r["name"] for r in results["results"][:5]]
                )
                results["categories"] = categories
            
            # Add user search history if available
            if user_id:
                history = self._get_user_search_history(user_id, query_clean)
                if history:
                    results["history"] = history
            
            # Skip caching for now
            # await self.cache.set(cache_key, results, expire=300)  # 5 min cache
            
            return results
            
        except Exception as e:
            logger.error(f"Instant search error: {e}")
            return {
                "query": query,
                "results": [],
                "error": str(e)
            }
    
    def _get_related_categories(self, commands: List[str]) -> List[str]:
        """Get categories related to the given commands."""
        categories = []
        
        for category, cat_commands in self.command_categories.items():
            if any(cmd in cat_commands for cmd in commands):
                categories.append(category)
        
        return categories[:3]  # Top 3 categories
    
    def _get_user_search_history(self, user_id: int, current_query: str) -> List[str]:
        """Get relevant search history for user."""
        try:
            # Get recent searches
            recent = self.db.query(SearchHistory.query).filter(
                SearchHistory.user_id == user_id,
                SearchHistory.query != current_query
            ).order_by(
                SearchHistory.searched_at.desc()
            ).limit(10).all()
            
            # Filter by relevance to current query
            relevant = []
            current_lower = current_query.lower()
            
            for search in recent:
                if (current_lower in search.query.lower() or 
                    search.query.lower() in current_lower):
                    relevant.append(search.query)
            
            return relevant[:5]
            
        except Exception as e:
            logger.error(f"Error getting search history: {e}")
            return []
    
    async def get_search_suggestions(
        self,
        prefix: str,
        context: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Get smart search suggestions based on prefix and context.
        
        Args:
            prefix: Search prefix
            context: Optional context (recent commands, current page, etc.)
            
        Returns:
            List of suggestions with metadata
        """
        suggestions = []
        prefix_lower = prefix.lower().strip()
        
        if not prefix_lower:
            return []
        
        # Get autocomplete suggestions
        autocomplete = self.fuzzy_engine.autocomplete(prefix_lower, limit=10)
        
        for suggestion in autocomplete:
            # Add context-based scoring
            score = suggestion.get("score", 1.0)
            
            # Boost if in recent context
            if context and "recent_commands" in context:
                if suggestion["value"] in context["recent_commands"]:
                    score *= 1.5
            
            # Boost if related to current command
            if context and "current_command" in context:
                current = context["current_command"]
                if self._are_commands_related(current, suggestion["value"]):
                    score *= 1.3
            
            suggestion["context_score"] = score
            suggestions.append(suggestion)
        
        # Sort by context score
        suggestions.sort(key=lambda x: x["context_score"], reverse=True)
        
        return suggestions[:10]
    
    def _are_commands_related(self, cmd1: str, cmd2: str) -> bool:
        """Check if two commands are related."""
        # Check if in same category
        for category, commands in self.command_categories.items():
            if cmd1 in commands and cmd2 in commands:
                return True
        
        # Check common patterns
        related_groups = [
            ['ls', 'cd', 'pwd', 'mkdir', 'rmdir'],
            ['cat', 'less', 'more', 'head', 'tail'],
            ['cp', 'mv', 'rm'],
            ['grep', 'sed', 'awk'],
            ['ps', 'kill', 'killall', 'top'],
            ['tar', 'zip', 'unzip', 'gzip'],
            ['apt', 'apt-get', 'apt-cache'],
            ['git', 'git-flow'],
            ['docker', 'docker-compose'],
        ]
        
        for group in related_groups:
            if cmd1 in group and cmd2 in group:
                return True
        
        return False
    
    async def track_search(
        self,
        query: str,
        results_count: int,
        user_id: Optional[int] = None,
        selected_result: Optional[str] = None
    ):
        """Track search query for analytics and improvement."""
        try:
            # Track in database if user is logged in
            if user_id:
                search_history = SearchHistory(
                    user_id=user_id,
                    query=query,
                    results_count=results_count,
                    selected_result=selected_result,
                    searched_at=datetime.utcnow()
                )
                self.db.add(search_history)
                self.db.commit()
            
            # Track popular searches in cache
            # Skip cache tracking if cache is not available or doesn't support async operations
            if self.cache is None:
                return
            
        except Exception as e:
            logger.error(f"Error tracking search: {e}")
            self.db.rollback()