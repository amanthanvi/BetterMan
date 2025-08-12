"""
Response compression middleware for BetterMan.
"""

import gzip
import brotli
from typing import Callable, Optional
from starlette.types import ASGIApp, Receive, Scope, Send
from starlette.datastructures import Headers, MutableHeaders
from starlette.responses import Response
import io


class CompressionMiddleware:
    """
    Middleware to compress responses using gzip or brotli.
    """
    
    def __init__(
        self,
        app: ASGIApp,
        minimum_size: int = 1024,
        gzip_level: int = 6,
        brotli_quality: int = 4,
        brotli_mode: int = 0,
        exclude_paths: Optional[list] = None,
        exclude_media_types: Optional[list] = None,
    ):
        self.app = app
        self.minimum_size = minimum_size
        self.gzip_level = gzip_level
        self.brotli_quality = brotli_quality
        self.brotli_mode = brotli_mode
        self.exclude_paths = exclude_paths or []
        self.exclude_media_types = exclude_media_types or [
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp",
            "video/mp4",
            "video/webm",
            "audio/mpeg",
            "audio/ogg",
        ]
    
    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        
        # Check if path should be excluded
        path = scope.get("path", "")
        if any(path.startswith(excluded) for excluded in self.exclude_paths):
            await self.app(scope, receive, send)
            return
        
        # Get accept-encoding header
        headers = Headers(scope=scope)
        accept_encoding = headers.get("accept-encoding", "")
        
        # Determine compression method
        if "br" in accept_encoding and brotli:
            encoding = "br"
            compressor = self._brotli_compress
        elif "gzip" in accept_encoding:
            encoding = "gzip"
            compressor = self._gzip_compress
        else:
            await self.app(scope, receive, send)
            return
        
        # Buffer to collect response body
        body_parts = []
        headers_sent = False
        content_type = None
        
        async def send_wrapper(message):
            nonlocal headers_sent, content_type, body_parts
            
            if message["type"] == "http.response.start":
                headers_list = message.get("headers", [])
                headers = MutableHeaders(raw=headers_list)
                
                # Check content type
                content_type = headers.get("content-type", "")
                if any(content_type.startswith(excluded) for excluded in self.exclude_media_types):
                    await send(message)
                    headers_sent = True
                    return
                
                # Don't compress if already encoded
                if headers.get("content-encoding"):
                    await send(message)
                    headers_sent = True
                    return
                
                # Store headers for later
                headers_sent = message
                
            elif message["type"] == "http.response.body":
                if headers_sent is True:
                    # Already sent headers without compression
                    await send(message)
                    return
                
                body = message.get("body", b"")
                if body:
                    body_parts.append(body)
                
                if not message.get("more_body", False):
                    # All body parts collected, compress and send
                    full_body = b"".join(body_parts)
                    
                    # Check minimum size
                    if len(full_body) < self.minimum_size:
                        # Send uncompressed
                        await send(headers_sent)
                        await send({
                            "type": "http.response.body",
                            "body": full_body,
                        })
                        return
                    
                    # Compress body
                    compressed_body = compressor(full_body)
                    
                    # Update headers
                    headers_list = headers_sent.get("headers", [])
                    headers = MutableHeaders(raw=headers_list)
                    headers["content-encoding"] = encoding
                    headers["content-length"] = str(len(compressed_body))
                    headers.setdefault("vary", "Accept-Encoding")
                    headers_sent["headers"] = headers.raw
                    
                    # Send compressed response
                    await send(headers_sent)
                    await send({
                        "type": "http.response.body",
                        "body": compressed_body,
                    })
        
        await self.app(scope, receive, send_wrapper)
    
    def _gzip_compress(self, data: bytes) -> bytes:
        """Compress data using gzip."""
        return gzip.compress(data, compresslevel=self.gzip_level)
    
    def _brotli_compress(self, data: bytes) -> bytes:
        """Compress data using brotli."""
        return brotli.compress(
            data,
            quality=self.brotli_quality,
            mode=self.brotli_mode,
        )


class StreamingCompressionMiddleware:
    """
    Middleware to compress streaming responses using gzip or brotli.
    """
    
    def __init__(
        self,
        app: ASGIApp,
        minimum_size: int = 1024,
        gzip_level: int = 6,
        brotli_quality: int = 4,
    ):
        self.app = app
        self.minimum_size = minimum_size
        self.gzip_level = gzip_level
        self.brotli_quality = brotli_quality
    
    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        
        headers = Headers(scope=scope)
        accept_encoding = headers.get("accept-encoding", "")
        
        # Determine compression method
        if "br" in accept_encoding and brotli:
            encoding = "br"
            compressor_class = BrotliCompressor
        elif "gzip" in accept_encoding:
            encoding = "gzip" 
            compressor_class = GzipCompressor
        else:
            await self.app(scope, receive, send)
            return
        
        compressor = None
        headers_sent = False
        
        async def send_wrapper(message):
            nonlocal compressor, headers_sent
            
            if message["type"] == "http.response.start":
                headers_list = message.get("headers", [])
                headers = MutableHeaders(raw=headers_list)
                
                # Don't compress if already encoded
                if not headers.get("content-encoding"):
                    headers["content-encoding"] = encoding
                    headers.setdefault("vary", "Accept-Encoding")
                    
                    # Remove content-length for streaming
                    headers.pop("content-length", None)
                    
                    # Initialize compressor
                    compressor = compressor_class(
                        level=self.gzip_level if encoding == "gzip" else self.brotli_quality
                    )
                
                await send(message)
                headers_sent = True
                
            elif message["type"] == "http.response.body":
                body = message.get("body", b"")
                more_body = message.get("more_body", False)
                
                if compressor and body:
                    # Compress chunk
                    compressed = compressor.compress(body)
                    if compressed:
                        await send({
                            "type": "http.response.body",
                            "body": compressed,
                            "more_body": True,
                        })
                
                if not more_body:
                    # Flush remaining data
                    if compressor:
                        final = compressor.flush()
                        if final:
                            await send({
                                "type": "http.response.body",
                                "body": final,
                                "more_body": False,
                            })
                        else:
                            await send({
                                "type": "http.response.body",
                                "body": b"",
                                "more_body": False,
                            })
                    else:
                        await send(message)
        
        await self.app(scope, receive, send_wrapper)


class GzipCompressor:
    """Streaming gzip compressor."""
    
    def __init__(self, level: int = 6):
        self.compressor = gzip.GzipFile(
            mode='wb',
            fileobj=io.BytesIO(),
            compresslevel=level
        )
        self.buffer = self.compressor.fileobj
    
    def compress(self, data: bytes) -> bytes:
        self.compressor.write(data)
        self.buffer.seek(0)
        compressed = self.buffer.read()
        self.buffer.seek(0)
        self.buffer.truncate(0)
        return compressed
    
    def flush(self) -> bytes:
        self.compressor.close()
        self.buffer.seek(0)
        return self.buffer.read()


class BrotliCompressor:
    """Streaming brotli compressor."""
    
    def __init__(self, level: int = 4):
        self.compressor = brotli.Compressor(quality=level)
    
    def compress(self, data: bytes) -> bytes:
        return self.compressor.process(data)
    
    def flush(self) -> bytes:
        return self.compressor.finish()