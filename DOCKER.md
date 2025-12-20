# Docker Guide

Complete guide to building, running, and deploying DEX Order Engine with Docker.

## Quick Start

```bash
# Build image
docker build -t dex-order-engine:latest .

# Run with docker-compose
docker-compose up -d

# Verify services are running
docker-compose ps

# Check API health
curl http://localhost:3000/health

# View logs
docker-compose logs -f api

# Stop services
docker-compose down
```

## Dockerfile Explained

The Dockerfile uses a **multi-stage build** pattern for optimal production images.

### Stage 1: Builder

```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install dependencies (production only)
RUN npm ci --only=production && \
    npm cache clean --force

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build
```

**Purpose:**
- Compile TypeScript to JavaScript
- Install production dependencies
- Prepare application for runtime

**Benefits:**
- Separates build tools from runtime
- Reduces final image size
- Caches dependencies layer

### Stage 2: Runtime

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Copy configuration
COPY .env .env.example ./
COPY src/persistence/migration ./migration

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Set ownership to non-root user
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "dist/index.js"]
```

**Security Features:**
- ✅ Non-root user (`nodejs`)
- ✅ Minimal base image (`node:18-alpine`)
- ✅ No build tools in runtime image
- ✅ Health checks configured
- ✅ Proper signal handling (dumb-init)

**Optimization:**
- ✅ Multi-stage build
- ✅ Layer caching
- ✅ No unnecessary files
- ✅ Alpine Linux (small base)

### Image Size

```
Builder image:    ~400MB (discarded)
Runtime image:    ~150MB (deployed)
Size reduction:   62% smaller
```

## Building Images

### Build from Local

```bash
# Basic build
docker build -t dex-order-engine:latest .

# Build with tag
docker build -t dex-order-engine:v1.0.0 .

# Build with multiple tags
docker build -t dex-order-engine:latest -t dex-order-engine:v1.0.0 .

# Build without cache
docker build --no-cache -t dex-order-engine:latest .

# View build layers
docker history dex-order-engine:latest
```

### Optimize Build

```bash
# Use BuildKit for faster builds
DOCKER_BUILDKIT=1 docker build -t dex-order-engine:latest .

# Build specific platform
docker buildx build --platform linux/amd64,linux/arm64 -t dex-order-engine:latest .
```

## Running Containers

### Simple Run

```bash
docker run -d \
  --name dex-engine \
  -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/db" \
  -e REDIS_URL="redis://:password@host:6379" \
  dex-order-engine:latest
```

### With Network

```bash
# Create network
docker network create dex-network

# Run with network
docker run -d \
  --name dex-engine \
  --network dex-network \
  -p 3000:3000 \
  dex-order-engine:latest
```

### With Volume Mounting

```bash
# Mount local directory
docker run -d \
  --name dex-engine \
  -p 3000:3000 \
  -v $(pwd)/logs:/app/logs \
  dex-order-engine:latest

# Mount config file
docker run -d \
  --name dex-engine \
  -p 3000:3000 \
  -v $(pwd)/.env:/app/.env:ro \
  dex-order-engine:latest
```

### Environment Variables

```bash
# Inline
docker run -d \
  -e NODE_ENV=production \
  -e LOG_LEVEL=info \
  dex-order-engine:latest

# From file
docker run -d \
  --env-file .env.production \
  dex-order-engine:latest

# Override
docker run -d \
  --env-file .env.production \
  -e LOG_LEVEL=debug \
  dex-order-engine:latest
```

### Resource Limits

```bash
# Set limits
docker run -d \
  --memory=1g \
  --cpus=1.5 \
  --memory-swap=2g \
  dex-order-engine:latest

# Monitor
docker stats dex-engine
```

## Docker Compose

### Service Architecture

```yaml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/dex_order_engine
      REDIS_URL: redis://:redis_password@redis:6379

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: dex_order_engine
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass redis_password
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
```

### Common Commands

```bash
# Start all services
docker-compose up

