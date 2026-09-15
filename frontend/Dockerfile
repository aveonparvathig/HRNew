# Multi-stage build for React frontend
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# API base URL baked into the bundle at build time.
# Production uses "/api" (same-origin via the reverse proxy).
ARG VITE_API_URL=http://localhost:3000/api
ENV VITE_API_URL=$VITE_API_URL

# Build the application
RUN npm run build

# Production stage - serve with lightweight HTTP server
FROM node:20-alpine

WORKDIR /app

# Install dumb-init to handle signals properly
RUN apk add --no-cache dumb-init

# Copy package files (needed for npm run dev in development)
COPY package*.json ./

# Install dependencies (production + dev for flexibility)
RUN npm install

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Copy source code (needed for dev server)
COPY src ./src
COPY public ./public
COPY tsconfig.json vite.config.ts ./

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:3000/ || exit 1

# Use dumb-init to run the app
ENTRYPOINT ["dumb-init", "--"]
# Default: serve the dist folder (production)
# Override with 'npm run dev' in development
CMD ["npx", "serve", "-s", "dist", "-l", "3000"]
