# Fly.io Deployment Guide

This guide provides all the steps needed to deploy the DEX Order Engine to Fly.io.

## Prerequisites

### 1. Install Fly CLI

```bash
# On macOS using Homebrew
brew install flyctl

# Verify installation
flyctl version
```

### 2. Create Fly.io Account

- Go to: https://fly.io
- Click "Get Started Free"
- Sign up with email or GitHub
- **NO credit card required initially**

### 3. Authenticate with Fly CLI

```bash
flyctl auth login

# This opens your browser to log in
# Authorize the CLI to access your Fly.io account
```

---

## Deployment Steps

### STEP 1: Launch Fly App

```bash
# Navigate to your project directory
cd /Users/srijanshitashma/Desktop/DEX_Submission/dex-order-engine

# Launch your app on Fly.io
flyctl launch

# You'll be prompted with questions:
# App name: dex-order-engine (press Enter for default)
# Region: sjc (San Jose) - or choose your region
# Set up PostgreSQL: Yes
# PostgreSQL tier: Development (FREE)
# Set up Upstash Redis: Yes
# Deploy now: No (we've already configured everything)
```

**Result:** Fly.io creates:
- ✅ `fly.toml` configuration (already created)
- ✅ PostgreSQL database (FREE tier)
- ✅ Redis database (FREE tier)

---

### STEP 2: Deploy to Fly.io

```bash
# Deploy your app
flyctl deploy

# This will:
# 1. Build your Docker image
# 2. Push to Fly.io registry
# 3. Deploy containers
# 4. Start your application

# Takes 3-5 minutes on first deploy
```

---

### STEP 3: Initialize Database

#### Option A: SSH into App

```bash
# Connect to your running app
flyctl ssh console

# Inside the app, run migrations
npm run migrate

# Exit
exit
```

#### Option B: Connect to PostgreSQL Directly

```bash
# Connect to PostgreSQL
flyctl postgres connect -a dex-order-engine-db

# Run SQL schema
\i src/persistence/migration/001_init_schema.sql

# Verify tables
\dt

# Exit
\q
```

---

### STEP 4: Verify Deployment

```bash
# Get your app URL
flyctl open

# Or view app info
flyctl info

# Your app will be at: https://dex-order-engine.fly.dev
```

---

### STEP 5: Test API Endpoints

```bash
# Health check (should return {"status":"OK"})
curl https://dex-order-engine.fly.dev/api/health

# Get metrics
curl https://dex-order-engine.fly.dev/api/metrics

# Submit an order
curl -X POST https://dex-order-engine.fly.dev/api/orders/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tokenIn": "SOL",
    "tokenOut": "USDC",
    "amount": 1.0,
    "slippage": 0.5
  }'
```

---

## Useful Commands

### View App Status
```bash
flyctl status

# Shows running status, region, IP addresses, image details
```

### Watch Logs
```bash
# Real-time logs
flyctl logs

# Last 50 lines
flyctl logs --lines 50

# Follow logs as they happen
flyctl logs -f
```

### SSH into App
```bash
flyctl ssh console

# Run commands inside the container
npm run migrate
node src/index.ts

# Exit
exit
```

### Manage Secrets/Environment Variables
```bash
# View all secrets
flyctl secrets list

# Set a secret
flyctl secrets set KEY=value

# Remove a secret
flyctl secrets unset KEY
```

### Restart App
```bash
flyctl restart

# Restarts all machines
```

### Redeploy After Code Changes
```bash
# After pushing to GitHub
git push origin main

# Then redeploy
flyctl deploy
```

### Scale App
```bash
# Scale to 2 instances
flyctl scale count 2

# Scale back to 1
flyctl scale count 1
```

---

## GitHub Auto-Deploy Setup (Optional)

### Step 1: Generate Fly API Token

```bash
flyctl tokens create deploy -x 999999h

# Copy the token
```