# Start in background
docker-compose up -d

# Build and start
docker-compose up --build

# View logs
docker-compose logs

# Real-time logs
docker-compose logs -f api

# Specific service logs
docker-compose logs postgres

# Service status
docker-compose ps

# Execute command in service
docker-compose exec api npm test

# Stop services
docker-compose stop

# Stop and remove
docker-compose down

# Remove with volumes
docker-compose down -v

# Restart service
docker-compose restart api

# Scale service
docker-compose up -d --scale api=3
```

## Image Management

### List Images

```bash
# All images
docker images

# Specific image
docker images dex-order-engine

# With size
docker images --format "table {{.Repository}}\t{{.Size}}"
```

### Remove Images

```bash
# Remove image
docker rmi dex-order-engine:latest

# Remove multiple
docker rmi dex-order-engine:v1.0.0 dex-order-engine:v1.0.1

# Remove dangling images
docker image prune

# Remove all unused
docker image prune -a
```

### Tag Images

```bash
# Tag for registry
docker tag dex-order-engine:latest myregistry/dex-order-engine:latest

# Tag version
docker tag dex-order-engine:latest dex-order-engine:v1.0.0
```

### Push to Registry

```bash
# Login to registry
docker login

# Push image
docker push myregistry/dex-order-engine:latest

# Push to Docker Hub
docker push myusername/dex-order-engine:latest
```

## Container Management

### Inspect Containers

```bash
# Container info
docker inspect dex-engine

# Container processes
docker top dex-engine

# Container logs
docker logs dex-engine

# Real-time logs
docker logs -f dex-engine

# Last 100 lines
docker logs --tail=100 dex-engine

# With timestamps
docker logs -t dex-engine
```

### Container Control

```bash
# Start container
docker start dex-engine

# Stop container
docker stop dex-engine

# Pause container
docker pause dex-engine

# Unpause container
docker unpause dex-engine

# Restart container
docker restart dex-engine

# Remove container
docker rm dex-engine

# Remove running container
docker rm -f dex-engine
```

### Execute in Container

```bash
# Interactive shell
docker exec -it dex-engine bash

# Run command
docker exec dex-engine npm test

# Run as user
docker exec -u nodejs dex-engine whoami

# Run with environment
docker exec -e DEBUG=* dex-engine node debug.js
```

## Networking

### Network Modes

```bash
# Bridge network (default)
docker run --network bridge dex-order-engine

# Host network
docker run --network host dex-order-engine

# Custom network
docker network create dex-network
docker run --network dex-network dex-order-engine

# No network
docker run --network none dex-order-engine
```

### Port Mapping

```bash
# Map port
docker run -p 3000:3000 dex-order-engine

# Map to specific interface
docker run -p 127.0.0.1:3000:3000 dex-order-engine

# Map multiple ports
docker run -p 3000:3000 -p 9090:9090 dex-order-engine

# Random port
docker run -p 3000 dex-order-engine
```

### DNS and Hosts

```bash
# Set DNS
docker run --dns 8.8.8.8 dex-order-engine

# Add host entry
docker run --add-host db.example.com:192.168.1.100 dex-order-engine

# Hostname
docker run --hostname dex-api dex-order-engine
```

## Security

### User Permissions

```bash
# Run as root (not recommended)
docker run --user 0 dex-order-engine

# Run as specific user
docker run --user 1001 dex-order-engine

# Run as user:group
docker run --user nodejs:nodejs dex-order-engine
```

### Capability Controls

```bash
# Drop all capabilities
docker run --cap-drop=ALL dex-order-engine

# Add specific capability
docker run --cap-add=NET_BIND_SERVICE dex-order-engine

# Privileged (not recommended)
docker run --privileged dex-order-engine
```

### Read-Only Filesystem

```bash
# Mount root as read-only
docker run --read-only dex-order-engine

