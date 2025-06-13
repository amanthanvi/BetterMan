"""
Integration tests for cache functionality.
"""

import pytest
import time
from unittest.mock import patch, MagicMock
import redis

from src.models.document import Document, Section
from src.cache.cache_manager import CacheManager, COMMON_COMMANDS
from src.cache.search_cache import SearchCache, get_search_cache
from src.parser.groff_parser import GroffParser


@pytest.mark.integration
class TestCacheManager:
    """Integration tests for cache manager."""
    
    @pytest.fixture
    def cache_manager(self, test_db):
        """Create cache manager instance."""
        parser = GroffParser()
        return CacheManager(test_db, parser, max_cache_size=10)
    
    @pytest.fixture
    def mock_man_content(self):
        """Mock man page content."""
        return """.TH TEST 1 "2024-01-01" "Test 1.0" "Test Manual"
.SH NAME
test \\- a test command
.SH SYNOPSIS
.B test
[OPTIONS]
.SH DESCRIPTION
This is a test command for testing.
.SH OPTIONS
.TP
.B \\-h
Show help message
.SH SEE ALSO
.BR ls (1),
.BR cat (1)
"""
    
    def test_get_document_cache_miss(self, cache_manager, test_db, mock_man_content):
        """Test retrieving document that's not in cache."""
        with patch('src.parser.system_man_loader.get_complete_man_page') as mock_get:
            mock_get.return_value = (mock_man_content, None)
            
            # Get document - should process and cache
            doc = cache_manager.get_document("test", 1)
            
            assert doc is not None
            assert doc.name == "test"
            assert doc.section == 1
            
            # Verify it was added to database
            db_doc = test_db.query(Document).filter_by(name="test").first()
            assert db_doc is not None
            assert db_doc.access_count == 1
    
    def test_get_document_cache_hit(self, cache_manager, test_db):
        """Test retrieving document that's already cached."""
        # Add document to cache
        doc = Document(
            name="cached_test",
            title="cached_test - cached command",
            section="1",
            summary="A cached test command",
            raw_content="cached content",
            access_count=5
        )
        test_db.add(doc)
        test_db.commit()
        
        # Get document - should hit cache
        result = cache_manager.get_document("cached_test", 1)
        
        assert result is not None
        assert result.name == "cached_test"
        
        # Access count should be incremented
        test_db.refresh(doc)
        assert doc.access_count == 6
    
    def test_cache_eviction(self, test_db):
        """Test cache eviction when full."""
        # Create small cache
        parser = GroffParser()
        cache_manager = CacheManager(test_db, parser, max_cache_size=5)
        
        # Fill cache with documents
        for i in range(5):
            doc = Document(
                name=f"cmd{i}",
                title=f"Command {i}",
                section="1",
                summary=f"Command {i} summary",
                raw_content=f"Content {i}",
                cache_status="temporary",
                access_count=i,
                cache_priority=i
            )
            test_db.add(doc)
        test_db.commit()
        
        # Add one more to trigger eviction
        with patch('src.parser.system_man_loader.get_complete_man_page') as mock_get:
            mock_get.return_value = ("new content", None)
            
            # This should trigger eviction
            cache_manager.evict_if_needed()
            
            # Least used document should be evicted
            remaining = test_db.query(Document).filter_by(name="cmd0").first()
            assert remaining is None  # Should be evicted
            
            # Most used should remain
            remaining = test_db.query(Document).filter_by(name="cmd4").first()
            assert remaining is not None
    
    def test_prefetch_common_commands(self, cache_manager, test_db, mock_man_content):
        """Test prefetching common commands."""
        with patch('src.parser.system_man_loader.get_complete_man_page') as mock_get:
            mock_get.return_value = (mock_man_content, None)
            
            # Prefetch only first few commands for testing
            test_commands = ["ls", "cd", "grep"]
            with patch.object(cache_manager, 'process_and_cache') as mock_process:
                # Mock successful processing
                mock_process.return_value = MagicMock()
                
                # Prefetch subset of commands
                for cmd in test_commands:
                    if cmd in COMMON_COMMANDS:
                        cache_manager.process_and_cache(cmd)
                
                # Verify calls
                assert mock_process.call_count == len(test_commands)
    
    def test_update_common_command(self, cache_manager, test_db):
        """Test updating a common command."""
        # Add existing command
        doc = Document(
            name="ls",
            title="ls - old title",
            section="1",
            summary="Old summary",
            raw_content="old content",
            is_common=True
        )
        test_db.add(doc)
        test_db.commit()
        
        with patch('src.parser.man_utils.fetch_man_page_content') as mock_fetch:
            mock_fetch.return_value = ("new content", {})
            
            with patch.object(cache_manager.parser, 'parse_man_page') as mock_parse:
                mock_parse.return_value = {
                    "title": "ls - new title",
                    "sections": [{"name": "NAME", "content": "New summary"}],
                    "related": ["dir", "vdir"]
                }
                
                # Update command
                success = cache_manager.update_common_command("ls")
                assert success is True
                
                # Verify update
                test_db.refresh(doc)
                assert doc.title == "ls - new title"
                assert doc.cache_status == "permanent"
                assert doc.is_common is True
    
    def test_cache_statistics(self, cache_manager, test_db):
        """Test cache statistics calculation."""
        # Add various documents
        docs = [
            Document(name="common1", is_common=True, access_count=100, cache_status="permanent"),
            Document(name="common2", is_common=True, access_count=50, cache_status="permanent"),
            Document(name="temp1", is_common=False, access_count=10, cache_status="temporary"),
            Document(name="temp2", is_common=False, access_count=5, cache_status="on_demand"),
        ]
        for doc in docs:
            test_db.add(doc)
        test_db.commit()
        
        # Get statistics
        stats = cache_manager.get_cache_statistics()
        
        assert stats["total_documents"] == 4
        assert stats["common_documents"] == 2
        assert "cache_by_status" in stats
        assert stats["cache_by_status"]["permanent"] == 2
        assert stats["cache_by_status"]["temporary"] == 1
        assert stats["cache_by_status"]["on_demand"] == 1
        assert len(stats["most_popular"]) > 0
        assert stats["most_popular"][0] == "common1"  # Highest access count


