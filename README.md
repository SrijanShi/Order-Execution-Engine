# DEX Order Engine

A high-performance, production-ready order execution engine for Solana DEX (Decentralized Exchange) trading. Built with TypeScript, featuring real-time WebSocket updates, multi-DEX routing, and comprehensive monitoring.

## 🎯 Why DEX Order Engine?

The DEX Order Engine simplifies executing orders across multiple DEX protocols on Solana by:

- **Multi-DEX Routing**: Automatically finds the best prices across Raydium and Meteora
- **Smart Order Routing**: Compares prices and selects optimal execution path
- **Real-Time Updates**: WebSocket-based status tracking and notifications
- **Resilient Execution**: Automatic retry logic with exponential backoff
- **Production Ready**: Docker, monitoring, comprehensive logging

## 📋 Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [API Documentation](#api-documentation)
- [Testing](#testing)
- [Deployment](#deployment)
- [Monitoring](#monitoring)

## ✨ Features

### Core Functionality
- ✅ **Multi-DEX Support**: Raydium, Meteora
- ✅ **Order Management**: Submit, track, cancel orders
- ✅ **Real-Time Updates**: WebSocket for live order status
- ✅ **Smart Routing**: Best price selection across DEXs
- ✅ **Retry Logic**: Exponential backoff for failed operations

### Infrastructure
- ✅ **Production Docker**: Multi-stage builds, Alpine Linux
- ✅ **PostgreSQL**: Persistent order storage with transactions
- ✅ **Redis Caching**: Fast price lookups and pub/sub
- ✅ **Async Processing**: Queue-based order processing
- ✅ **Health Checks**: Built-in monitoring endpoints

### Operations
- ✅ **Structured Logging**: JSON format, CloudWatch-ready
- ✅ **Metrics Collection**: Performance tracking and aggregation
- ✅ **Configuration Management**: Environment-based settings
- ✅ **Error Classification**: Retryable vs permanent errors
- ✅ **Comprehensive Tests**: 348+ integration tests

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    REST API (Fastify)                    │
│  POST /orders - Submit orders                           │
│  GET /orders/:id - Get order status                     │
│  WebSocket /ws - Real-time updates                      │
└────────────┬────────────────────────────────┬───────────┘
             │                                │
     ┌───────▼──────────┐        ┌───────────▼─────┐
     │  Order Queue     │        │  Execution      │
     │  (Concurrency)   │        │  Engine         │
     └────────┬─────────┘        └────────┬────────┘
              │                           │
              └──────────────┬────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
     ┌────▼─────┐    ┌──────▼──────┐   ┌──────▼──────┐
     │ Routing  │    │ Validation  │   │ Transaction │
     │  Engine  │    │   Engine    │   │  Builder    │
     └────┬─────┘    └─────────────┘   └──────┬──────┘
          │                                    │
     ┌────▼─────────────────┐       ┌─────────▼──────┐
     │  DEX Routers        │       │  Blockchain    │
     │  - Raydium          │       │  Submission    │
     │  - Meteora          │       └────────────────┘
     └─────────────────────┘
          │
     ┌────▼──────┐
     │  Pricing  │
     │  Engine   │
     └───────────┘
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- PostgreSQL 15
- Redis 7

### 1. Clone Repository
```bash
git clone https://github.com/SrijanShi/Order-Execution-Engine.git
cd dex-order-engine
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Start Services
```bash
docker-compose up -d
```

### 4. Configure Environment
```bash
cp .env.example .env
```

### 5. Run Application
```bash
# Development
npm run dev

# Production
npm run build && npm start
```

### 6. Test
```bash
npm test
```

## 📦 Installation

```bash
npm install
```

## ⚙️ Configuration

See [CONFIG.md](CONFIG.md) for detailed configuration.

## 💻 Usage

### Submit Order

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "order-123",
    "tokenIn": "So11111111111111111111111111111111111111112",
    "tokenOut": "EPjFWaLb3hyccqaB3JgRekyvbYYGy4z3816t1Gx6oph",
    "amountIn": 1.5,
    "slippage": 0.5
  }'
```

## 📚 API Documentation

See [API.md](API.md) for complete API reference.

## 🧪 Testing

```bash
npm test
```

See [TESTING.md](TESTING.md) for more information.

## 🐳 Deployment

### Docker

```bash
docker build -t dex-order-engine:latest .
docker run -d -p 3000:3000 dex-order-engine:latest
```

### Docker Compose

```bash
docker-compose up -d
```

## 📊 Monitoring

Health check: `curl http://localhost:3000/health`

See logs in `/logs` directory.

## 📖 Documentation

- [Architecture](ARCHITECTURE.md) - System design
- [API Reference](API.md) - API endpoints
- [Configuration](CONFIG.md) - Environment setup
- [Testing Guide](TESTING.md) - Test execution
- [Postman Collection](Postman_Collection.json) - API testing

---

**Status:** Production Ready ✅ | **Tests:** 348 Passing
