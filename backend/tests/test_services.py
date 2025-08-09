"""
Unit tests for backend services
"""
import pytest
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from src.services.document_service import DocumentService
from src.services.search_service import SearchService
from src.services.parser_service import ParserService
from src.services.cache_service import CacheService
from src.models.document import ManPage, ManPageVersion
from src.models.user import User, UserRole
from src.auth.auth_service import AuthService
from src.errors import (
    NotFoundError, 
    ValidationError, 
    AuthenticationError,
    RateLimitError
)


class TestDocumentService:
    """Test cases for DocumentService"""
    
    @pytest.fixture
    def mock_db(self):
        return Mock(spec=Session)
    
    @pytest.fixture
    def mock_cache(self):
        return Mock(spec=CacheService)
    
    @pytest.fixture
    def document_service(self, mock_db, mock_cache):
        return DocumentService(db=mock_db, cache=mock_cache)
    
    def test_get_document_from_cache(self, document_service, mock_cache):
        """Test retrieving document from cache"""
        expected_doc = {
            "id": 1,
            "command": "ls",
            "content": "List directory contents"
        }
        mock_cache.get.return_value = expected_doc
        
        result = document_service.get_document("ls")
        
        assert result == expected_doc
        mock_cache.get.assert_called_once_with("doc:ls")
    
    def test_get_document_from_db(self, document_service, mock_db, mock_cache):
        """Test retrieving document from database when cache misses"""
        mock_cache.get.return_value = None
        
        mock_doc = Mock(spec=ManPage)
        mock_doc.id = 1
        mock_doc.command = "ls"
        mock_doc.content = "List directory contents"
        mock_doc.to_dict = Mock(return_value={
            "id": 1,
            "command": "ls",
            "content": "List directory contents"
        })
        
        mock_db.query.return_value.filter.return_value.first.return_value = mock_doc
        
        result = document_service.get_document("ls")
        
        assert result["command"] == "ls"
        mock_cache.set.assert_called_once()
    
    def test_get_document_not_found(self, document_service, mock_db, mock_cache):
        """Test document not found error"""
        mock_cache.get.return_value = None
        mock_db.query.return_value.filter.return_value.first.return_value = None
        
        with pytest.raises(NotFoundError):
            document_service.get_document("nonexistent")
    
    def test_create_document(self, document_service, mock_db, mock_cache):
        """Test creating a new document"""
        doc_data = {
            "command": "newcmd",
            "content": "New command content",
            "section": 1
        }
        
        result = document_service.create_document(doc_data)
        
        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()
        mock_cache.delete.assert_called_with("doc:newcmd")
    
    def test_update_document(self, document_service, mock_db, mock_cache):
        """Test updating an existing document"""
        mock_doc = Mock(spec=ManPage)
        mock_doc.command = "ls"
        mock_db.query.return_value.filter.return_value.first.return_value = mock_doc
        
        update_data = {"content": "Updated content"}
        result = document_service.update_document("ls", update_data)
        
        assert mock_doc.content == "Updated content"
        mock_db.commit.assert_called_once()
        mock_cache.delete.assert_called_with("doc:ls")
    
    def test_delete_document(self, document_service, mock_db, mock_cache):
        """Test deleting a document"""
        mock_doc = Mock(spec=ManPage)
        mock_db.query.return_value.filter.return_value.first.return_value = mock_doc
        
        document_service.delete_document("ls")
        
        mock_db.delete.assert_called_once_with(mock_doc)
        mock_db.commit.assert_called_once()
        mock_cache.delete.assert_called_with("doc:ls")


class TestSearchService:
    """Test cases for SearchService"""
    
    @pytest.fixture
    def mock_db(self):
        return Mock(spec=Session)
    
    @pytest.fixture
    def mock_cache(self):
        return Mock(spec=CacheService)
    
    @pytest.fixture
    def search_service(self, mock_db, mock_cache):
        return SearchService(db=mock_db, cache=mock_cache)
    
    def test_search_basic(self, search_service, mock_db):
        """Test basic search functionality"""
        mock_results = [
            Mock(id=1, command="ls", description="List directory contents"),
            Mock(id=2, command="lsof", description="List open files")
        ]
        
        mock_db.query.return_value.filter.return_value.limit.return_value.all.return_value = mock_results
        
        results = search_service.search("ls")
        
        assert len(results) == 2
        assert results[0].command == "ls"
    
    def test_search_with_filters(self, search_service, mock_db):
        """Test search with section filter"""
        mock_results = [
            Mock(id=1, command="printf", section=1),
            Mock(id=2, command="printf", section=3)
        ]
        
        mock_query = mock_db.query.return_value
        mock_query.filter.return_value = mock_query
        mock_query.limit.return_value.all.return_value = mock_results
        
        results = search_service.search("printf", section=1)
        
        assert len(results) == 2
    
    def test_fuzzy_search(self, search_service, mock_db):
        """Test fuzzy search functionality"""
        mock_results = [
            Mock(id=1, command="grep", similarity_score=0.9),
            Mock(id=2, command="egrep", similarity_score=0.8)
        ]
        
        mock_db.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = mock_results
        
        results = search_service.fuzzy_search("gerp")
        
        assert len(results) == 2
        assert results[0].command == "grep"
    
    def test_search_cache_hit(self, search_service, mock_cache):
        """Test search results from cache"""
        cached_results = [
            {"id": 1, "command": "ls"},
            {"id": 2, "command": "lsof"}
        ]
        mock_cache.get.return_value = cached_results
        
        results = search_service.search("ls")
        
        assert results == cached_results
        mock_cache.get.assert_called_once()
    
    def test_instant_search(self, search_service, mock_db):
        """Test instant search with prefix matching"""
        mock_results = [
            Mock(id=1, command="git", score=1.0),
            Mock(id=2, command="gitk", score=0.9)
        ]
        
        mock_db.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = mock_results
        
        results = search_service.instant_search("gi")
        
        assert len(results) == 2
        assert results[0].command == "git"