### Step 2: Add to GitHub Secrets

1. Go to: https://github.com/YOUR_USERNAME/DEX_Submission
2. Settings → Secrets and variables → Actions
3. Click "New repository secret"
   - Name: `FLY_API_TOKEN`
   - Value: Paste your token from Step 1
4. Click "Add secret"

### Step 3: GitHub Actions is Ready

The workflow file `.github/workflows/fly-deploy.yml` is already created.

**Now every push to `main` branch automatically deploys to Fly.io!** 🚀

```bash
# Just push to trigger deployment
git push origin main

# Check GitHub Actions tab to see deployment progress
```

---

## Troubleshooting

### Issue: `flyctl launch` fails

```bash
# Make sure you're logged in
flyctl auth login

# Or use explicit token
flyctl auth login --interactive
```

### Issue: Deployment fails with Docker error

```bash
# Force rebuild
flyctl deploy --force

# Check build logs
flyctl logs
```

### Issue: App crashes after deploy

```bash
# Check logs for errors
flyctl logs

# SSH in to debug
flyctl ssh console

# Check environment variables are set
env | grep DATABASE_URL
env | grep REDIS_URL
```

### Issue: Database connection failing

```bash
# Verify DATABASE_URL is set
flyctl secrets list

# Test PostgreSQL connection
flyctl postgres connect -a dex-order-engine-db

# Check if database exists
\l

# Exit
\q
```

### Issue: Redis not working

```bash
# Check Redis info
flyctl redis info -a dex-order-engine-redis

# Verify REDIS_URL in secrets
flyctl secrets list | grep REDIS_URL
```

### Issue: Health check failing

```bash
# SSH into app
flyctl ssh console

# Test health endpoint manually
curl localhost:3000/api/health

# Check logs
npm run dev  # See errors

# Exit
exit
```

---

## Deployment Configuration Summary

| Component | Value | Status |
|-----------|-------|--------|
| **App Name** | dex-order-engine | ✅ |
| **Region** | us-west (sjc) | ✅ |
| **Database** | PostgreSQL 15 | ✅ Free |
| **Cache** | Redis (Upstash) | ✅ Free |
| **Port** | 3000 | ✅ |
| **HTTPS** | Auto enabled | ✅ |
| **Health Check** | /api/health | ✅ |
| **Auto-restart** | Enabled | ✅ |
| **Auto-deploy** | GitHub Actions | ✅ |

---

## Cost Breakdown

| Service | Free Tier | Your Usage | Cost |
|---------|-----------|-----------|------|
| Compute (shared-cpu) | 3 instances | 1 instance | **FREE** |
| PostgreSQL | Always free | 10GB storage | **FREE** |
| Redis | 10K commands/day | ~100/day | **FREE** |
| Network egress | 100GB/month | ~1GB/month | **FREE** |
| **TOTAL** | | | **$0/month** |

---

## Next Steps

1. ✅ Fly.toml created
2. ✅ GitHub Actions workflow created
3. ⏳ Run: `flyctl auth login`
4. ⏳ Run: `flyctl launch`
5. ⏳ Run: `flyctl deploy`
6. ⏳ Initialize database
7. ⏳ Test endpoints
8. ⏳ Update README with production URL
9. ⏳ Create YouTube demo video
10. ⏳ Add order type documentation

---

## Your Production URL

Once deployed, your app will be available at:

```
https://dex-order-engine.fly.dev
```

All endpoints:
- Health: `https://dex-order-engine.fly.dev/api/health`
- Metrics: `https://dex-order-engine.fly.dev/api/metrics`
- Submit Order: `https://dex-order-engine.fly.dev/api/orders/execute`
- WebSocket: `wss://dex-order-engine.fly.dev/ws`

---

## Support

For more information:
- Fly.io Docs: https://fly.io/docs/
- Fly.io Dashboard: https://fly.io/dashboard
- CLI Reference: `flyctl help`
