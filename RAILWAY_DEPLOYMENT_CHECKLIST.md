# 🚀 Railway.app Deployment Checklist

Complete this checklist to deploy your DEX Order Engine to production.

## ✅ Pre-Deployment Checklist

- [ ] All tests passing: `npm test`
- [ ] Code committed to GitHub: `git push origin main`
- [ ] `.env` file NOT committed (in `.gitignore`)
- [ ] `vercel.json` created (for reference, won't be used)

```bash
# Verify locally
npm test -- --no-coverage
npm run build
npm start  # Press Ctrl+C after startup
```

---

## 🚀 Railway.app Deployment (5 MINUTES)

### Step 1: Create Railway Account
- [ ] Go to https://railway.app
- [ ] Click "Start Free"
- [ ] Sign up with GitHub

**Time:** 2 minutes

### Step 2: Deploy from GitHub
- [ ] Click "New Project" 
- [ ] Select "Deploy from GitHub repo"
- [ ] Select `DEX_Submission` / `dex-order-engine`
- [ ] Click "Deploy"

**Time:** 1 minute | **Status:** Railway auto-detects Node.js and builds

### Step 3: Add PostgreSQL Database
- [ ] Click "Add Service" (+ icon)
- [ ] Select "PostgreSQL"
- [ ] Use free tier defaults
- [ ] Click "Create"

**Time:** 1 minute | **Result:** `DATABASE_URL` auto-set in environment

### Step 4: Configure Environment Variables
- [ ] Click on **API service** (web service)
- [ ] Go to **Variables** tab
- [ ] Paste these variables:

```
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
SLIPPAGE_TOLERANCE=0.5
MAX_RETRIES=3
QUEUE_CONCURRENCY=10
CACHE_TTL=3600
WEBSOCKET_ENABLED=true
```

- [ ] Click "Save"

**Time:** 1 minute

### Step 5: Setup Redis (Optional)
**Option A: Use Redis Cloud (FREE)**
- [ ] Go to https://redis.com/try-free
- [ ] Create account and free database
- [ ] Copy **Redis URL**
- [ ] In Railway Variables, add: `REDIS_URL=your-redis-url`

**Option B: Skip Redis for now**
- [ ] Add: `REDIS_ENABLED=false`

**Time:** 5 minutes (Option A) or skip

### Step 6: Deploy
- [ ] Go back to GitHub
- [ ] Add these files to git:

```bash
git add vercel.json DEPLOYMENT_STRATEGY.md
git commit -m "Add deployment guides"
git push origin main
```

- [ ] Railway auto-detects push and redeploys
- [ ] Check logs: Dashboard → API service → "Logs"

**Time:** 2 minutes

### Step 7: Get Your Public URL
- [ ] In Railway Dashboard
- [ ] Click **Deployments** tab
- [ ] Find the public URL (e.g., `https://dex-order-engine-prod.up.railway.app`)
- [ ] Test it:

```bash
curl https://[your-url]/api/health
# Should return: {"status":"OK"}
```

**Time:** 1 minute

### Step 8: Run Database Migrations
- [ ] In Railway Dashboard
- [ ] Click API service → **Shell** tab
- [ ] Run:

```bash
npm run migrate
# Or manually:
psql $DATABASE_URL < src/persistence/migration/001_init_schema.sql
```

**Time:** 1 minute

---

## ✅ Post-Deployment Checklist

- [ ] API health check passes: `curl [your-url]/api/health`
- [ ] Metrics endpoint works: `curl [your-url]/api/metrics`
- [ ] WebSocket connects: Check logs for "WebSocket server active"
- [ ] Database connected: Logs show "Database connected"
- [ ] Orders can be submitted: Test with Postman

### Test Order Submission
```bash
curl -X POST https://[your-url]/api/orders/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tokenIn": "SOL",
    "tokenOut": "USDC",
    "amount": 1.0,
    "slippage": 0.5
  }'

# Should return: {"orderId": "...", "status": "pending"}
```

---

## 🔗 Update README with Deployment URL

Once deployed, update your README:

```markdown
## 🚀 Live Demo

**Production URL:** https://[your-url]/api

### Try It Now

# Health check
curl https://[your-url]/api/health

# Submit order
curl -X POST https://[your-url]/api/orders/execute \
  -H "Content-Type: application/json" \
  -d '{"tokenIn":"SOL","tokenOut":"USDC","amount":1.0,"slippage":0.5}'
```

---

## 📊 Railway Dashboard Features

Once deployed, you can use Railway Dashboard to:

- **View Logs** - Real-time application logs
- **Monitoring** - CPU, memory, network usage
- **Environment Variables** - Update configs without redeploying
- **Deployments** - View deployment history
- **Shell** - Run commands (e.g., migrations, database operations)
- **Metrics** - Performance analytics

---

## 🆘 Troubleshooting

### Issue: Build Failed
```
Check Logs tab → Look for error message
Common issues:
- Missing environment variables
- Node.js version mismatch
- npm install failures
```

### Issue: Application Crashes
```
Check Logs → Search for "Error" or "crashed"
Common issues:
- DATABASE_URL missing
- Port 3000 already in use
- Database migration failed
```

### Issue: WebSocket Not Working
```
This means Vercel was used instead of Railway
Solution: Deploy to Railway.app instead
Vercel doesn't support persistent WebSocket connections
```

### Issue: Orders Timing Out
```
This means API timeout is too short
Solution: Check DEPLOYMENT.md for timeout configuration
```

---

## ⏱️ Total Deployment Time

| Step | Time |
|------|------|
| Railway account + GitHub connect | 3 min |
| Add PostgreSQL | 1 min |
| Environment variables | 1 min |
| Deploy | 2 min |
| Test | 1 min |
| Database migrations | 1 min |
| **TOTAL** | **~9 minutes** |

---

## ✨ Next Steps After Deployment

1. **Create YouTube Demo** (40 min)
   - Record: 5 concurrent orders → WebSocket updates → confirmed status
   - Upload to YouTube
   - Add link to README

2. **Add Order Type Documentation** (5 min)
   - Explain why Market orders chosen
   - Document how to extend to Limit/Sniper

3. **Test in Production** (5 min)
   - Use Postman collection against production URL
   - Verify WebSocket connections
   - Check metrics endpoint

---

**🎉 You're deployed! Your order engine is now live on Railway.app**

Questions? See [DEPLOYMENT.md](DEPLOYMENT.md) or [DEPLOYMENT_STRATEGY.md](DEPLOYMENT_STRATEGY.md)
