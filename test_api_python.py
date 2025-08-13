#!/usr/bin/env python3
"""
Test script for BetterMan API endpoints
Tests man page retrieval, search, and database connectivity
"""

import requests
import json
import sys
from typing import Dict, List, Any
from datetime import datetime

# Configuration
BACKEND_URL = sys.argv[1] if len(sys.argv) > 1 else "https://backend-production-df7c.up.railway.app"
API_URL = f"{BACKEND_URL}/api"

# ANSI colors for terminal output
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
BOLD = '\033[1m'
RESET = '\033[0m'

def print_header(title: str):
    """Print a formatted section header"""
    print(f"\n{BOLD}{BLUE}{'='*60}{RESET}")
    print(f"{BOLD}{title}{RESET}")
    print(f"{BOLD}{BLUE}{'='*60}{RESET}")

def print_result(test_name: str, success: bool, details: str = ""):
    """Print test result with color coding"""
    status = f"{GREEN}✓ PASS{RESET}" if success else f"{RED}✗ FAIL{RESET}"
    print(f"  {test_name}: {status}")
    if details:
        print(f"    {details}")

def test_health_check() -> bool:
    """Test the health check endpoint"""
    try:
        response = requests.get(f"{API_URL}/health", timeout=5)
        if response.status_code == 200:
            data = response.json()
            db_status = data.get('database', {}).get('status', 'unknown')
            doc_count = data.get('database', {}).get('document_count', 0)
            print_result("Health Check", True, 
                        f"DB: {db_status}, Documents: {doc_count}")
            return True
        else:
            print_result("Health Check", False, 
                        f"HTTP {response.status_code}")
            return False
    except Exception as e:
        print_result("Health Check", False, str(e))
        return False

def test_man_page_stats() -> Dict[str, Any]:
    """Test the stats endpoint and return statistics"""
    try:
        response = requests.get(f"{API_URL}/man/stats", timeout=5)
        if response.status_code == 200:
            data = response.json()
            total = data.get('total_pages', 0)
            categories = data.get('categories', {})
            print_result("Stats Endpoint", True, 
                        f"Total pages: {total}")
            if categories:
                print(f"    Categories: {', '.join(list(categories.keys())[:5])}...")
            return data
        else:
            print_result("Stats Endpoint", False, 
                        f"HTTP {response.status_code}")
            return {}
    except Exception as e:
        print_result("Stats Endpoint", False, str(e))
        return {}

def test_man_page(command: str, section: str = "1") -> bool:
    """Test retrieval of a specific man page"""
    try:
        response = requests.get(f"{API_URL}/man/commands/{command}/{section}", 
                               timeout=5)
        if response.status_code == 200:
            data = response.json()
            # Verify content
            if data.get('name') == command:
                desc = data.get('description', '')[:50]
                print_result(f"man {command}({section})", True, 
                           f"Description: {desc}...")
                return True
            else:
                print_result(f"man {command}({section})", False, 
                           "Invalid response content")
                return False
        elif response.status_code == 404:
            print_result(f"man {command}({section})", False, "Not found")
            return False
        else:
            print_result(f"man {command}({section})", False, 
                        f"HTTP {response.status_code}")
            return False
    except Exception as e:
        print_result(f"man {command}({section})", False, str(e))
        return False

def test_search(query: str) -> bool:
    """Test the search endpoint"""
    try:
        response = requests.get(f"{API_URL}/search", 
                               params={"q": query, "limit": 5},
                               timeout=5)
        if response.status_code == 200:
            data = response.json()
            results = data.get('results', [])
            total = data.get('total', 0)
            if results:
                names = [r.get('name', '') for r in results[:3]]
                print_result(f"Search '{query}'", True, 
                           f"Found {total} results: {', '.join(names)}...")
            else:
                print_result(f"Search '{query}'", True, 
                           f"No results (but endpoint works)")
            return True
        else:
            print_result(f"Search '{query}'", False, 
                        f"HTTP {response.status_code}")
            return False
    except Exception as e:
        print_result(f"Search '{query}'", False, str(e))
        return False

def test_enhanced_search(query: str) -> bool:
    """Test the enhanced search endpoint with fuzzy matching"""
    try:
        payload = {
            "query": query,
            "limit": 5,
            "fuzzy": True,
            "fuzzy_threshold": 0.3
        }
        response = requests.post(f"{API_URL}/search/enhanced", 
                                json=payload,
                                timeout=5)
        if response.status_code == 200:
            data = response.json()
            results = data.get('results', [])
            search_types = data.get('search_types', [])
            if results:
                names = [r.get('name', '') for r in results[:3]]
                print_result(f"Enhanced Search '{query}'", True, 
                           f"Types: {', '.join(search_types)}, Results: {', '.join(names)}")
            else:
                print_result(f"Enhanced Search '{query}'", True, 
                           "No results (but endpoint works)")
            return True
        else:
            print_result(f"Enhanced Search '{query}'", False, 
                        f"HTTP {response.status_code}")
            return False
    except Exception as e:
        print_result(f"Enhanced Search '{query}'", False, str(e))
        return False

