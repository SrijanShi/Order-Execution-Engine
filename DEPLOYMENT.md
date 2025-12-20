# Deployment Guide

Complete guide to deploying the DEX Order Engine to production using Docker and cloud platforms.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Local Docker Testing](#local-docker-testing)
3. [Railway.app Deployment](#railwayapp-deployment)
4. [Render.com Deployment](#rendercom-deployment)
5. [Environment Configuration](#environment-configuration)
6. [Database Setup](#database-setup)
7. [Monitoring & Logs](#monitoring--logs)
8. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Prerequisites

- Docker & Docker Compose installed
- Node.js 18+ (for local development)
- npm or yarn package manager
- Account on Railway.app or Render.com (for cloud deployment)

### Build Docker Image

```bash
# Navigate to project directory
cd dex-order-engine

# Build the Docker image
docker build -t dex-order-engine:latest .

# Verify the image was built
docker images | grep dex-order-engine
```

### Run Locally with Docker Compose

```bash
# Start all services (API, PostgreSQL, Redis)
docker-compose up -d

# Check service status
docker-compose ps

# View API logs
docker-compose logs -f api

# View database logs
docker-compose logs -f postgres

# Stop all services
docker-compose down
```

---

## Local Docker Testing

### 1. Start Development Stack

```bash
docker-compose up -d
```

This starts:
- **PostgreSQL** on `localhost:5432`
- **Redis** on `localhost:6379`
- **pgAdmin** on `localhost:5050` (database UI)
- **Redis Commander** on `localhost:8081` (cache UI)

### 2. Initialize Database

```bash
# Automatic on startup via docker-entrypoint-initdb.d
# Manual initialization if needed:
docker exec dex-postgres psql -U postgres -d dex_order_engine \
  -f /docker-entrypoint-initdb.d/001_init_schema.sql
```

### 3. Test the API

```bash
# Health check
curl http://localhost:3000/api/health

# Submit an order
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "test-order-1",
    "tokenIn": "SOL",
    "tokenOut": "USDC",
    "amountIn": 1.5,
    "slippage": 0.5,
    "type": "MARKET"
  }'

# Get metrics
curl http://localhost:3000/api/metrics
```

### 4. View Database (pgAdmin)

1. Open `http://localhost:5050`
2. Login: `admin@dex.local` / `admin`
3. Add server:
   - Host: `postgres`
   - Port: `5432`
   - Username: `postgres`
   - Password: `postgres`

### 5. View Cache (Redis Commander)

1. Open `http://localhost:8081`
2. View Redis data in real-time
3. Inspect cache keys and values

### 6. Stop Services

```bash
# Stop without removing volumes
docker-compose stop

# Stop and remove containers (keep data)
docker-compose down

# Stop and remove everything (delete data)
docker-compose down -v
```

---

## Railway.app Deployment

Railway.app provides a free tier with PostgreSQL support, perfect for development and testing.

### Prerequisites

- Railway.app account (sign up at https://railway.app)
- GitHub account with your DEX Engine repo
- CLI installed: `npm i -g @railway/cli`

### Step 1: Connect GitHub Repository

1. Go to https://railway.app/dashboard
2. Click "New Project"
3. Select "Deploy from GitHub"
4. Select your repository
5. Click "Deploy"

### Step 2: Add PostgreSQL Service

```bash
# Login to Railway CLI
railway login

# Add PostgreSQL plugin
railway add

# Select PostgreSQL from the list
# Follow prompts to configure
```

Or via dashboard:
1. Click "Add Service"
2. Select "PostgreSQL"
3. Accept default configuration

### Step 3: Configure Environment Variables

In Railway dashboard:

1. Click on API service
2. Go to "Variables" tab
3. Add the following:

```
NODE_ENV=production
PORT=3000
DATABASE_URL=${{ Postgres.DATABASE_URL }}
REDIS_URL=redis://default:PASSWORD@HOST:PORT
LOG_LEVEL=info
SLIPPAGE_TOLERANCE=0.5
MAX_RETRIES=3
QUEUE_CONCURRENCY=5
CACHE_TTL=3600
WEBSOCKET_ENABLED=true
```

### Step 4: Connect Redis

Railway.app doesn't include Redis in free tier. Options:

**Option A: Use Railway's Redis (paid)**
```bash
railway add # Select Redis
```

**Option B: Use Redis Cloud (free tier)**

1. Sign up at https://redis.com/try-free
2. Create a free Redis database
3. Get connection URL from dashboard
4. Set `REDIS_URL` in Railway variables

**Option C: Use in-memory cache (not recommended for production)**

```
# Comment out Redis in your config
REDIS_ENABLED=false
```

### Step 5: Run Database Migrations

```bash
# Via Railway CLI
railway run npm run migrate

# Or manually connect and run SQL
psql $DATABASE_URL < src/persistence/migration/001_init_schema.sql
```

### Step 6: Deploy

```bash
# Push changes to GitHub
git add .
git commit -m "STEP 14: Docker & Deployment"
git push origin main

# Railway automatically deploys on push
# Monitor deployment at https://railway.app/dashboard
```

### Access Your Application

```
https://[your-project].up.railway.app
```

### Example Railway Configuration

```env
# .env.railway
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://postgres:PASSWORD@host:5432/dex_order_engine
REDIS_URL=redis://:PASSWORD@host:port
LOG_LEVEL=info
SLIPPAGE_TOLERANCE=0.5
```

---

## Render.com Deployment

Render.com offers free tier PostgreSQL hosting, making it excellent for production-grade deployments.

### Prerequisites

- Render.com account (sign up at https://render.com)
- GitHub account with your DEX Engine repo

### Step 1: Create PostgreSQL Database

1. Go to https://dashboard.render.com
2. Click "New"
3. Select "PostgreSQL"
4. Configure:
   - **Name:** `dex-order-engine-db`
   - **Database:** `dex_order_engine`
   - **User:** `postgres`
   - **Region:** Choose closest to you
5. Click "Create Database"
6. Copy the `Internal Database URL`

### Step 2: Create Web Service

1. Click "New"
2. Select "Web Service"
3. Connect GitHub repository
4. Configure:
   - **Name:** `dex-order-engine-api`
   - **Environment:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `node dist/index.js`
   - **Region:** Same as database for best performance

### Step 3: Add Environment Variables

In Render dashboard, go to service → Environment:

```
NODE_ENV=production
PORT=3000
DATABASE_URL=<paste-from-postgresql-service>
REDIS_URL=redis://:PASSWORD@redis-host:port
LOG_LEVEL=info
SLIPPAGE_TOLERANCE=0.5
MAX_RETRIES=3
QUEUE_CONCURRENCY=5
CACHE_TTL=3600
WEBSOCKET_ENABLED=true
```

### Step 4: Set Up Redis (Optional)

**Option A: Use Render's Redis (paid)**
- Similar to PostgreSQL setup

**Option B: Use Redis Cloud free tier**
1. Sign up at https://redis.com/try-free
2. Create database
3. Set `REDIS_URL` in Render environment

**Option C: Skip Redis (use in-memory cache)**
```
REDIS_ENABLED=false
```

### Step 5: Connect Database Service

1. In PostgreSQL service dashboard
2. Copy the "Internal Database URL"
3. Go to Web Service → Environment
4. Paste as `DATABASE_URL`

### Step 6: Run Migrations

Before deploying, run migrations manually:

```bash
# Get internal database URL from Render
# Run locally with psql or through Render's dashboard
psql <INTERNAL_DATABASE_URL> < src/persistence/migration/001_init_schema.sql
```

Or use Render's native database management:
1. Go to PostgreSQL service
2. Click "Connect"
3. Paste SQL from `src/persistence/migration/001_init_schema.sql`

### Step 7: Deploy

1. Render automatically deploys on GitHub push
2. Or manually trigger in dashboard → "Deploy"
3. Monitor build logs in Render console

### Access Your Application

```
https://dex-order-engine-api.onrender.com
```

### Example Render Deployment Configuration

```env
# .env.render
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://postgres:PASSWORD@dpg-XXXXX.onrender.com:5432/dex_order_engine
REDIS_URL=redis://:PASSWORD@redis-host:port
LOG_LEVEL=info
SLIPPAGE_TOLERANCE=0.5
```

---

## Environment Configuration

### Required Variables (All Environments)

```env
NODE_ENV=production|staging|development
PORT=3000
DATABASE_URL=postgresql://user:pass@host:port/db_name
LOG_LEVEL=info|debug|warn|error
SLIPPAGE_TOLERANCE=0.5
```

### Optional Variables

```env
# Redis Configuration
REDIS_URL=redis://:password@host:port
REDIS_ENABLED=true

# Queue Configuration
MAX_RETRIES=3
QUEUE_CONCURRENCY=5
RETRY_INITIAL_DELAY_MS=1000

# Cache Configuration
CACHE_TTL=3600
PRICE_CACHE_TTL=300

# WebSocket Configuration
WEBSOCKET_ENABLED=true
WEBSOCKET_HEARTBEAT_INTERVAL=30000

# DEX Router Configuration
DEX_ROUTER_TIMEOUT_MS=5000
ROUTING_CACHE_ENABLED=true

# Monitoring
METRICS_ENABLED=true
HEALTH_CHECK_INTERVAL_MS=30000
```

### Configuration by Environment

**Development (.env.development)**
```env
NODE_ENV=development
LOG_LEVEL=debug
REDIS_ENABLED=true
CACHE_TTL=300
```

**Staging (.env.staging)**
```env
NODE_ENV=staging
LOG_LEVEL=info
REDIS_ENABLED=true
CACHE_TTL=1800
```

**Production (.env.production)**
```env
NODE_ENV=production
LOG_LEVEL=warn
REDIS_ENABLED=true
CACHE_TTL=3600
MAX_RETRIES=5
QUEUE_CONCURRENCY=10
```

---

## Database Setup

### PostgreSQL Schema

The database is automatically initialized on first run. Manual initialization:

```bash
# Connect to your PostgreSQL instance
psql -U postgres -d dex_order_engine

# Run schema setup (automatic via Docker)
\i src/persistence/migration/001_init_schema.sql
```

### Schema Overview

**orders** table
```sql
CREATE TABLE orders (
  id UUID PRIMARY KEY,
  order_id VARCHAR(255) UNIQUE NOT NULL,
  token_in VARCHAR(100) NOT NULL,
  token_out VARCHAR(100) NOT NULL,
  amount_in DECIMAL(20,8) NOT NULL,
  slippage DECIMAL(5,4) NOT NULL,
  status VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  executed_at TIMESTAMP,
  confirmed_at TIMESTAMP
);
```

**transactions** table
```sql
CREATE TABLE transactions (
  id UUID PRIMARY KEY,
  order_id UUID REFERENCES orders(id),
  transaction_hash VARCHAR(255),
  dex_used VARCHAR(100),
  status VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Backup & Recovery

```bash
# Backup database
pg_dump -U postgres dex_order_engine > backup.sql

# Restore from backup
psql -U postgres dex_order_engine < backup.sql

# Backup via Docker
docker exec dex-postgres pg_dump -U postgres dex_order_engine > backup.sql
```

---

## Monitoring & Logs

### View Application Logs

**Docker Compose**
```bash
# Real-time logs
docker-compose logs -f api

# Last 100 lines
docker-compose logs --tail=100 api

# Specific service
docker-compose logs postgres redis
```

**Railway.app**
- Dashboard → Deployments → Logs tab

**Render.com**
- Dashboard → Service → Logs

### Health Checks

```bash
# API Health
curl https://api.example.com/health

# Expected response:
{
  "status": "OK",
  "version": "1.0.0",
  "timestamp": "2024-12-20T10:30:45.123Z"
}

# Metrics
curl https://api.example.com/metrics
```

### Performance Monitoring

Via metrics endpoint:
```bash
curl https://api.example.com/metrics | jq
```

Returns:
- Success rate
- Average execution time
- p95, p99 latencies
- Error counts by category
- Queue statistics
- WebSocket connections

### Database Monitoring

**pgAdmin** (if running locally)
- Navigate to `http://localhost:5050`
- Query database health
- Monitor connections
- View table sizes

**Render Dashboard**
- Overview tab shows connection counts
- Query editor for manual inspection

---

## Troubleshooting

### Docker Build Fails

**Error: "npm ERR! code ERESOLVE"**

Solution:
```bash
# Use legacy npm version
npm config set legacy-peer-deps true

# Or update Dockerfile to use legacy flag:
RUN npm ci --legacy-peer-deps --only=production
```

### Cannot Connect to Database

**Error: "Error: connect ECONNREFUSED"**

Check:
```bash
# Docker Compose
docker-compose logs postgres
docker exec dex-postgres pg_isready

# Railway/Render: verify DATABASE_URL format
echo $DATABASE_URL
```

### Redis Connection Issues

**Error: "Redis connection failed"**

Solutions:
```bash
# Check Redis is running
docker-compose logs redis
docker exec dex-redis redis-cli ping

# Reset Redis auth if password incorrect
docker exec dex-redis redis-cli CONFIG SET requirepass "new_password"
```

### Application Won't Start

**Check logs first:**
```bash
docker-compose logs api

# Common issues:
# 1. Missing environment variables - add to .env
# 2. Database not ready - wait for healthcheck
# 3. Port already in use - change PORT or kill process
```

### Performance Issues

**High latency on Cloud**

Checklist:
- [ ] Database region matches API region
- [ ] Redis cache enabled and working
- [ ] Queue concurrency appropriate (start with 5)
- [ ] Connection pool sized correctly
- [ ] Enable HTTP compression

### Memory Leaks

**Symptoms: Memory usage grows over time**

```bash
# Monitor memory
docker stats

# Restart service (if temporary)
docker-compose restart api

# Check for open connections
docker exec dex-postgres psql -U postgres -c \
  "SELECT count(*) FROM pg_stat_activity WHERE state = 'active'"
```

### Scaling Issues

**For high traffic:**

1. **Increase Queue Concurrency**
   ```env
   QUEUE_CONCURRENCY=10
   ```

2. **Add Connection Pool**
   ```env
   DATABASE_POOL_MIN=5
   DATABASE_POOL_MAX=20
   ```

3. **Enable Redis Caching**
   ```env
   REDIS_ENABLED=true
   CACHE_TTL=3600
   ```

4. **Use multiple instances** (Railway/Render Professional)

---

## Security Best Practices

### Environment Variables

- Never commit `.env` files
- Use secrets management (Railway/Render provide this)
- Rotate database passwords periodically
- Use strong, unique Redis passwords

### Network Security

- Run behind HTTPS (automatic on Railway/Render)
- Enable CORS for trusted domains only
- Use environment-based URL allowlists
- Validate all input

### Database Security

```sql
-- Create restricted user (not recommended for dev)
CREATE USER dex_app WITH PASSWORD 'strong_password';
GRANT CONNECT ON DATABASE dex_order_engine TO dex_app;
GRANT USAGE ON SCHEMA public TO dex_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dex_app;
```

### Container Security

- Run as non-root user (already configured in Dockerfile)
- Keep base image updated (`node:18-alpine` → latest)
- Scan for vulnerabilities: `docker scan dex-order-engine`
- Remove secrets from images

---

## Cost Estimation

### Railway.app (Free Tier)

- **PostgreSQL:** 100 MB storage, 5 connections - **Free**
- **Web Service:** 50 GB storage, 100 GB bandwidth - **Free**
- **Redis:** Not included - **$5/month**
- **Total:** ~$5/month or free without Redis

### Render.com (Free Tier)

- **PostgreSQL:** 90-day limit, 256 MB RAM - **Free** (auto-pause after 7 days)
- **Web Service:** Auto-pause after 15 min inactivity - **Free**
- **Redis:** ~$7/month (paid tier)
- **Total:** Free (with limitations) or $7+/month

### Self-hosted Docker

- **AWS EC2 micro:** ~$5/month
- **DigitalOcean Droplet:** $4-6/month
- **Linode Nanode:** $5/month
- **Plus:** Database, Redis, backup costs

---

## Production Checklist

Before deploying to production:

- [ ] All tests passing (`npm test`)
- [ ] Environment variables configured
- [ ] Database backups enabled
- [ ] Redis cache configured
- [ ] SSL/HTTPS enabled
- [ ] Health checks working
- [ ] Logging configured
- [ ] Monitoring alerts set up
- [ ] Error tracking enabled
- [ ] Rate limiting configured
- [ ] CORS properly configured
- [ ] Secrets not in code
- [ ] Database indexed for queries
- [ ] Connection pools configured
- [ ] Load balancing ready (if needed)

---

## Rollback Procedure

If deployment fails:

**Railway.app:**
```bash
# View deployment history
railway status

# Rollback to previous deployment
railway rollback <deployment-id>
```

**Render.com:**
1. Go to Dashboard → Service → Deploy History
2. Click on previous successful deployment
3. Click "Redeploy"

**Docker:**
```bash
# Revert to previous image
docker run -d dex-order-engine:previous

# Or use image tag
docker tag dex-order-engine:v1.0.0 dex-order-engine:latest
```

---

## Additional Resources

- [Railway Docs](https://docs.railway.app)
- [Render Docs](https://render.com/docs)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [PostgreSQL Performance](https://www.postgresql.org/docs/current/performance-tips.html)
- [Node.js Production Best Practices](https://nodejs.org/en/docs/guides/nodejs-docker-webapp/)

---

For support, see [README.md](README.md) and [ARCHITECTURE.md](ARCHITECTURE.md).
