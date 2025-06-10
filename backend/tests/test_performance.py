"""
Performance tests for BetterMan
"""
import pytest
import time
import asyncio
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import Mock, patch
import psutil
import gc

from src.search.optimized_search import OptimizedSearchEngine
from src.cache.cache_manager import CacheManager
from src.parser.enhanced_groff_parser import EnhancedGroffParser
from src.db.query_optimizer import QueryOptimizer


class TestSearchPerformance:
    """Test search performance"""
    
    @pytest.fixture
    def search_engine(self):
        return OptimizedSearchEngine(db=Mock(), cache=Mock())
    
    @pytest.fixture
    def large_dataset(self):
        """Generate large dataset for testing"""
        return [
            {
                "id": i,
                "command": f"command{i}",
                "description": f"Description for command {i} with various keywords",
                "content": f"Long content " * 100,
                "section": (i % 8) + 1
            }
            for i in range(10000)
        ]
    
    def test_search_response_time(self, search_engine, large_dataset):
        """Test search completes within acceptable time"""
        search_engine.documents = large_dataset
        
        start_time = time.time()
        results = search_engine.search("command", limit=50)
        elapsed = time.time() - start_time
        
        # Should complete within 100ms for 10k documents
        assert elapsed < 0.1
        assert len(results) <= 50
    
    def test_fuzzy_search_performance(self, search_engine, large_dataset):
        """Test fuzzy search performance"""
        search_engine.documents = large_dataset
        
        start_time = time.time()
        results = search_engine.fuzzy_search("comand", limit=20)
        elapsed = time.time() - start_time
        
        # Fuzzy search should complete within 200ms
        assert elapsed < 0.2
        assert len(results) > 0
    
    def test_search_memory_usage(self, search_engine, large_dataset):
        """Test search doesn't use excessive memory"""
        search_engine.documents = large_dataset
        
        # Get initial memory
        process = psutil.Process()
        initial_memory = process.memory_info().rss / 1024 / 1024  # MB
        
        # Perform multiple searches
        for i in range(100):
            search_engine.search(f"command{i}", limit=10)
        
        # Force garbage collection
        gc.collect()
        
        # Check memory usage
        final_memory = process.memory_info().rss / 1024 / 1024  # MB
        memory_increase = final_memory - initial_memory
        
        # Memory increase should be less than 50MB
        assert memory_increase < 50
    
    @pytest.mark.asyncio
    async def test_concurrent_search_performance(self, search_engine, large_dataset):
        """Test performance under concurrent load"""
        search_engine.documents = large_dataset
        
        async def search_task(query):
            return await asyncio.to_thread(
                search_engine.search, query, limit=10
            )
        
        # Create 100 concurrent searches
        queries = [f"command{i % 100}" for i in range(100)]
        
        start_time = time.time()
        results = await asyncio.gather(*[search_task(q) for q in queries])
        elapsed = time.time() - start_time
        
        # Should handle 100 concurrent searches in under 2 seconds
        assert elapsed < 2.0
        assert all(isinstance(r, list) for r in results)
    
    def test_search_index_performance(self, search_engine):
        """Test search index creation performance"""
        documents = [
            {"id": i, "command": f"cmd{i}", "content": "test" * 100}
            for i in range(5000)
        ]
        
        start_time = time.time()
        search_engine.build_index(documents)
        elapsed = time.time() - start_time
        
        # Index building should be fast
        assert elapsed < 1.0
    
    def test_instant_search_latency(self, search_engine, large_dataset):
        """Test instant search has low latency"""
        search_engine.documents = large_dataset
        
        # Test single character search
        start_time = time.time()
        results = search_engine.instant_search("c")
        elapsed = time.time() - start_time
        
        # Should respond within 10ms
        assert elapsed < 0.01
        
        # Test progressive search
        for i in range(1, 8):
            query = "command"[:i]
            start_time = time.time()
            results = search_engine.instant_search(query)
            elapsed = time.time() - start_time
            
            # Each keystroke should be fast
            assert elapsed < 0.02


