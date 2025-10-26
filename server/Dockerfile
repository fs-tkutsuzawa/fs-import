# Use Amazon Linux 2023 as base image
FROM amazonlinux:2023

# Set working directory
WORKDIR /app

# Install system dependencies
RUN dnf update -y && \
    dnf install -y \
    nodejs \
    npm \
    && dnf clean all

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy server files
COPY . .

# Expose port
EXPOSE 3001

# Start the server
CMD ["npm", "start"]