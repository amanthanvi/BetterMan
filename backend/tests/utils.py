"""
Testing utilities for BetterMan
"""
import time
import functools
import asyncio
from contextlib import contextmanager
from unittest.mock import Mock, patch
import json
from typing import Any, Dict, List, Optional

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session


class Timer:
    """Context manager for timing operations"""
    
    def __init__(self, name: str = "Operation"):
        self.name = name
        self.start_time = None
        self.elapsed = None
    
    def __enter__(self):
        self.start_time = time.time()
        return self
    
    def __exit__(self, *args):
        self.elapsed = time.time() - self.start_time
        print(f"{self.name} took {self.elapsed:.3f} seconds")


def assert_response_time(max_seconds: float):
    """Decorator to assert response time"""
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            start = time.time()
            result = func(*args, **kwargs)
            elapsed = time.time() - start
            
            assert elapsed < max_seconds, \
                f"Response time {elapsed:.3f}s exceeded limit of {max_seconds}s"
            
            return result
        return wrapper
    return decorator


@contextmanager
def mock_auth(client: TestClient, user_id: int = 1, role: str = "USER"):
    """Mock authentication for tests"""
    def mock_get_current_user():
        return {
            "id": user_id,
            "username": f"testuser{user_id}",
            "role": role
        }
    
    with patch("src.auth.dependencies.get_current_user", mock_get_current_user):
        yield


class APITestHelper:
    """Helper class for API testing"""
    
    def __init__(self, client: TestClient):
        self.client = client
        self.auth_token = None
    
    def login(self, username: str, password: str) -> Dict[str, Any]:
        """Login and store auth token"""
        response = self.client.post(
            "/api/auth/login",
            json={"username": username, "password": password}
        )
        response.raise_for_status()
        data = response.json()
        self.auth_token = data["access_token"]
        return data
    
    def get_headers(self) -> Dict[str, str]:
        """Get auth headers"""
        if not self.auth_token:
            return {}
        return {"Authorization": f"Bearer {self.auth_token}"}
    
    def get(self, url: str, **kwargs):
        """GET request with auth"""
        headers = kwargs.pop("headers", {})
        headers.update(self.get_headers())
        return self.client.get(url, headers=headers, **kwargs)
    
    def post(self, url: str, **kwargs):
        """POST request with auth"""
        headers = kwargs.pop("headers", {})
        headers.update(self.get_headers())
        return self.client.post(url, headers=headers, **kwargs)
    
    def put(self, url: str, **kwargs):
        """PUT request with auth"""
        headers = kwargs.pop("headers", {})
        headers.update(self.get_headers())
        return self.client.put(url, headers=headers, **kwargs)
    
    def delete(self, url: str, **kwargs):
        """DELETE request with auth"""
        headers = kwargs.pop("headers", {})
        headers.update(self.get_headers())
        return self.client.delete(url, headers=headers, **kwargs)


