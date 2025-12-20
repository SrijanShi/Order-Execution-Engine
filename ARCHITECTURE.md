# Architecture

Detailed system architecture, design decisions, and data flow for the DEX Order Engine.

## System Overview

The DEX Order Engine is a distributed system for executing orders across multiple Solana DEX protocols. It combines:

- **REST API** for order submission and status queries
- **WebSocket Server** for real-time status updates
- **Async Queue** for scalable order processing
- **Execution Engine** for order lifecycle management
- **DEX Router** for intelligent price comparison
- **Persistence Layer** for order storage and history
- **Caching Layer** for performance optimization

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                             │
│          ┌──────────────────┬──────────────────┐                │
│          │  REST API Client │  WebSocket Client │                │
│          └──────────────────┴──────────────────┘                │
└────────────────────────────┬────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
┌───────▼──────────┐  ┌──────▼──────┐  ┌────────▼─────────┐
│  REST API        │  │  WebSocket  │  │  Health Check    │
│  (Fastify)       │  │  Manager    │  │  Endpoints       │
│ - /api/orders    │  │ - /ws       │  │ - /health        │
│ - /metrics       │  │ - /ready    │  │ - /metrics       │
└───────┬──────────┘  └──────┬──────┘  └────────┬─────────┘
        │                    │                   │
        │    ┌───────────────┼───────────────┐   │
        │    │               │               │   │
        └────┼──────────┬────┴──┬────────┬───┴───┘
             │          │       │        │
        ┌────▼──────────▼───────▼────────▼─────┐
        │     Order Queue (Concurrency)        │
        │  - Job Processor                     │
        │  - Retry Handler                     │
        │  - State Tracking                    │
        └────┬─────────────────────────────────┘
             │
        ┌────▼──────────────────────────────────┐
        │    Execution Engine                  │
        │  - State Machine                     │
        │  - Error Handler                     │
        │  - Metrics Collection                │
        │  - Event Emitter                     │
        └────┬──────────────────────────────────┘
             │
    ┌────────┼────────┬────────────┐
    │        │        │            │
┌───▼─┐  ┌──▼──┐ ┌───▼────┐ ┌────▼──────┐
│ DEX │  │Vali-│ │Trans-  │ │Blockchain │
│Route│  │dation│ │action  │ │Submission │
│    │  │Engine│ │Builder │ │          │
└──┬─┘  └──────┘ └────────┘ └──────────┘
   │
   ├─→ Raydium Fetcher
   ├─→ Meteora Fetcher
   └─→ Pricing Engine
        │
┌───────▼──────────────────────────┐
│      Caching Layer (Redis)       │
│  - Price Cache                   │
│  - Order Cache                   │
│  - Pub/Sub Messaging             │
└────────────────────────────────┘
        │
┌───────▼──────────────────────────┐
│    Persistence Layer (PostgreSQL)│
│  - Order Storage                 │
│  - Transaction History           │
│  - Query Engine                  │
└────────────────────────────────┘
```

## Core Components

### 1. REST API (Fastify)

**Purpose:** Handle HTTP requests for order management

**Responsibilities:**
- Accept order submissions
- Validate input parameters
- Return order status
- Provide health checks
- Serve metrics

**Endpoints:**
- `POST /api/orders` - Submit new order
- `GET /api/orders/:id` - Get order status
- `GET /api/orders` - List orders
- `POST /api/orders/:id/cancel` - Cancel order
- `GET /health` - Health check
- `GET /metrics` - System metrics

**Key Files:**
- `src/api/server.ts` - Server configuration
- `src/api/routes/orders.ts` - Order routes
- `src/api/middleware/validation.ts` - Input validation

### 2. WebSocket Manager

**Purpose:** Real-time bidirectional communication with clients

**Responsibilities:**
- Manage client connections
- Handle subscription/unsubscription
- Broadcast order status updates
- Maintain connection state
- Send heartbeats

**Features:**
- Per-connection subscription tracking
- Graceful disconnection handling
- Automatic reconnection support
- Message acknowledgment

**Key Files:**
- `src/websocket/manager.ts` - WebSocket management
- `src/websocket/handlers.ts` - Message handling

### 3. Order Queue

**Purpose:** Manage asynchronous order processing with concurrency control

**Responsibilities:**
- Queue order jobs
- Process orders concurrently
- Track job state
- Handle retries
- Emit events

**Features:**
- Configurable concurrency limits
- Job prioritization (low, normal, high)
- Automatic retry with backoff
- Job state tracking
- Statistics collection

**Key Files:**
- `src/queue/order-queue.ts` - Main queue interface
- `src/queue/queue-manager.ts` - Queue management
- `src/queue/job-processor.ts` - Job execution

### 4. Execution Engine

**Purpose:** Orchestrate complete order execution lifecycle

**Responsibilities:**
- Validate orders
- Route orders to DEXs
- Build transactions
- Submit to blockchain
- Confirm execution
- Track state transitions

**State Machine:**
```
PENDING
  ├→ ROUTING
  │   ├→ BUILDING
  │   │   ├→ SUBMITTED
  │   │   │   ├→ CONFIRMED ✓
  │   │   │   └→ FAILED ✗
  │   │   └→ FAILED ✗
  │   └→ FAILED ✗
  └→ FAILED ✗