# Allow temp directory
docker run --read-only --tmpfs /tmp dex-order-engine
```

### Resource Isolation

```bash
# CPU limit
docker run --cpus=2 dex-order-engine

# Memory limit
docker run --memory=1g dex-order-engine

# Memory swap limit
docker run --memory=1g --memory-swap=2g dex-order-engine

# CPU shares
docker run --cpu-shares=1024 dex-order-engine
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker logs dex-engine

# Check exit code
docker inspect dex-engine --format='{{.State.ExitCode}}'

# Inspect configuration
docker inspect dex-engine
```

### High Memory Usage

```bash
# Monitor memory
docker stats dex-engine

# Check memory limit
docker inspect dex-engine --format='{{.HostConfig.Memory}}'

# Set memory limit
docker update --memory=1g dex-engine
```

### Slow Performance

```bash
# Check disk I/O
docker stats

# Check network
docker exec dex-engine ping 8.8.8.8

# Monitor resources
docker top dex-engine
```

### Network Issues

```bash
# Check network
docker network inspect dex-network

# Test connectivity
docker exec dex-engine curl http://api:3000

# Check DNS
docker exec dex-engine nslookup postgres
```

## Production Best Practices

### Image Size

- ✅ Use Alpine Linux base image
- ✅ Multi-stage builds
- ✅ Remove build tools
- ✅ Minimize layers
- ✅ Clean package caches

### Security

- ✅ Run as non-root user
- ✅ Use read-only filesystem
- ✅ Drop unnecessary capabilities
- ✅ Scan images for vulnerabilities
- ✅ Keep base image updated

### Performance

- ✅ Set resource limits
- ✅ Enable health checks
- ✅ Use proper signal handling
- ✅ Configure logging
- ✅ Monitor container metrics

### Reliability

- ✅ Configure restart policy
- ✅ Set proper health checks
- ✅ Handle graceful shutdown
- ✅ Monitor logs
- ✅ Use volume backups

### Networking

- ✅ Use custom networks
- ✅ Don't expose unnecessary ports
- ✅ Use environment for secrets
- ✅ Implement connection limits
- ✅ Monitor network I/O

## Examples

### Development Setup

```bash
# Start full stack
docker-compose up

# View logs
docker-compose logs -f

# Run tests
docker-compose exec api npm test

# Database access
docker-compose exec postgres psql -U postgres

# Redis access
docker-compose exec redis redis-cli
```

### Production Deployment

```bash
# Build optimized image
DOCKER_BUILDKIT=1 docker build -t registry.example.com/dex-order-engine:v1.0.0 .

# Push to registry
docker push registry.example.com/dex-order-engine:v1.0.0

# Run with limits
docker run -d \
  --name dex-engine-prod \
  --memory=1g \
  --cpus=2 \
  --restart=always \
  --health-cmd='curl -f http://localhost:3000/health' \
  --health-interval=30s \
  --health-timeout=10s \
  --health-retries=3 \
  -e NODE_ENV=production \
  -p 3000:3000 \
  registry.example.com/dex-order-engine:v1.0.0
```

### CI/CD Integration

```bash
# Build on every commit
docker build -t dex-order-engine:${GIT_COMMIT_SHA} .

# Test
docker run dex-order-engine:${GIT_COMMIT_SHA} npm test

# Push on success
docker push dex-order-engine:${GIT_COMMIT_SHA}

# Tag as latest
docker tag dex-order-engine:${GIT_COMMIT_SHA} dex-order-engine:latest
docker push dex-order-engine:latest
```

## Resources

- [Docker Documentation](https://docs.docker.com)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Node.js Docker Best Practices](https://nodejs.org/en/docs/guides/nodejs-docker-webapp/)
- [Alpine Linux Packages](https://pkgs.alpinelinux.org/packages)

---

For deployment to cloud platforms, see [DEPLOYMENT.md](DEPLOYMENT.md).
