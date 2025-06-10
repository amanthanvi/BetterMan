from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any
import asyncio
import docker
import uuid
import json
import time
import logging
from datetime import datetime
import re

from ..db.session import get_db
from ..auth.dependencies import get_current_user_optional
from ..models.user import User
from ..cache.cache_manager import get_cache_manager, CacheManager
from ..config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/api/terminal", tags=["terminal"])

# Docker client
try:
    docker_client = docker.from_env()
except Exception as e:
    logger.error(f"Failed to initialize Docker client: {e}")
    docker_client = None

# Safe command whitelist
SAFE_COMMANDS = {
    'ls', 'pwd', 'echo', 'cat', 'grep', 'find', 'head', 'tail', 'wc',
    'sort', 'uniq', 'cut', 'awk', 'sed', 'date', 'whoami', 'uname',
    'df', 'du', 'ps', 'top', 'free', 'uptime', 'which', 'whereis',
    'file', 'stat', 'mkdir', 'touch', 'cp', 'mv', 'man', 'help',
    'env', 'printenv', 'expr', 'bc', 'cal', 'clear', 'history'
}

# Dangerous patterns to block
DANGEROUS_PATTERNS = [
    r'rm\s+-rf',
    r'rm\s+-fr',
    r'dd\s+.*of=',
    r'mkfs',
    r'fdisk',
    r'parted',
    r'>\s*/dev/',
    r'</dev/zero',
    r'</dev/urandom',
    r'fork\s*bomb',
    r':\(\)\{:\|:&\};:',
    r'chmod\s+777',
    r'chmod\s+-R',
    r'chown\s+-R',
]

class CommandRequest(BaseModel):
    command: str = Field(..., description="Command to execute")
    session_id: Optional[str] = Field(None, description="Session ID for persistent environment")
    timeout: int = Field(30, ge=1, le=300, description="Command timeout in seconds")
    
    @validator('command')
    def validate_command(cls, v):
        # Basic validation
        if not v or len(v) > 1000:
            raise ValueError("Invalid command length")
        
        # Check for dangerous patterns
        for pattern in DANGEROUS_PATTERNS:
            if re.search(pattern, v, re.IGNORECASE):
                raise ValueError(f"Command contains dangerous pattern: {pattern}")
        
        return v

class CommandResponse(BaseModel):
    output: str
    error: Optional[str] = None
    exit_code: int
    execution_time: float
    session_id: str

class SessionInfo(BaseModel):
    session_id: str
    created_at: datetime
    last_accessed: datetime
    commands_executed: int
    container_id: Optional[str] = None

class TutorialStep(BaseModel):
    step: int
    title: str
    description: str
    command: str
    expected_output: Optional[str] = None
    hint: Optional[str] = None

class CommandSnippet(BaseModel):
    id: str
    title: str
    description: str
    command: str
    category: str
    tags: List[str]
    dangerous: bool = False

# In-memory session storage (in production, use Redis)
sessions: Dict[str, SessionInfo] = {}
containers: Dict[str, Any] = {}

def get_or_create_session(session_id: Optional[str] = None) -> str:
    """Get existing session or create new one"""
    if session_id and session_id in sessions:
        sessions[session_id].last_accessed = datetime.utcnow()
        return session_id
    
    # Create new session
    new_session_id = str(uuid.uuid4())
    sessions[new_session_id] = SessionInfo(
        session_id=new_session_id,
        created_at=datetime.utcnow(),
        last_accessed=datetime.utcnow(),
        commands_executed=0
    )
    return new_session_id

def create_sandbox_container(session_id: str) -> str:
    """Create a Docker container for command execution"""
    if not docker_client:
        raise HTTPException(status_code=503, detail="Docker service unavailable")
    
    try:
        # Create container with resource limits
        container = docker_client.containers.create(
            image="alpine:latest",  # Lightweight Linux
            name=f"betterman-sandbox-{session_id[:8]}",
            command="/bin/sh",
            stdin_open=True,
            tty=True,
            mem_limit="256m",
            cpu_quota=50000,  # 50% of one CPU
            network_mode="none",  # No network access
            read_only=True,  # Read-only root filesystem
            tmpfs={"/tmp": "size=64M,mode=1777"},  # Writable /tmp
            environment={
                "PS1": "$ ",
                "TERM": "xterm-256color"
            },
            labels={
                "betterman": "sandbox",
                "session_id": session_id
            }
        )
        
        container.start()
        containers[session_id] = container
        sessions[session_id].container_id = container.id
        
        # Install basic utilities
        container.exec_run("apk add --no-cache coreutils grep sed awk findutils")
        
        return container.id
    except Exception as e:
        logger.error(f"Failed to create container: {e}")
        raise HTTPException(status_code=500, detail="Failed to create sandbox")