class TestAuthService:
    """Test cases for AuthService"""
    
    @pytest.fixture
    def mock_db(self):
        return Mock(spec=Session)
    
    @pytest.fixture
    def auth_service(self, mock_db):
        return AuthService(db=mock_db)
    
    def test_register_user(self, auth_service, mock_db):
        """Test user registration"""
        user_data = {
            "username": "testuser",
            "email": "test@example.com",
            "password": "SecurePass123!"
        }
        
        mock_db.query.return_value.filter.return_value.first.return_value = None
        
        user = auth_service.register_user(user_data)
        
        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()
        assert user.username == "testuser"
    
    def test_register_duplicate_user(self, auth_service, mock_db):
        """Test registration with existing username"""
        existing_user = Mock(spec=User)
        mock_db.query.return_value.filter.return_value.first.return_value = existing_user
        
        with pytest.raises(ValidationError):
            auth_service.register_user({
                "username": "existing",
                "email": "new@example.com",
                "password": "Pass123!"
            })
    
    def test_login_valid_credentials(self, auth_service, mock_db):
        """Test login with valid credentials"""
        mock_user = Mock(spec=User)
        mock_user.id = 1
        mock_user.username = "testuser"
        mock_user.verify_password = Mock(return_value=True)
        mock_user.is_active = True
        
        mock_db.query.return_value.filter.return_value.first.return_value = mock_user
        
        token = auth_service.login("testuser", "password")
        
        assert "access_token" in token
        assert "refresh_token" in token
    
    def test_login_invalid_credentials(self, auth_service, mock_db):
        """Test login with invalid credentials"""
        mock_user = Mock(spec=User)
        mock_user.verify_password = Mock(return_value=False)
        
        mock_db.query.return_value.filter.return_value.first.return_value = mock_user
        
        with pytest.raises(AuthenticationError):
            auth_service.login("testuser", "wrongpass")
    
    def test_login_inactive_user(self, auth_service, mock_db):
        """Test login with inactive user"""
        mock_user = Mock(spec=User)
        mock_user.verify_password = Mock(return_value=True)
        mock_user.is_active = False
        
        mock_db.query.return_value.filter.return_value.first.return_value = mock_user
        
        with pytest.raises(AuthenticationError):
            auth_service.login("testuser", "password")
    
    def test_verify_2fa(self, auth_service, mock_db):
        """Test 2FA verification"""
        mock_user = Mock(spec=User)
        mock_user.totp_secret = "SECRET123"
        mock_user.verify_totp = Mock(return_value=True)
        
        mock_db.query.return_value.filter.return_value.first.return_value = mock_user
        
        result = auth_service.verify_2fa(1, "123456")
        
        assert result is True
        mock_user.verify_totp.assert_called_once_with("123456")
    
    def test_refresh_token(self, auth_service):
        """Test token refresh"""
        valid_token = auth_service.create_refresh_token({"sub": "1"})
        
        new_token = auth_service.refresh_token(valid_token)
        
        assert "access_token" in new_token
        assert new_token["access_token"] != valid_token