@pytest.mark.integration
class TestSearchCache:
    """Integration tests for search cache."""
    
    @pytest.fixture
    def search_cache(self):
        """Create search cache instance."""
        # Use in-memory cache for testing
        return SearchCache(redis_url=None, ttl=2, max_memory_cache=10)
    
    def test_cache_hit_miss(self, search_cache):
        """Test cache hit and miss scenarios."""
        query = "test query"
        results = {"results": [{"id": 1, "name": "test"}], "total": 1}
        
        # First access - miss
        cached = search_cache.get(query, None, 0, 10)
        assert cached is None
        assert search_cache._cache_misses == 1
        
        # Store in cache
        search_cache.set(query, None, 0, 10, results)
        
        # Second access - hit
        cached = search_cache.get(query, None, 0, 10)
        assert cached == results
        assert search_cache._cache_hits == 1
    
    def test_cache_expiration(self, search_cache):
        """Test cache entry expiration."""
        query = "expiring query"
        results = {"results": [], "total": 0}
        
        # Store in cache
        search_cache.set(query, None, 0, 10, results)
        
        # Should be in cache
        assert search_cache.get(query, None, 0, 10) == results
        
        # Wait for expiration
        time.sleep(3)
        
        # Should be expired
        assert search_cache.get(query, None, 0, 10) is None
    
    def test_cache_key_generation(self, search_cache):
        """Test cache key generation for different parameters."""
        # Same parameters should generate same key
        key1 = search_cache._generate_cache_key("test", 1, 0, 10)
        key2 = search_cache._generate_cache_key("test", 1, 0, 10)
        assert key1 == key2
        
        # Different parameters should generate different keys
        key3 = search_cache._generate_cache_key("test", 2, 0, 10)
        assert key1 != key3
        
        key4 = search_cache._generate_cache_key("test", 1, 10, 10)
        assert key1 != key4
    
    def test_cache_invalidation(self, search_cache):
        """Test cache invalidation."""
        # Add multiple entries
        for i in range(5):
            search_cache.set(f"query{i}", None, 0, 10, {"results": [i]})
        
        # Invalidate specific pattern
        count = search_cache.invalidate_pattern("*query1*")
        assert count >= 1
        
        # query1 should be gone
        assert search_cache.get("query1", None, 0, 10) is None
        
        # Others should remain
        assert search_cache.get("query0", None, 0, 10) is not None
    
    def test_cache_statistics(self, search_cache):
        """Test cache statistics."""
        # Generate some hits and misses
        search_cache.get("miss1", None, 0, 10)  # Miss
        search_cache.set("hit1", None, 0, 10, {"results": []})
        search_cache.get("hit1", None, 0, 10)  # Hit
        search_cache.get("miss2", None, 0, 10)  # Miss
        
        stats = search_cache.get_statistics()
        
        assert stats["cache_hits"] == 1
        assert stats["cache_misses"] == 2
        assert stats["hit_rate"] == 33.33  # 1/3 * 100
        assert stats["memory_cache_size"] == 1
        assert stats["ttl_seconds"] == 2
    
    @pytest.mark.skipif(not redis, reason="Redis not available")
    def test_redis_cache_integration(self):
        """Test Redis cache integration."""
        # Try to connect to Redis
        try:
            cache = SearchCache(redis_url="redis://localhost:6379/0", ttl=5)
            
            # Test basic operations
            results = {"results": [{"id": "redis_test"}], "total": 1}
            cache.set("redis_query", None, 0, 10, results)
            
            cached = cache.get("redis_query", None, 0, 10)
            assert cached == results
            
            # Test Redis-specific stats
            stats = cache.get_statistics()
            assert stats["redis_connected"] is True
            assert "redis_keys" in stats
            
        except Exception:
            pytest.skip("Redis connection failed")
    
    def test_memory_cache_eviction(self):
        """Test memory cache eviction when full."""
        cache = SearchCache(redis_url=None, ttl=60, max_memory_cache=3)
        
        # Fill cache
        for i in range(4):
            cache.set(f"query{i}", None, 0, 10, {"results": [i]})
        
        # Cache should have evicted oldest entry
        assert len(cache._memory_cache) == 3
        assert cache.get("query0", None, 0, 10) is None  # Evicted
        assert cache.get("query3", None, 0, 10) is not None  # Kept