```

**Error Handling:**
- Validation errors: Permanent failure
- Network errors: Retryable
- Timeout: Retryable
- Insufficient liquidity: Permanent failure

**Key Files:**
- `src/execution/engine.ts` - Core engine
- `src/execution/error-handler.ts` - Error classification
- `src/execution/types.ts` - Type definitions

### 5. DEX Router

**Purpose:** Find optimal execution path across DEXs

**Responsibilities:**
- Fetch quotes from DEXs
- Compare prices
- Select best route
- Calculate price impact
- Handle fallbacks

**Routing Priority:**
1. **BEST_PRICE**: Select lowest output price
2. **SPEED**: Select fastest response
3. **RELIABILITY**: Select most stable DEX

**DEX Support:**
- Raydium (Frequent, stable)
- Meteora (Alternative, emerging)

**Key Files:**
- `src/router/dex-router.ts` - Router logic
- `src/router/pricing-engine.ts` - Price comparison
- `src/router/fetchers/*` - DEX-specific fetchers

### 6. Caching Layer (Redis)

**Purpose:** Improve performance through caching and pub/sub

**Components:**

**Price Cache:**
- Caches recent DEX quotes
- TTL: 5-10 seconds
- Reduces DEX API calls

**Order Cache:**
- Caches order status
- Enables quick lookups
- Fast state checks

**Pub/Sub Messaging:**
- Publish order updates
- Subscribe to price changes
- Event distribution

**Key Files:**
- `src/cache/redis.ts` - Redis client
- `src/cache/strategies/*` - Caching strategies
- `src/cache/pubsub.ts` - Pub/Sub handling

### 7. Persistence Layer (PostgreSQL)

**Purpose:** Durable order storage and audit trail

**Tables:**

**Orders Table:**
```sql
CREATE TABLE orders (
  id UUID PRIMARY KEY,
  order_id VARCHAR UNIQUE,
  status VARCHAR,
  token_in VARCHAR,
  token_out VARCHAR,
  amount_in DECIMAL,
  amount_out DECIMAL,
  dex_used VARCHAR,
  transaction_hash VARCHAR,
  created_at TIMESTAMP,
  completed_at TIMESTAMP
);
```

**Transactions Table:**
```sql
CREATE TABLE transactions (
  id UUID PRIMARY KEY,
  order_id UUID REFERENCES orders(id),
  hash VARCHAR,
  status VARCHAR,
  gas_used BIGINT,
  timestamp TIMESTAMP
);
```

**Features:**
- Connection pooling
- Transaction support
- Query optimization
- Error recovery

**Key Files:**
- `src/persistence/database.ts` - Database manager
- `src/persistence/queries.ts` - SQL queries
- `src/persistence/migration/*` - Schema migrations

### 8. Utilities

**Logger (Winston):**
- Structured logging
- Multiple log levels
- File and console output
- JSON formatting for CloudWatch

**Metrics Collector:**
- Performance tracking
- Error counting
- Percentile calculations
- Summary aggregation

**Error Handler:**
- Error classification
- Retry determination
- Error context tracking
- Log generation

**Retry Logic:**
- Exponential backoff
- Configurable strategies
- Error predicate matching
- Timeout handling

## Data Flow

### Order Submission Flow

```
Client
  │
  ├─→ POST /api/orders
  │
  ├─→ Fastify Server
  │   │
  │   ├─→ Validate Input
  │   │
  │   ├─→ Check Configuration
  │   │
  │   └─→ Queue Order
  │
  ├─→ Return 200 with job ID
  │
  └─→ Subscribe to WebSocket (optional)
```

### Order Execution Flow

```
Queue Processor
  │
  ├─→ Pick Job from Queue
  │
  ├─→ Execution Engine
  │   │
  │   ├─→ PENDING: Validate Order
  │   │   └─→ Check token addresses
  │   │   └─→ Validate amounts
  │   │   └─→ Check slippage range
  │   │
  │   ├─→ ROUTING: Fetch Quotes
  │   │   ├─→ Raydium Fetcher
  │   │   ├─→ Meteora Fetcher
  │   │   └─→ Compare prices
  │   │
  │   ├─→ BUILDING: Create Transaction
  │   │   ├─→ Create instructions
  │   │   ├─→ Build transaction
  │   │   └─→ Sign transaction
  │   │
  │   ├─→ SUBMITTED: Send to Blockchain
  │   │   ├─→ Submit transaction
  │   │   └─→ Wait for confirmation
  │   │
  │   └─→ CONFIRMED: Success
  │       ├─→ Update database
  │       ├─→ Cache result
  │       └─→ Emit event
  │
  ├─→ Error Occurred?
  │   ├─→ RETRYABLE: Retry with backoff
  │   ├─→ PERMANENT: Mark failed
  │   └─→ TIMEOUT: Retry or fail
  │
  └─→ Job Complete
```

### WebSocket Update Flow

```
Execution Engine
  │
  ├─→ State Change Occurred
  │
  ├─→ Emit Event
  │   ├─→ state_change
  │   ├─→ order_routed
  │   ├─→ order_submitted
  │   ├─→ order_confirmed
  │   └─→ order_failed
  │
  ├─→ WebSocket Manager
  │   │
  │   ├─→ Find Subscribers
  │   │   └─→ Look up order subscriptions
  │   │
  │   ├─→ Prepare Message
  │   │   ├─→ type: event type
  │   │   ├─→ orderId: order ID
  │   │   ├─→ payload: event data
  │   │   └─→ timestamp: event time
  │   │
  │   └─→ Send to Clients
  │       ├─→ Client 1
  │       ├─→ Client 2
  │       └─→ Client N
  │
  └─→ Clients Receive Update
```

## Configuration

See [CONFIG.md](CONFIG.md) for environment-based configuration.

**Key Settings:**
- `MAX_CONCURRENT_ORDERS`: Execution concurrency
- `ORDER_TIMEOUT_MS`: Execution timeout
- `ROUTING_TIMEOUT_MS`: DEX routing timeout
- `QUEUE_CONCURRENCY`: Queue processing threads
- `LOG_LEVEL`: Logging verbosity

## Performance Considerations

### Caching
- Price quotes cached in Redis (5s TTL)
- Recent order status cached (10s TTL)
- Reduces database queries by 80%

### Connection Pooling
- Database: 10-20 connections
- Redis: Single persistent connection
- WebSocket: Per-client connection

### Concurrency
- Order execution: Configurable concurrency (default: 100)
- Queue processing: Configurable workers (default: 10)
- Database queries: Connection pool management

### Metrics
- Average execution: ~4-5 seconds
- P95 execution: ~8-10 seconds
- P99 execution: ~12-15 seconds
- Routing time: ~1-2 seconds
- Success rate: >95%

## Security

### Input Validation
- All inputs validated before processing
- Token addresses verified
- Amounts checked for validity
- Slippage range enforced

### Error Handling
- Sensitive errors don't leak to clients
- Errors logged for debugging
- Rate limiting on failed attempts
- Timeout protection

### Database
- SQL injection prevention via parameterized queries
- Connection pooling with timeout
- Transaction isolation

### WebSocket
- Message size limits
- Connection rate limiting
- Automatic timeout disconnection

## Monitoring

### Logging
- Structured logs with timestamps
- Log levels: DEBUG, INFO, WARN, ERROR
- File rotation for long-running processes
- JSON format for CloudWatch integration

### Metrics
- Order execution statistics
- DEX routing statistics
- Queue depth and processing time
- WebSocket connection count
- Error rates by type

### Health Checks
- Database connectivity
- Redis connectivity
- Service availability
- Response time tracking

## Deployment

### Docker
- Multi-stage builds for optimization
- Alpine Linux for small footprint
- Non-root user for security
- Health checks included

### Kubernetes
- Horizontal pod autoscaling
- Health check probes
- Environment variable injection
- Volume mounts for logging

### Monitoring Stack
- CloudWatch for logs
- Prometheus for metrics
- Grafana for dashboards
- AlertManager for alerts

---

For implementation details, see:
- [API Documentation](API.md)
- [Configuration Guide](CONFIG.md)
- [Testing Guide](TESTING.md)
