FROM python:3.12-slim

WORKDIR /app

# Install system dependencies including curl and build tools for Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
	build-essential \
	curl \
	man-db \
	manpages \
	manpages-posix \
	manpages-dev \
	&& rm -rf /var/lib/apt/lists/* \
	&& mandb

# Install Rust for pydantic-core compilation
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]