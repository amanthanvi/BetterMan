# BetterMan API Endpoints

## Man Pages API (`/api/man/*`)

**Note:** All endpoints are prefixed with `/api` automatically by the FastAPI application.

These endpoints provide access to Linux man pages stored in PostgreSQL.

### 1. Search Man Pages
**GET** `/api/man/search`

Search across all man pages using PostgreSQL full-text search.

**Query Parameters:**
- `q` (required): Search query
- `limit` (optional): Results per page (default: 20, max: 100)
- `offset` (optional): Pagination offset (default: 0)
- `category` (optional): Filter by category
- `section` (optional): Filter by section

**Example:**
```bash
curl "https://api.betterman.dev/api/man/search?q=network&category=network&limit=10"
```

**Response:**
```json
{
  "query": "network",
  "results": [
    {
      "id": "uuid",
      "name": "ping",
      "section": "8",
      "title": "send ICMP ECHO_REQUEST to network hosts",
      "description": "...",
      "category": "network",
      "relevance": 0.95,
      "snippet": "highlighted text..."
    }
  ],
  "total": 25,
  "limit": 10,
  "offset": 0,
  "filters": {
    "category": "network",
    "section": null
  }
}
```

### 2. Get Specific Command
**GET** `/api/man/commands/{name}/{section}`

Get detailed information about a specific command.

**Path Parameters:**
- `name`: Command name (e.g., "ls")
- `section`: Man page section (e.g., "1")

**Example:**
```bash
curl "https://api.betterman.dev/api/man/commands/ls/1"
```

**Response:**
```json
{
  "id": "uuid",
  "name": "ls",
  "section": "1",
  "title": "list directory contents",
  "description": "List information about the FILEs...",
  "synopsis": "ls [OPTION]... [FILE]...",
  "content": {
    "raw": "full man page text",
    "options": [...],
    "examples": [...],
    "see_also": [...]
  },
  "category": "file_operations",
  "related_commands": ["dir", "vdir"],
  "meta_data": {...},
  "view_count": 1234,
  "is_common": true,
  "last_accessed": "2025-01-11T12:00:00Z"
}
```

### 3. List Commands
**GET** `/api/man/commands`

List all commands with filtering and pagination.

**Query Parameters:**
- `category` (optional): Filter by category
- `section` (optional): Filter by section
- `is_common` (optional): Filter common commands (true/false)
- `limit` (optional): Results per page (default: 20)
- `offset` (optional): Pagination offset

**Example:**
```bash
curl "https://api.betterman.dev/api/man/commands?category=network&is_common=true"
```

### 4. Get Categories
**GET** `/api/man/categories`

Get all command categories with statistics.

**Example:**
```bash
curl "https://api.betterman.dev/api/man/categories"
```

**Response:**
```json
[
  {
    "name": "network",
    "slug": "network",
    "description": "Network utilities and communication",
    "icon": "🌐",
    "color": "#BD10E0",
    "command_count": 25,
    "popular_commands": ["ping", "curl", "ssh", "netstat", "ip"]
  }
]
```

### 5. Get Popular Commands
**GET** `/api/man/popular`

Get popular commands based on view counts.

**Query Parameters:**
- `period`: Time period - "daily", "weekly", "monthly", "all_time" (default: "weekly")
- `limit`: Number of results (default: 10, max: 50)

**Example:**
```bash
curl "https://api.betterman.dev/api/man/popular?period=weekly&limit=5"
```

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "ls",
    "section": "1",
    "title": "list directory contents",
    "category": "file_operations",
    "view_count": 5432,
    "rank": 1,
    "score": 5432.0,
    "trend": "rising"
  }
]
```

### 6. Get Related Commands
**GET** `/api/man/related/{name}`

Get commands related to a specific command.

**Path Parameters:**
- `name`: Command name

**Query Parameters:**
- `limit`: Number of results (default: 10, max: 50)

**Example:**
```bash
curl "https://api.betterman.dev/api/man/related/grep?limit=5"
```

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "egrep",
    "section": "1",
    "title": "print lines matching a pattern",
    "category": "text_processing",
    "is_common": true,
    "view_count": 234
  }
]
```

### 7. Health Check
**GET** `/api/man/health`

Check the health of man pages data and services.

**Example:**
```bash
curl "https://api.betterman.dev/api/man/health"
```

**Response:**
```json
{
  "status": "healthy",
  "database": {
    "man_pages": 204,
    "categories": 7
  },
  "cache": "healthy",
  "timestamp": "2025-01-11T12:00:00Z"
}
```

## Caching Strategy

- **Search results**: 5 minutes TTL
- **Command details**: 1 hour TTL
- **Categories**: 2 hours TTL
- **Popular commands**: 30 minutes TTL
- **Related commands**: 1 hour TTL

## Rate Limiting

All endpoints are rate-limited to 100 requests per minute per IP address.

## Error Responses

All errors follow this format:

```json
{
  "detail": "Error message",
  "status_code": 404
}
```

Common status codes:
- `200`: Success
- `404`: Resource not found
- `422`: Validation error
- `429`: Rate limit exceeded
- `500`: Internal server error
- `503`: Service unavailable