class TestCachePerformance:
    """Test cache performance"""
    
    @pytest.fixture
    def cache_manager(self):
        return CacheManager()
    
    def test_cache_hit_performance(self, cache_manager):
        """Test cache hit is faster than miss"""
        # Warm up cache
        key = "test_doc"
        value = {"id": 1, "content": "test" * 1000}
        
        # Test cache miss timing
        miss_start = time.time()
        result = cache_manager.get(key)
        miss_time = time.time() - miss_start
        
        # Set value
        cache_manager.set(key, value)
        
        # Test cache hit timing
        hit_start = time.time()
        result = cache_manager.get(key)
        hit_time = time.time() - hit_start
        
        # Cache hit should be at least 10x faster
        assert hit_time < miss_time / 10
        # Cache hit should be under 1ms
        assert hit_time < 0.001
    
    def test_cache_memory_efficiency(self, cache_manager):
        """Test cache memory usage"""
        # Add many items to cache
        for i in range(1000):
            cache_manager.set(
                f"key_{i}",
                {"id": i, "data": "x" * 1000}
            )
        
        # Cache should have eviction policy
        # Not all 1000 items should be in memory
        assert cache_manager.size() < 1000
    
    def test_cache_concurrent_access(self, cache_manager):
        """Test cache under concurrent access"""
        def cache_operation(i):
            key = f"concurrent_{i % 100}"
            if i % 2 == 0:
                cache_manager.set(key, {"value": i})
            else:
                cache_manager.get(key)
        
        with ThreadPoolExecutor(max_workers=10) as executor:
            start_time = time.time()
            list(executor.map(cache_operation, range(1000)))
            elapsed = time.time() - start_time
        
        # Should handle 1000 operations quickly
        assert elapsed < 1.0
    
    def test_cache_invalidation_performance(self, cache_manager):
        """Test cache invalidation performance"""
        # Add many cache entries
        for i in range(500):
            cache_manager.set(f"doc:{i}", {"id": i})
            cache_manager.set(f"search:{i}", ["result1", "result2"])
        
        start_time = time.time()
        # Invalidate all doc entries
        cache_manager.invalidate_pattern("doc:*")
        elapsed = time.time() - start_time
        
        # Pattern invalidation should be fast
        assert elapsed < 0.1


class TestParsingPerformance:
    """Test document parsing performance"""
    
    @pytest.fixture
    def parser(self):
        return EnhancedGroffParser()
    
    @pytest.fixture
    def sample_groff(self):
        """Generate sample groff content"""
        return """
.TH COMPLEX 1 "January 2024" "Version 1.0" "User Commands"
.SH NAME
complex \\- a complex command with many sections
.SH SYNOPSIS
.B complex
[\\-abcdefghijklmnopqrstuvwxyz]
[\\-\\-long\\-option]
.I file
.SH DESCRIPTION
This is a very long description that contains multiple paragraphs
and various formatting directives.
.PP
""" + "\n".join([f"Line {i} of description." for i in range(100)]) + """
.SH OPTIONS
""" + "\n".join([f"""
.TP
.B \\-{chr(97+i)}
Option {chr(97+i)} description
""" for i in range(26)]) + """
.SH EXAMPLES
""" + "\n".join([f"""
.PP
Example {i}:
.nf
complex -{''.join([chr(97+j) for j in range(i)])} file{i}.txt
.fi
""" for i in range(20)])
    
    def test_parse_groff_performance(self, parser, sample_groff):
        """Test groff parsing performance"""
        start_time = time.time()
        result = parser.parse(sample_groff)
        elapsed = time.time() - start_time
        
        # Should parse complex document quickly
        assert elapsed < 0.05
        assert result["name"] == "complex"
        assert len(result["options"]) == 26
    
    def test_parse_large_document(self, parser):
        """Test parsing very large document"""
        # Generate 1MB document
        large_doc = ".TH LARGE 1\n" + ("Large content line.\n" * 50000)
        
        start_time = time.time()
        result = parser.parse(large_doc)
        elapsed = time.time() - start_time
        
        # Should handle large documents
        assert elapsed < 1.0
    
    def test_concurrent_parsing(self, parser):
        """Test concurrent document parsing"""
        documents = [
            f".TH CMD{i} 1\n.SH DESCRIPTION\nCommand {i}" 
            for i in range(100)
        ]
        
        def parse_doc(doc):
            return parser.parse(doc)
        
        with ThreadPoolExecutor(max_workers=5) as executor:
            start_time = time.time()
            results = list(executor.map(parse_doc, documents))
            elapsed = time.time() - start_time
        
        # Should parse 100 documents concurrently
        assert elapsed < 2.0
        assert len(results) == 100
    
    def test_parser_memory_usage(self, parser, sample_groff):
        """Test parser doesn't leak memory"""
        process = psutil.Process()
        initial_memory = process.memory_info().rss / 1024 / 1024
        
        # Parse many documents
        for _ in range(1000):
            parser.parse(sample_groff)
        
        gc.collect()
        final_memory = process.memory_info().rss / 1024 / 1024
        memory_increase = final_memory - initial_memory
        
        # Should not leak significant memory
        assert memory_increase < 20