def test_autocomplete(prefix: str) -> bool:
    """Test the autocomplete endpoint"""
    try:
        response = requests.get(f"{API_URL}/search/autocomplete", 
                               params={"q": prefix, "limit": 5},
                               timeout=5)
        if response.status_code == 200:
            data = response.json()
            suggestions = data.get('suggestions', [])
            if suggestions:
                print_result(f"Autocomplete '{prefix}'", True, 
                           f"Suggestions: {', '.join(suggestions)}")
            else:
                print_result(f"Autocomplete '{prefix}'", True, 
                           "No suggestions")
            return True
        else:
            print_result(f"Autocomplete '{prefix}'", False, 
                        f"HTTP {response.status_code}")
            return False
    except Exception as e:
        print_result(f"Autocomplete '{prefix}'", False, str(e))
        return False

def test_similar_commands(command: str) -> bool:
    """Test the similar commands endpoint"""
    try:
        response = requests.get(f"{API_URL}/search/similar/{command}", 
                               params={"limit": 3},
                               timeout=5)
        if response.status_code == 200:
            data = response.json()
            similar = data.get('similar', [])
            if similar:
                names = [s.get('name', '') for s in similar]
                print_result(f"Similar to '{command}'", True, 
                           f"Found: {', '.join(names)}")
            else:
                print_result(f"Similar to '{command}'", True, 
                           "No similar commands")
            return True
        else:
            print_result(f"Similar to '{command}'", False, 
                        f"HTTP {response.status_code}")
            return False
    except Exception as e:
        print_result(f"Similar to '{command}'", False, str(e))
        return False

def main():
    """Run all tests"""
    print(f"{BOLD}BetterMan API Test Suite{RESET}")
    print(f"Backend URL: {BACKEND_URL}")
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Track results
    total_tests = 0
    passed_tests = 0
    
    # 1. Health and Stats
    print_header("1. System Health & Statistics")
    if test_health_check():
        passed_tests += 1
    total_tests += 1
    
    stats = test_man_page_stats()
    if stats:
        passed_tests += 1
    total_tests += 1
    
    # 2. Individual Man Pages
    print_header("2. Man Page Retrieval")
    test_commands = [
        ("ls", "1"), ("grep", "1"), ("curl", "1"), ("git", "1"),
        ("tar", "1"), ("ps", "1"), ("cat", "1"), ("mkdir", "1"),
        ("printf", "1"), ("printf", "3"),  # Test different sections
        ("passwd", "5"), ("man", "7")
    ]
    
    for cmd, section in test_commands:
        if test_man_page(cmd, section):
            passed_tests += 1
        total_tests += 1
    
    # 3. Search Functionality
    print_header("3. Search Functionality")
    
    # Basic search
    search_queries = ["ls", "grep", "network", "file"]
    for query in search_queries:
        if test_search(query):
            passed_tests += 1
        total_tests += 1
    
    # Enhanced search
    for query in ["grp", "nework"]:  # Test fuzzy matching with typos
        if test_enhanced_search(query):
            passed_tests += 1
        total_tests += 1
    
    # 4. Autocomplete
    print_header("4. Autocomplete & Suggestions")
    
    for prefix in ["git", "doc", "sys"]:
        if test_autocomplete(prefix):
            passed_tests += 1
        total_tests += 1
    
    # 5. Similar Commands
    for cmd in ["grep", "ls", "docker"]:
        if test_similar_commands(cmd):
            passed_tests += 1
        total_tests += 1
    
    # Summary
    print_header("Test Summary")
    success_rate = (passed_tests / total_tests * 100) if total_tests > 0 else 0
    
    print(f"  Total Tests: {total_tests}")
    print(f"  {GREEN}Passed: {passed_tests}{RESET}")
    print(f"  {RED}Failed: {total_tests - passed_tests}{RESET}")
    print(f"  Success Rate: {success_rate:.1f}%")
    
    if success_rate >= 80:
        print(f"\n{GREEN}{BOLD}✓ API is working well!{RESET}")
        print(f"  Man pages are accessible and searchable.")
    elif success_rate >= 50:
        print(f"\n{YELLOW}{BOLD}⚠ API is partially working{RESET}")
        print(f"  Some endpoints may need attention.")
    else:
        print(f"\n{RED}{BOLD}✗ API has significant issues{RESET}")
        print(f"  Check backend logs and database connectivity.")
    
    # Return exit code based on success
    sys.exit(0 if success_rate >= 80 else 1)

if __name__ == "__main__":
    main()