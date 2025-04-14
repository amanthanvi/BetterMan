FROM node:23-alpine

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install dependencies 
RUN npm install

# Copy the rest of the code
COPY . .

# Start the development server
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]