# API Documentation

Complete REST API reference for the DEX Order Engine.

## Base URL

```
http://localhost:3000/api
```

## Authentication

Currently, the API does not require authentication. In production, consider adding:
- API key authentication
- JWT bearer tokens
- Rate limiting per client

## Endpoints

### Orders

#### Submit Order

**POST** `/orders`

Submit a new order for execution.

**Request Body:**
```json
{
  "orderId": "order-123",
  "tokenIn": "So11111111111111111111111111111111111111112",
  "tokenOut": "EPjFWaLb3hyccqaB3JgRekyvbYYGy4z3816t1Gx6oph",
  "amountIn": 1.5,
  "slippage": 0.5,
  "priority": "normal"
}
```

**Parameters:**
- `orderId` (string, required): Unique order identifier
- `tokenIn` (string, required): Source token mint address
- `tokenOut` (string, required): Destination token mint address
- `amountIn` (number, required): Input amount
- `slippage` (number, required): Slippage tolerance in basis points (0-10000)
- `priority` (string, optional): Order priority - "low", "normal", "high" (default: "normal")

**Response (200):**
```json
{
  "orderId": "order-123",
  "jobId": "job-uuid",
  "status": "PENDING",
  "createdAt": "2025-12-20T14:23:45.000Z",
  "message": "Order submitted successfully"
}
```

**Response (400):**
```json
{
  "error": "Invalid order",
  "details": "amountIn must be greater than 0",
  "code": "VALIDATION_ERROR"
}
```

**Response (500):**
```json
{
  "error": "Internal server error",
  "message": "Failed to submit order",
  "code": "INTERNAL_ERROR"
}
```

---

#### Get Order Status

**GET** `/orders/:orderId`

Retrieve current status of an order.

**Parameters:**
- `orderId` (string, required): Order identifier

**Response (200):**
```json
{
  "orderId": "order-123",
  "status": "CONFIRMED",
  "state": "CONFIRMED",
  "tokens": {
    "in": "So11111111111111111111111111111111111111112",
    "out": "EPjFWaLb3hyccqaB3JgRekyvbYYGy4z3816t1Gx6oph"
  },
  "amounts": {
    "in": 1.5,
    "out": 7.25
  },
  "execution": {
    "dex": "raydium",
    "price": 4.833,
    "priceImpact": 0.025
  },
  "transaction": {
    "hash": "0x123abc...",
    "status": "confirmed",
    "timestamp": "2025-12-20T14:23:50.000Z"
  },
  "createdAt": "2025-12-20T14:23:45.000Z",
  "completedAt": "2025-12-20T14:23:50.000Z",
  "executionTimeMs": 5000
}
```

**Response (404):**
```json
{
  "error": "Order not found",
  "orderId": "order-123",
  "code": "NOT_FOUND"
}
```

---

#### List Orders

**GET** `/orders`

List all orders with optional filtering.

**Query Parameters:**
- `status` (string, optional): Filter by status (PENDING, ROUTING, BUILDING, SUBMITTED, CONFIRMED, FAILED)
- `limit` (number, optional): Limit results (default: 100, max: 1000)
- `offset` (number, optional): Pagination offset (default: 0)
- `sortBy` (string, optional): Sort field (createdAt, completedAt, status)
- `sortOrder` (string, optional): Sort order (asc, desc)

**Response (200):**
```json
{
  "orders": [
    {
      "orderId": "order-123",
      "status": "CONFIRMED",
      "createdAt": "2025-12-20T14:23:45.000Z",
      "completedAt": "2025-12-20T14:23:50.000Z"
    }
  ],
  "total": 150,
  "limit": 100,
  "offset": 0
}
```

---

#### Cancel Order

**POST** `/orders/:orderId/cancel`

Cancel a pending order.

**Parameters:**
- `orderId` (string, required): Order identifier

**Response (200):**
```json
{
  "orderId": "order-123",
  "status": "CANCELLED",
  "message": "Order cancelled successfully"
}
```

**Response (409):**
```json
{
  "error": "Cannot cancel order in CONFIRMED state",
  "orderId": "order-123",
  "status": "CONFIRMED",
  "code": "INVALID_STATE"
}
```

---

### Health & Monitoring

#### Health Check

**GET** `/health`

Check service health status.

**Response (200):**
```json
{
  "status": "healthy",
  "uptime": 3600,
  "environment": "production",
  "database": "connected",
  "redis": "connected"
}
```

**Response (503):**
```json
{
  "status": "unhealthy",
  "database": "disconnected",
  "redis": "connected"
}
```