class DatabaseTestHelper:
    """Helper for database testing"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def create_test_user(self, username: str = "testuser", **kwargs):
        """Create a test user"""
        from src.models.user import User
        
        user = User(
            username=username,
            email=kwargs.get("email", f"{username}@test.com"),
            role=kwargs.get("role", "USER"),
            is_active=kwargs.get("is_active", True)
        )
        user.set_password(kwargs.get("password", "TestPass123!"))
        
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        
        return user
    
    def create_test_document(self, command: str = "testcmd", **kwargs):
        """Create a test document"""
        from src.models.document import ManPage
        
        doc = ManPage(
            command=command,
            section=kwargs.get("section", 1),
            description=kwargs.get("description", f"Test description for {command}"),
            content=kwargs.get("content", f"Test content for {command}"),
            html_content=kwargs.get("html_content", f"<h1>{command}</h1>"),
            tldr=kwargs.get("tldr", f"Test TLDR for {command}")
        )
        
        self.db.add(doc)
        self.db.commit()
        self.db.refresh(doc)
        
        return doc
    
    def cleanup(self):
        """Clean up test data"""
        self.db.rollback()


def mock_redis_client():
    """Create a mock Redis client for testing"""
    class MockRedis:
        def __init__(self):
            self.data = {}
            self.pipeline_data = []
        
        async def get(self, key: str) -> Optional[bytes]:
            return self.data.get(key)
        
        async def set(self, key: str, value: str, ex: Optional[int] = None):
            self.data[key] = value.encode() if isinstance(value, str) else value
            return True
        
        async def delete(self, *keys):
            for key in keys:
                self.data.pop(key, None)
            return len(keys)
        
        async def exists(self, key: str) -> bool:
            return key in self.data
        
        async def incr(self, key: str) -> int:
            val = int(self.data.get(key, b'0').decode())
            val += 1
            self.data[key] = str(val).encode()
            return val
        
        async def expire(self, key: str, seconds: int) -> bool:
            return key in self.data
        
        def pipeline(self):
            return self
        
        async def execute(self):
            return self.pipeline_data
        
        async def scan_iter(self, match: Optional[str] = None):
            pattern = match.replace('*', '') if match else ''
            for key in self.data:
                if not pattern or pattern in key:
                    yield key
    
    return MockRedis()


def assert_valid_json(response_text: str) -> Dict[str, Any]:
    """Assert response is valid JSON and return parsed data"""
    try:
        return json.loads(response_text)
    except json.JSONDecodeError as e:
        raise AssertionError(f"Invalid JSON response: {e}")


def assert_pagination(data: Dict[str, Any], expected_total: Optional[int] = None):
    """Assert response has valid pagination structure"""
    assert "items" in data, "Response missing 'items' field"
    assert "total" in data, "Response missing 'total' field"
    assert "page" in data, "Response missing 'page' field"
    assert "pages" in data, "Response missing 'pages' field"
    
    assert isinstance(data["items"], list), "'items' must be a list"
    assert isinstance(data["total"], int), "'total' must be an integer"
    assert isinstance(data["page"], int), "'page' must be an integer"
    assert isinstance(data["pages"], int), "'pages' must be an integer"
    
    if expected_total is not None:
        assert data["total"] == expected_total, \
            f"Expected total {expected_total}, got {data['total']}"


def generate_test_data(model: str, count: int = 10) -> List[Dict[str, Any]]:
    """Generate test data for different models"""
    from faker import Faker
    fake = Faker()
    
    if model == "user":
        return [{
            "username": fake.user_name(),
            "email": fake.email(),
            "password": "TestPass123!",
            "role": "USER"
        } for _ in range(count)]
    
    elif model == "document":
        return [{
            "command": fake.word(),
            "section": fake.random_int(1, 8),
            "description": fake.sentence(),
            "content": fake.text(),
            "tldr": fake.sentence()
        } for _ in range(count)]
    
    else:
        raise ValueError(f"Unknown model: {model}")


async def async_test_timeout(coro, timeout: float = 5.0):
    """Run async test with timeout"""
    try:
        return await asyncio.wait_for(coro, timeout=timeout)
    except asyncio.TimeoutError:
        raise AssertionError(f"Test timed out after {timeout} seconds")


class MockWebSocket:
    """Mock WebSocket for testing"""
    
    def __init__(self):
        self.sent_messages = []
        self.received_messages = []
        self.closed = False
    
    async def send_text(self, data: str):
        self.sent_messages.append(data)
    
    async def send_json(self, data: Dict[str, Any]):
        self.sent_messages.append(json.dumps(data))
    
    async def receive_text(self) -> str:
        if self.received_messages:
            return self.received_messages.pop(0)
        raise Exception("No messages to receive")
    
    async def receive_json(self) -> Dict[str, Any]:
        text = await self.receive_text()
        return json.loads(text)
    
    async def close(self):
        self.closed = True
    
    def add_message(self, message: str):
        """Add message to be received"""
        self.received_messages.append(message)


def assert_error_response(response, expected_status: int, expected_detail: Optional[str] = None):
    """Assert error response format"""
    assert response.status_code == expected_status, \
        f"Expected status {expected_status}, got {response.status_code}"
    
    data = response.json()
    assert "detail" in data, "Error response missing 'detail' field"
    
    if expected_detail:
        assert expected_detail.lower() in data["detail"].lower(), \
            f"Expected error detail to contain '{expected_detail}', got '{data['detail']}'"