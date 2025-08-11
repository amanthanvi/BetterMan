# Backend Dockerfile for production

FROM python:3.12.8-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    man-db \
    groff \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Make start script executable
RUN chmod +x start.sh

# Create non-root user but don't switch yet
RUN useradd -m -u 1001 appuser && chown -R appuser:appuser /app

# Keep running as root for now (Railway will handle security)
# USER appuser

# Set default port
ENV PORT=8000

# Expose port
EXPOSE 8000

# Start the application
CMD ["./start.sh"]