FROM node:23-alpine

WORKDIR /app

# Copy package files and scripts first for better layer caching
COPY package*.json ./
COPY scripts ./scripts

# Install dependencies with legacy peer deps to handle React 19 conflicts
RUN npm install --legacy-peer-deps

# Copy the rest of the code
COPY . .

# Start the development server
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