class TestDatabasePerformance:
    """Test database query performance"""
    
    @pytest.fixture
    def query_optimizer(self):
        return QueryOptimizer()
    
    def test_query_optimization(self, query_optimizer):
        """Test query optimization improves performance"""
        # Test unoptimized query
        unoptimized = """
        SELECT * FROM manpages 
        WHERE command LIKE '%test%' 
        OR description LIKE '%test%'
        OR content LIKE '%test%'
        """
        
        # Test optimized query
        optimized = query_optimizer.optimize_search_query("test")
        
        # Optimized query should use indexes
        assert "idx_" in str(optimized)
    
    def test_bulk_insert_performance(self):
        """Test bulk insert performance"""
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from src.models.document import ManPage
        
        engine = create_engine("sqlite:///:memory:")
        ManPage.metadata.create_all(engine)
        Session = sessionmaker(bind=engine)
        session = Session()
        
        documents = [
            ManPage(
                command=f"cmd{i}",
                section=1,
                description=f"Description {i}",
                content=f"Content {i}" * 100
            )
            for i in range(1000)
        ]
        
        start_time = time.time()
        session.bulk_save_objects(documents)
        session.commit()
        elapsed = time.time() - start_time
        
        # Should insert 1000 documents quickly
        assert elapsed < 1.0
    
    def test_query_with_joins(self):
        """Test query performance with joins"""
        # Would need proper database setup
        pass
    
    def test_connection_pooling(self):
        """Test database connection pooling efficiency"""
        from sqlalchemy import create_engine
        from sqlalchemy.pool import QueuePool
        
        engine = create_engine(
            "sqlite:///:memory:",
            poolclass=QueuePool,
            pool_size=5,
            max_overflow=10
        )
        
        def execute_query(i):
            with engine.connect() as conn:
                conn.execute("SELECT 1")
        
        with ThreadPoolExecutor(max_workers=20) as executor:
            start_time = time.time()
            list(executor.map(execute_query, range(100)))
            elapsed = time.time() - start_time
        
        # Connection pooling should handle concurrent requests
        assert elapsed < 1.0


class TestAPIPerformance:
    """Test API endpoint performance"""
    
    @pytest.mark.asyncio
    async def test_endpoint_response_times(self):
        """Test API endpoint response times"""
        from httpx import AsyncClient
        from src.main import app
        
        async with AsyncClient(app=app, base_url="http://test") as client:
            endpoints = [
                ("/api/health", "GET", None),
                ("/api/documents", "GET", None),
                ("/api/search?q=test", "GET", None),
            ]
            
            for path, method, data in endpoints:
                start_time = time.time()
                
                if method == "GET":
                    response = await client.get(path)
                else:
                    response = await client.post(path, json=data)
                
                elapsed = time.time() - start_time
                
                # All endpoints should respond quickly
                assert elapsed < 0.2
                assert response.status_code in [200, 201, 401, 422]
    
    @pytest.mark.asyncio
    async def test_concurrent_requests(self):
        """Test API under concurrent load"""
        from httpx import AsyncClient
        from src.main import app
        
        async with AsyncClient(app=app, base_url="http://test") as client:
            async def make_request(i):
                return await client.get(f"/api/search?q=test{i % 10}")
            
            start_time = time.time()
            # Make 50 concurrent requests
            responses = await asyncio.gather(
                *[make_request(i) for i in range(50)]
            )
            elapsed = time.time() - start_time
            
            # Should handle concurrent requests efficiently
            assert elapsed < 5.0
            assert all(r.status_code in [200, 429] for r in responses)
    
    def test_response_size_optimization(self):
        """Test API response sizes are optimized"""
        from fastapi.testclient import TestClient
        from src.main import app
        
        client = TestClient(app)
        
        # Test document list endpoint
        response = client.get("/api/documents?limit=100")
        
        # Response should be compressed
        assert "gzip" in response.headers.get("Content-Encoding", "")
        
        # Check response size is reasonable
        content_length = len(response.content)
        assert content_length < 100000  # Less than 100KB for 100 items


class TestMemoryLeaks:
    """Test for memory leaks"""
    
    def test_search_memory_leak(self):
        """Test search doesn't leak memory"""
        from src.search.optimized_search import OptimizedSearchEngine
        
        engine = OptimizedSearchEngine(db=Mock(), cache=Mock())
        engine.documents = [{"id": i, "content": "test"} for i in range(1000)]
        
        process = psutil.Process()
        initial_memory = process.memory_info().rss
        
        # Perform many searches
        for i in range(10000):
            engine.search(f"test{i % 100}")
        
        gc.collect()
        final_memory = process.memory_info().rss
        
        # Memory should not grow significantly
        memory_growth = (final_memory - initial_memory) / initial_memory
        assert memory_growth < 0.1  # Less than 10% growth
    
    def test_cache_memory_leak(self):
        """Test cache doesn't leak memory"""
        from src.cache.cache_manager import CacheManager
        
        cache = CacheManager()
        
        process = psutil.Process()
        initial_memory = process.memory_info().rss
        
        # Add and remove many items
        for i in range(10000):
            key = f"key_{i % 100}"
            cache.set(key, {"data": "x" * 1000})
            if i % 2 == 0:
                cache.delete(key)
        
        gc.collect()
        final_memory = process.memory_info().rss
        
        # Memory should be stable
        memory_growth = (final_memory - initial_memory) / initial_memory
        assert memory_growth < 0.1