async def execute_in_container(container, command: str, timeout: int) -> tuple[str, str, int]:
    """Execute command in container with timeout"""
    try:
        # Execute command
        result = container.exec_run(
            cmd=f"/bin/sh -c '{command}'",
            stdout=True,
            stderr=True,
            demux=True
        )
        
        stdout = result.output[0].decode('utf-8') if result.output[0] else ""
        stderr = result.output[1].decode('utf-8') if result.output[1] else ""
        
        return stdout, stderr, result.exit_code
    except Exception as e:
        logger.error(f"Command execution failed: {e}")
        return "", str(e), 1

@router.post("/execute", response_model=CommandResponse)
async def execute_command(
    request: CommandRequest,
    background_tasks: BackgroundTasks,
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Execute a command in a sandboxed environment"""
    start_time = time.time()
    
    # Get or create session
    session_id = get_or_create_session(request.session_id)
    
    # Get or create container
    if session_id not in containers:
        create_sandbox_container(session_id)
    
    container = containers.get(session_id)
    if not container:
        raise HTTPException(status_code=500, detail="Failed to get sandbox container")
    
    # Execute command
    stdout, stderr, exit_code = await execute_in_container(
        container, 
        request.command, 
        request.timeout
    )
    
    # Update session info
    sessions[session_id].commands_executed += 1
    
    # Clean up old containers in background
    background_tasks.add_task(cleanup_old_containers)
    
    execution_time = time.time() - start_time
    
    return CommandResponse(
        output=stdout,
        error=stderr if stderr else None,
        exit_code=exit_code,
        execution_time=execution_time,
        session_id=session_id
    )

@router.get("/session/{session_id}", response_model=SessionInfo)
async def get_session_info(
    session_id: str,
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Get information about a session"""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return sessions[session_id]

@router.delete("/session/{session_id}")
async def delete_session(
    session_id: str,
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Delete a session and its container"""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Stop and remove container
    if session_id in containers:
        try:
            container = containers[session_id]
            container.stop()
            container.remove()
            del containers[session_id]
        except Exception as e:
            logger.error(f"Failed to remove container: {e}")
    
    del sessions[session_id]
    
    return {"message": "Session deleted successfully"}

@router.get("/tutorials", response_model=List[Dict[str, Any]])
async def get_tutorials():
    """Get available interactive tutorials"""
    tutorials = [
        {
            "id": "basic-navigation",
            "title": "Basic File Navigation",
            "description": "Learn how to navigate the Linux filesystem",
            "difficulty": "beginner",
            "duration": "10 minutes",
            "steps": 5
        },
        {
            "id": "text-processing",
            "title": "Text Processing with grep, sed, and awk",
            "description": "Master text manipulation commands",
            "difficulty": "intermediate",
            "duration": "20 minutes",
            "steps": 8
        },
        {
            "id": "file-permissions",
            "title": "Understanding File Permissions",
            "description": "Learn about Linux file permissions and ownership",
            "difficulty": "intermediate",
            "duration": "15 minutes",
            "steps": 6
        }
    ]
    
    return tutorials

@router.get("/tutorials/{tutorial_id}/steps", response_model=List[TutorialStep])
async def get_tutorial_steps(tutorial_id: str):
    """Get steps for a specific tutorial"""
    # Example tutorial steps
    if tutorial_id == "basic-navigation":
        return [
            TutorialStep(
                step=1,
                title="Print Working Directory",
                description="Use pwd to see where you are in the filesystem",
                command="pwd",
                expected_output="/home/sandbox",
                hint="pwd stands for 'print working directory'"
            ),
            TutorialStep(
                step=2,
                title="List Files",
                description="Use ls to see files in the current directory",
                command="ls -la",
                hint="The -la flags show all files in long format"
            ),
            TutorialStep(
                step=3,
                title="Create a Directory",
                description="Create a new directory called 'myproject'",
                command="mkdir myproject",
                hint="mkdir stands for 'make directory'"
            ),
            TutorialStep(
                step=4,
                title="Change Directory",
                description="Navigate into the directory you just created",
                command="cd myproject",
                hint="cd stands for 'change directory'"
            ),
            TutorialStep(
                step=5,
                title="Create a File",
                description="Create an empty file called 'README.md'",
                command="touch README.md",
                hint="touch creates an empty file or updates timestamps"
            )
        ]
    
    raise HTTPException(status_code=404, detail="Tutorial not found")

@router.get("/snippets", response_model=List[CommandSnippet])
async def get_command_snippets(
    category: Optional[str] = None,
    search: Optional[str] = None
):
    """Get command snippets library"""
    snippets = [
        CommandSnippet(
            id="find-large-files",
            title="Find Large Files",
            description="Find files larger than 100MB",
            command="find . -type f -size +100M -exec ls -lh {} \\;",
            category="file-management",
            tags=["find", "disk-space", "files"]
        ),
        CommandSnippet(
            id="count-lines",
            title="Count Lines in Files",
            description="Count lines in all .txt files",
            command="find . -name '*.txt' -exec wc -l {} +",
            category="text-processing",
            tags=["wc", "find", "count"]
        ),
        CommandSnippet(
            id="search-replace",
            title="Search and Replace",
            description="Replace text in multiple files",
            command="find . -name '*.txt' -exec sed -i 's/old/new/g' {} +",
            category="text-processing",
            tags=["sed", "find", "replace"]
        ),
        CommandSnippet(
            id="process-monitor",
            title="Monitor Processes",
            description="Show top 10 CPU consuming processes",
            command="ps aux | sort -nrk 3,3 | head -10",
            category="system",
            tags=["ps", "sort", "monitoring"]
        ),
        CommandSnippet(
            id="disk-usage",
            title="Check Disk Usage",
            description="Show disk usage by directory",
            command="du -h --max-depth=1 | sort -hr",
            category="system",
            tags=["du", "disk", "storage"]
        )
    ]
    
    # Filter by category
    if category:
        snippets = [s for s in snippets if s.category == category]
    
    # Search
    if search:
        search_lower = search.lower()
        snippets = [
            s for s in snippets 
            if search_lower in s.title.lower() or 
               search_lower in s.description.lower() or
               any(search_lower in tag for tag in s.tags)
        ]
    
    return snippets

def cleanup_old_containers():
    """Clean up containers older than 1 hour"""
    current_time = datetime.utcnow()
    to_remove = []
    
    for session_id, session_info in sessions.items():
        if (current_time - session_info.last_accessed).total_seconds() > 3600:
            to_remove.append(session_id)
    
    for session_id in to_remove:
        try:
            if session_id in containers:
                container = containers[session_id]
                container.stop()
                container.remove()
                del containers[session_id]
            del sessions[session_id]
        except Exception as e:
            logger.error(f"Failed to clean up session {session_id}: {e}")

# WebSocket endpoint for real-time terminal
from fastapi import WebSocket, WebSocketDisconnect
import pty
import os
import select
import termios
import struct
import fcntl

@router.websocket("/ws/{session_id}")
async def terminal_websocket(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for real-time terminal interaction"""
    await websocket.accept()
    
    # Get or create container
    if session_id not in containers:
        create_sandbox_container(session_id)
    
    container = containers.get(session_id)
    if not container:
        await websocket.close(code=1003, reason="Failed to get container")
        return
    
    try:
        # Create pseudo-terminal
        master_fd, slave_fd = pty.openpty()
        
        # Start shell in container
        exec_id = container.exec_run(
            cmd="/bin/sh",
            stdin=True,
            stdout=True,
            stderr=True,
            tty=True,
            socket=True,
            demux=False
        )
        
        # Handle bidirectional communication
        while True:
            # Check for data from WebSocket
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=0.1)
                if data:
                    os.write(master_fd, data.encode())
            except asyncio.TimeoutError:
                pass
            
            # Check for data from terminal
            if master_fd in select.select([master_fd], [], [], 0)[0]:
                output = os.read(master_fd, 1024).decode()
                await websocket.send_text(output)
            
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for session {session_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        os.close(master_fd)
        os.close(slave_fd)