class TestParserService:
    """Test cases for ParserService"""
    
    @pytest.fixture
    def parser_service(self):
        return ParserService()
    
    def test_parse_groff_basic(self, parser_service):
        """Test basic groff parsing"""
        groff_content = """
.TH LS 1 "January 2024" "GNU coreutils" "User Commands"
.SH NAME
ls \\- list directory contents
.SH SYNOPSIS
.B ls
[OPTION]... [FILE]...
.SH DESCRIPTION
List information about the FILEs.
"""
        
        result = parser_service.parse_groff(groff_content)
        
        assert result["name"] == "ls"
        assert result["section"] == "1"
        assert "list directory contents" in result["description"]
    
    def test_parse_groff_with_options(self, parser_service):
        """Test parsing groff with options"""
        groff_content = """
.TH TEST 1
.SH OPTIONS
.TP
.B \\-a, \\-\\-all
do not ignore entries starting with .
.TP
.B \\-l
use a long listing format
"""
        
        result = parser_service.parse_groff(groff_content)
        
        assert len(result["options"]) == 2
        assert result["options"][0]["flag"] == "-a, --all"
    
    def test_parse_groff_with_examples(self, parser_service):
        """Test parsing groff with examples"""
        groff_content = """
.TH TEST 1
.SH EXAMPLES
.PP
List all files:
.PP
.nf
ls -la
.fi
.PP
List with human readable sizes:
.PP
.nf
ls -lh
.fi
"""
        
        result = parser_service.parse_groff(groff_content)
        
        assert len(result["examples"]) == 2
        assert "ls -la" in result["examples"][0]
    
    def test_parse_invalid_groff(self, parser_service):
        """Test parsing invalid groff content"""
        with pytest.raises(ValidationError):
            parser_service.parse_groff("This is not groff")
    
    def test_sanitize_groff_output(self, parser_service):
        """Test groff output sanitization"""
        unsafe_content = """
<script>alert('xss')</script>
.TH TEST 1
.SH DESCRIPTION
Test & <special> characters
"""
        
        result = parser_service.parse_groff(unsafe_content)
        
        assert "<script>" not in str(result)
        assert "&lt;special&gt;" in result["description"]


class TestCacheService:
    """Test cases for CacheService"""
    
    @pytest.fixture
    def mock_redis(self):
        return Mock()
    
    @pytest.fixture
    def cache_service(self, mock_redis):
        service = CacheService()
        service.redis_client = mock_redis
        return service
    
    def test_get_from_cache(self, cache_service, mock_redis):
        """Test retrieving value from cache"""
        mock_redis.get.return_value = b'{"key": "value"}'
        
        result = cache_service.get("test_key")
        
        assert result == {"key": "value"}
        mock_redis.get.assert_called_once_with("test_key")
    
    def test_get_cache_miss(self, cache_service, mock_redis):
        """Test cache miss"""
        mock_redis.get.return_value = None
        
        result = cache_service.get("missing_key")
        
        assert result is None
    
    def test_set_cache(self, cache_service, mock_redis):
        """Test setting value in cache"""
        cache_service.set("test_key", {"data": "value"}, ttl=300)
        
        mock_redis.setex.assert_called_once()
        args = mock_redis.setex.call_args[0]
        assert args[0] == "test_key"
        assert args[1] == 300
    
    def test_delete_from_cache(self, cache_service, mock_redis):
        """Test deleting from cache"""
        cache_service.delete("test_key")
        
        mock_redis.delete.assert_called_once_with("test_key")
    
    def test_cache_fallback_on_redis_error(self, cache_service, mock_redis):
        """Test fallback to in-memory cache on Redis error"""
        mock_redis.get.side_effect = Exception("Redis connection error")
        
        # Should not raise exception
        result = cache_service.get("test_key")
        assert result is None
        
        # Set should work with in-memory fallback
        cache_service.set("test_key", {"data": "value"})
        result = cache_service.get("test_key")
        assert result == {"data": "value"}
    
    def test_invalidate_pattern(self, cache_service, mock_redis):
        """Test invalidating cache by pattern"""
        mock_redis.scan_iter.return_value = ["doc:1", "doc:2", "doc:3"]
        
        cache_service.invalidate_pattern("doc:*")
        
        assert mock_redis.delete.call_count == 3


class TestRateLimiter:
    """Test cases for rate limiting"""
    
    @pytest.fixture
    def mock_redis(self):
        return Mock()
    
    @pytest.fixture
    def rate_limiter(self, mock_redis):
        from src.security.rate_limiter import RateLimiter
        limiter = RateLimiter()
        limiter.redis_client = mock_redis
        return limiter
    
    def test_rate_limit_allows_request(self, rate_limiter, mock_redis):
        """Test rate limiter allows request within limit"""
        mock_redis.incr.return_value = 5
        mock_redis.expire.return_value = True
        
        result = rate_limiter.check_rate_limit("user123", limit=10)
        
        assert result is True
    
    def test_rate_limit_blocks_request(self, rate_limiter, mock_redis):
        """Test rate limiter blocks request over limit"""
        mock_redis.incr.return_value = 11
        
        with pytest.raises(RateLimitError):
            rate_limiter.check_rate_limit("user123", limit=10)
    
    def test_rate_limit_by_endpoint(self, rate_limiter, mock_redis):
        """Test different rate limits per endpoint"""
        mock_redis.incr.return_value = 50
        
        # Search endpoint with higher limit
        result = rate_limiter.check_rate_limit("user123", endpoint="search", limit=100)
        assert result is True
        
        # API endpoint with lower limit
        with pytest.raises(RateLimitError):
            rate_limiter.check_rate_limit("user123", endpoint="api", limit=30)