---

#### Metrics

**GET** `/metrics`

Get system metrics and performance data.

**Response (200):**
```json
{
  "ordersProcessed": 1500,
  "ordersSuccessful": 1450,
  "ordersFailed": 50,
  "successRate": "96.67%",
  "avgExecutionTimeMs": 4250,
  "p95ExecutionTimeMs": 8500,
  "p99ExecutionTimeMs": 12000,
  "avgRoutingTimeMs": 1200,
  "routingSuccessRate": "99.87%",
  "queueEnqueuedOrders": 1500,
  "queueCompletedOrders": 1450,
  "wsConnections": 42,
  "wsMessages": 15000,
  "validationErrors": 25,
  "routingErrors": 15,
  "submissionErrors": 10,
  "confirmationErrors": 0
}
```

---

### WebSocket

#### Connect to WebSocket

**WS** `/ws`

Real-time order status updates via WebSocket.

**Connection:**
```javascript
const ws = new WebSocket('ws://localhost:3000/ws');
```

**Subscribe to Order Updates:**
```json
{
  "type": "subscribe",
  "orderId": "order-123"
}
```

**Response:**
```json
{
  "type": "subscribed",
  "orderId": "order-123",
  "message": "Subscribed to order updates"
}
```

**Order Status Update:**
```json
{
  "type": "order_status",
  "orderId": "order-123",
  "status": "ROUTING",
  "state": "ROUTING",
  "timestamp": "2025-12-20T14:23:46.000Z"
}
```

**Unsubscribe:**
```json
{
  "type": "unsubscribe",
  "orderId": "order-123"
}
```

**Heartbeat (keep-alive):**
```json
{
  "type": "heartbeat"
}
```

---

## Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| VALIDATION_ERROR | 400 | Invalid input parameters |
| NOT_FOUND | 404 | Resource not found |
| INVALID_STATE | 409 | Operation invalid for current state |
| RATE_LIMITED | 429 | Rate limit exceeded |
| INTERNAL_ERROR | 500 | Internal server error |
| SERVICE_UNAVAILABLE | 503 | Service temporarily unavailable |

---

## Status Codes

| Code | Description |
|------|-------------|
| PENDING | Order submitted, awaiting processing |
| ROUTING | Finding best DEX and price |
| BUILDING | Constructing transaction |
| SUBMITTED | Transaction submitted to blockchain |
| CONFIRMED | Transaction confirmed on-chain |
| FAILED | Order execution failed |
| CANCELLED | Order cancelled by user |

---

## Rate Limiting

Rate limits are applied per IP address:

- **Default:** 1000 requests per minute
- **Burst:** 100 requests per second

Rate limit headers:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1640000000
```

---

## Examples

### cURL Examples

#### Submit Order
```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "order-1234",
    "tokenIn": "So11111111111111111111111111111111111111112",
    "tokenOut": "EPjFWaLb3hyccqaB3JgRekyvbYYGy4z3816t1Gx6oph",
    "amountIn": 2.5,
    "slippage": 0.5
  }'
```

#### Get Order Status
```bash
curl http://localhost:3000/api/orders/order-1234
```

#### Get Metrics
```bash
curl http://localhost:3000/api/metrics
```

### JavaScript Examples

#### Submit Order
```javascript
const response = await fetch('http://localhost:3000/api/orders', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    orderId: 'order-1234',
    tokenIn: 'So11111111111111111111111111111111111111112',
    tokenOut: 'EPjFWaLb3hyccqaB3JgRekyvbYYGy4z3816t1Gx6oph',
    amountIn: 2.5,
    slippage: 0.5
  })
});

const data = await response.json();
console.log(data);
```

#### WebSocket Connection
```javascript
const ws = new WebSocket('ws://localhost:3000/ws');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'subscribe',
    orderId: 'order-1234'
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Update:', data);
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};
```

---

## Best Practices

1. **Always validate input** before submitting orders
2. **Use WebSocket** for real-time updates instead of polling
3. **Handle errors gracefully** with appropriate retry logic
4. **Monitor metrics** for performance degradation
5. **Use appropriate slippage** settings for your use case
6. **Disconnect WebSocket** when no longer needed
7. **Implement exponential backoff** for failed requests

---

## Changelog

### v1.0.0
- Initial release
- Order submission and tracking
- Multi-DEX routing
- WebSocket support
- REST API endpoints
- Metrics collection

---

For more information, see:
- [Architecture](ARCHITECTURE.md)
- [Configuration](CONFIG.md)
- [Testing Guide](TESTING.md)