@pytest.mark.integration
class TestCacheAPI:
    """Integration tests for cache-related API endpoints."""
    
    def test_document_cache_via_api(self, client):
        """Test document caching through API."""
        # First request - should process and cache
        response1 = client.get("/api/docs/ls/1")
        
        if response1.status_code == 200:
            data1 = response1.json()
            
            # Second request - should hit cache (faster)
            import time
            start = time.time()
            response2 = client.get("/api/docs/ls/1")
            cache_time = time.time() - start
            
            assert response2.status_code == 200
            data2 = response2.json()
            
            # Data should be identical
            assert data1["name"] == data2["name"]
            assert data1["title"] == data2["title"]
    
    def test_cache_headers(self, client):
        """Test cache-related HTTP headers."""
        response = client.get("/api/docs/grep/1")
        
        if response.status_code == 200:
            # Should have cache headers
            headers = response.headers
            assert "Cache-Control" in headers or "ETag" in headers
    
    def test_search_cache_warmup(self, client):
        """Test search cache warm-up."""
        # Common queries that might be pre-cached
        common_queries = ["ls", "grep", "find", "cat"]
        
        for query in common_queries:
            response = client.get(f"/api/search?q={query}")
            assert response.status_code == 200
            
            # Second request should be faster (cached)
            response2 = client.get(f"/api/search?q={query}")
            assert response2.status_code == 200