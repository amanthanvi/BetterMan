# Simple Frontend Dockerfile for Railway

FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy all files
COPY . .

# Build the application
RUN npm run build

# Expose port
EXPOSE 3000

# Use Railway's PORT if available
ENV PORT=3000
ENV NODE_ENV=production

# Start the application
CMD ["npm", "start"]