# Configuration & Environment Setup

## Overview

This directory contains environment-based configuration for the DEX Order Engine. The system supports multiple deployment environments with distinct settings for development, staging, and production.

## Files

### `src/config/index.ts`
Centralized configuration loader that:
- Loads environment variables from `.env` files
- Validates required variables
- Provides type-safe configuration object
- Logs safe configuration on startup

### `.env.example`
Template file documenting all available configuration options with descriptions.

### `.env.development`
Development environment configuration with relaxed limits and verbose logging.

### `.env.staging`
Staging environment configuration with moderate limits and JSON logging.

### `.env.production`
Production environment configuration with high limits and minimal logging.

### `docker-compose.yml`
Local development stack including:
- PostgreSQL 15 (port 5432)
- Redis 7 (port 6379)
- pgAdmin 4 (port 5050)
- Redis Commander (port 8081)

### `Dockerfile`
Production-ready Docker image with:
- Multi-stage build for optimization
- Alpine Linux for small footprint
- Non-root user for security
- Health checks
- Proper signal handling

### `.dockerignore`
Files to exclude from Docker builds.

## Configuration Variables

### Environment
- `NODE_ENV`: development | staging | production

### Server
- `HOST`: Server hostname (default: localhost)
- `PORT`: Server port (default: 3000)

### Database
- `DATABASE_URL`: PostgreSQL connection string
- `DB_POOL_SIZE`: Connection pool size (default: 10)
- `DB_MAX_CONNECTIONS`: Maximum connections (default: 20)
- `DB_IDLE_TIMEOUT_MS`: Idle timeout in ms (default: 30000)
- `DB_CONNECTION_TIMEOUT_MS`: Connection timeout in ms (default: 2000)

### Redis
- `REDIS_URL`: Redis connection string
- `REDIS_MAX_RETRIES`: Retry attempts (default: 3)
- `REDIS_RETRY_DELAY_MS`: Retry delay in ms (default: 1000)
- `REDIS_TIMEOUT_MS`: Connection timeout in ms (default: 5000)

### Execution
- `MAX_CONCURRENT_ORDERS`: Concurrent order limit (default: 100)
- `ORDER_TIMEOUT_MS`: Order execution timeout in ms (default: 30000)
- `MAX_RETRIES`: Retry attempts (default: 3)
- `ROUTING_TIMEOUT_MS`: DEX routing timeout in ms (default: 2000)
- `BUILDING_TIMEOUT_MS`: Transaction building timeout in ms (default: 3000)

### Queue
- `MAX_QUEUE_SIZE`: Maximum queue size (default: 10000)
- `QUEUE_CONCURRENCY`: Processing concurrency (default: 10)
- `JOB_TIMEOUT_MS`: Job execution timeout in ms (default: 30000)

### WebSocket
- `WS_HEARTBEAT_INTERVAL_MS`: Heartbeat interval in ms (default: 30000)
- `WS_MAX_CONNECTIONS`: Maximum connections (default: 1000)

### Logging
- `LOG_LEVEL`: debug | info | warn | error (default: info)
- `LOG_FORMAT`: json | text (default: text)

### Features
- `ENABLE_RATE_LIMITING`: Enable rate limiting (default: false)
- `ENABLE_METRICS`: Enable metrics collection (default: false)
- `ENABLE_HEALTH_CHECK`: Enable health check (default: true)

## Usage

### Development

1. **Start local services:**
```bash
docker-compose up -d
```

2. **Load configuration:**
```bash
# Uses .env.development by default
npm run dev
```

3. **Access services:**
- PostgreSQL: localhost:5432
- Redis: localhost:6379
- pgAdmin: http://localhost:5050
- Redis Commander: http://localhost:8081

### Production

1. **Build Docker image:**
```bash
docker build -t dex-order-engine:latest .
```

2. **Run with environment variables:**
```bash
docker run -d \
  -e NODE_ENV=production \
  -e DATABASE_URL=postgresql://user:pass@db:5432/dex \
  -e REDIS_URL=redis://cache:6379/0 \
  -p 3000:3000 \
  dex-order-engine:latest
```

3. **Health check:**
```bash
curl http://localhost:3000/health
```

## Environment Recommendations

### Development
- Relaxed concurrency limits for testing
- Debug logging for troubleshooting
- Short timeouts for rapid iteration

### Staging
- Balanced settings mirroring production
- JSON logging for monitoring
- Moderate concurrency for testing at scale

### Production
- High concurrency limits for throughput
- Minimal info-level logging
- Extended timeouts for reliability
- All features enabled

## Configuration Loading Order

1. `.env` file (if exists)
2. Environment-specific file (`.env.{NODE_ENV}`)
3. Environment variables
4. Built-in defaults
5. Validation of required variables

## Validation

The configuration system validates:
- Required environment variables
- Port number (1-65535)
- Numeric parameters (pool size, timeouts, etc.)
- Valid enumeration values
- Timeout ranges

Invalid configuration prevents application startup with clear error messages.

## Security Notes

- Never commit `.env` files with secrets
- Sensitive values are redacted in logs
- Production passwords should use secrets management
- Database URLs and Redis credentials in environment variables
- Non-root user in Docker containers
- Health checks without authentication for monitoring

## Troubleshooting

### Missing environment variables
```
Error: Missing required environment variables: DATABASE_URL, REDIS_URL
```
Solution: Create `.env` file with required variables

### Invalid port number
```
Error: Invalid PORT: abc
```
Solution: PORT must be a number between 1-65535

### Connection timeouts
Check that PostgreSQL and Redis services are running:
```bash
docker-compose ps
```

Verify connection strings in `.env` file match service hostnames.
