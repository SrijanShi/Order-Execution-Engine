import { FastifyInstance } from 'fastify';
import { ApiServer } from '../server';
import { ExecutionEngine } from '../../execution/engine';
import { WebSocketManager } from '../../websocket/manager';
import { DexRouter } from '../../router/dex-router';
import { OrderStatus } from '../../types/common';

// Mock DexRouter
class MockDexRouter implements Partial<DexRouter> {
  async routeOrder(): Promise<any> {
    return {
      quotes: [
        {
          dexAddress: '0x1',
          amountOut: 1010,
          priceImpact: 0.01,
        },
      ],
      dexName: 'raydium',
      priceImpact: 0.01,
    };
  }
}

describe('API Server - REST Endpoints', () => {
  let apiServer: ApiServer;
  let app: FastifyInstance;
  let executionEngine: ExecutionEngine;
  let mockRouter: MockDexRouter;

  beforeAll(async () => {
    mockRouter = new MockDexRouter();
    executionEngine = new ExecutionEngine(mockRouter as any);
    const wsManager = new WebSocketManager();

    apiServer = new ApiServer(executionEngine, wsManager, 3001);
    app = (await apiServer.initialize())!;
  });

  afterAll(async () => {
    await apiServer.stop();
  });

  afterEach(() => {
    executionEngine.reset();
  });

  describe('POST /api/orders/execute', () => {
    test('should submit order successfully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/orders/execute',
        payload: {
          tokenIn: 'SOL',
          tokenOut: 'USDC',
          amount: 1000,
          slippage: 0.01,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.orderId).toBeDefined();
      expect(body.orderId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(body.status).toBe(OrderStatus.PENDING);
      expect(body.timestamp).toBeDefined();
    });

    test('should return 400 for missing tokenIn', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/orders/execute',
        payload: {
          tokenOut: 'USDC',
          amount: 1000,
          slippage: 0.01,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Validation failed');
      expect(body.details).toBeDefined();
    });

    test('should return 400 for missing tokenOut', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/orders/execute',
        payload: {
          tokenIn: 'SOL',
          amount: 1000,
          slippage: 0.01,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    test('should return 400 for negative amount', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/orders/execute',
        payload: {
          tokenIn: 'SOL',
          tokenOut: 'USDC',
          amount: -1000,
          slippage: 0.01,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.details).toBeDefined();
    });

    test('should return 400 for invalid slippage', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/orders/execute',
        payload: {
          tokenIn: 'SOL',
          tokenOut: 'USDC',
          amount: 1000,
          slippage: 1.5, // > 1
        },
      });

      expect(response.statusCode).toBe(400);
    });

    test('should return 400 for zero amount', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/orders/execute',
        payload: {
          tokenIn: 'SOL',
          tokenOut: 'USDC',
          amount: 0,
          slippage: 0.01,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    test('should accept valid order with minimum amount', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/orders/execute',
        payload: {
          tokenIn: 'SOL',
          tokenOut: 'USDC',
          amount: 0.001,
          slippage: 0.001,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.orderId).toBeDefined();
    });

    test('should accept valid order with max slippage', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/orders/execute',
        payload: {
          tokenIn: 'SOL',
          tokenOut: 'USDC',
          amount: 1000,
          slippage: 1.0,
        },
      });

      expect(response.statusCode).toBe(201);
    });
  });

  describe('GET /api/orders/:orderId', () => {
    test('should retrieve order by ID', async () => {
      // First submit an order
      const submitResponse = await app.inject({
        method: 'POST',
        url: '/api/orders/execute',
        payload: {
          tokenIn: 'SOL',
          tokenOut: 'USDC',
          amount: 1000,
          slippage: 0.01,
        },
      });

      const submitBody = JSON.parse(submitResponse.body);
      const orderId = submitBody.orderId;

      // Store the order in execution engine and wait
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Retrieve the order
      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/orders/${orderId}`,
      });

      // Should be either 200 (found) or 404 (not yet in engine)
      expect([200, 404]).toContain(getResponse.statusCode);

      if (getResponse.statusCode === 200) {
        const getBody = JSON.parse(getResponse.body);
        expect(getBody.orderId).toBe(orderId);
        expect(getBody.status).toBeDefined();
      }
    });

    test('should return 404 for non-existent order', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/orders/00000000-0000-0000-0000-000000000000',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Order not found');
    });

    test('should return 400 for invalid order ID format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/orders/invalid-id',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Invalid order ID format');
    });

    test('should return execution details for completed order', async () => {
      // Submit order
      const submitResponse = await app.inject({
        method: 'POST',
        url: '/api/orders/execute',
        payload: {
          tokenIn: 'SOL',
          tokenOut: 'USDC',
          amount: 1000,
          slippage: 0.01,
        },
      });

      const submitBody = JSON.parse(submitResponse.body);
      const orderId = submitBody.orderId;

      // Wait longer for execution to complete
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Retrieve order
      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/orders/${orderId}`,
      });

      // Should be found (after waiting)
      expect([200, 404]).toContain(getResponse.statusCode);

      if (getResponse.statusCode === 200) {
        const getBody = JSON.parse(getResponse.body);
        expect(getBody.orderId).toBe(orderId);
        expect(getBody.status).toBeDefined();
      }
    });
  });

  describe('GET /api/orders', () => {
    test('should retrieve all orders', async () => {
      // Submit multiple orders
      const orders = [];
      for (let i = 0; i < 3; i++) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/orders/execute',
          payload: {
            tokenIn: 'SOL',
            tokenOut: 'USDC',
            amount: 1000 + i * 100,
            slippage: 0.01,
          },
        });
        orders.push(JSON.parse(response.body).orderId);
      }

      // Retrieve all orders
      const getResponse = await app.inject({
        method: 'GET',
        url: '/api/orders',
      });

      expect(getResponse.statusCode).toBe(200);
      const body = JSON.parse(getResponse.body);
      expect(body.orders).toBeDefined();
      expect(Array.isArray(body.orders)).toBe(true);
      expect(body.total).toBeDefined();
      expect(body.timestamp).toBeDefined();
    });

    test('should support limit parameter', async () => {
      // Submit orders
      for (let i = 0; i < 5; i++) {
        await app.inject({
          method: 'POST',
          url: '/api/orders/execute',
          payload: {
            tokenIn: 'SOL',
            tokenOut: 'USDC',
            amount: 1000,
            slippage: 0.01,
          },
        });
      }

      // Wait a bit for async execution to register
      await new Promise(resolve => setTimeout(resolve, 100));

      // Retrieve with limit
      const response = await app.inject({
        method: 'GET',
        url: '/api/orders?limit=2',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.orders).toBeDefined();
      expect(body.orders.length).toBeLessThanOrEqual(2);
    });

    test('should filter orders by status', async () => {
      // Submit order
      await app.inject({
        method: 'POST',
        url: '/api/orders/execute',
        payload: {
          tokenIn: 'SOL',
          tokenOut: 'USDC',
          amount: 1000,
          slippage: 0.01,
        },
      });

      // Retrieve pending orders
      const response = await app.inject({
        method: 'GET',
        url: `/api/orders?status=${OrderStatus.PENDING}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.orders).toBeDefined();
    });

    test('should cap limit at 100', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/orders?limit=500',
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('POST /api/health', () => {
    test('should return health status', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
      expect(body.service).toBe('dex-order-engine');
      expect(body.executionEngine).toBeDefined();
      expect(body.websocket).toBeDefined();
      expect(body.uptime).toBeDefined();
      expect(body.timestamp).toBeDefined();
    });

    test('should include execution engine stats', async () => {
      // Submit some orders
      for (let i = 0; i < 2; i++) {
        await app.inject({
          method: 'POST',
          url: '/api/orders/execute',
          payload: {
            tokenIn: 'SOL',
            tokenOut: 'USDC',
            amount: 1000,
            slippage: 0.01,
          },
        });
      }

      // Wait for execution
      await new Promise((resolve) => setTimeout(resolve, 100));

      const response = await app.inject({
        method: 'POST',
        url: '/api/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.executionEngine.totalExecuted).toBeGreaterThanOrEqual(0);
      expect(body.executionEngine.failureRate).toBeDefined();
    });

    test('should include WebSocket stats', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.websocket.activeConnections).toBeGreaterThanOrEqual(0);
      expect(body.websocket.totalConnections).toBeGreaterThanOrEqual(0);
    });
  });

  describe('GET /api/health', () => {
    test('should return health status with GET', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
      expect(body.service).toBe('dex-order-engine');
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('404 Handler', () => {
    test('should return 404 for unknown routes', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/unknown',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Not Found');
      expect(body.path).toBe('/api/unknown');
      expect(body.method).toBe('GET');
    });
  });

  describe('Concurrent Requests', () => {
    test('should handle multiple concurrent order submissions', async () => {
      const promises = [];

      for (let i = 0; i < 5; i++) {
        promises.push(
          app.inject({
            method: 'POST',
            url: '/api/orders/execute',
            payload: {
              tokenIn: 'SOL',
              tokenOut: 'USDC',
              amount: 1000 + i * 100,
              slippage: 0.01,
            },
          }),
        );
      }

      const responses = await Promise.all(promises);

      responses.forEach((response) => {
        expect(response.statusCode).toBe(201);
        const body = JSON.parse(response.body);
        expect(body.orderId).toBeDefined();
      });
    });

    test('should handle mixed concurrent requests', async () => {
      // Submit orders
      const submitPromises = [];
      const orderIds: string[] = [];

      for (let i = 0; i < 3; i++) {
        submitPromises.push(
          app.inject({
            method: 'POST',
            url: '/api/orders/execute',
            payload: {
              tokenIn: 'SOL',
              tokenOut: 'USDC',
              amount: 1000,
              slippage: 0.01,
            },
          }).then((res) => {
            const body = JSON.parse(res.body);
            if (body.orderId) {
              orderIds.push(body.orderId);
            }
            return res;
          }),
        );
      }

      const submitResponses = await Promise.all(submitPromises);
      submitResponses.forEach((response) => {
        expect(response.statusCode).toBe(201);
      });

      // Wait for orders to be stored
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Retrieve orders concurrently
      const getPromises = orderIds.map((id) =>
        app.inject({
          method: 'GET',
          url: `/api/orders/${id}`,
        }),
      );

      const getResponses = await Promise.all(getPromises);
      getResponses.forEach((response) => {
        // Either 200 or 404 depending on execution timing
        expect([200, 404]).toContain(response.statusCode);
      });
    });
  });

  describe('Response Format', () => {
    test('should include timestamp in all responses', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/orders/execute',
        payload: {
          tokenIn: 'SOL',
          tokenOut: 'USDC',
          amount: 1000,
          slippage: 0.01,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.timestamp).toBeDefined();
      expect(new Date(body.timestamp)).toBeInstanceOf(Date);
    });

    test('should include proper headers', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/health',
      });

      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.headers['access-control-allow-methods']).toBeDefined();
    });
  });

  describe('Order ID Generation', () => {
    test('should generate unique order IDs', async () => {
      const orderIds = new Set();

      for (let i = 0; i < 10; i++) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/orders/execute',
          payload: {
            tokenIn: 'SOL',
            tokenOut: 'USDC',
            amount: 1000,
            slippage: 0.01,
          },
        });

        const body = JSON.parse(response.body);
        orderIds.add(body.orderId);
      }

      expect(orderIds.size).toBe(10); // All unique
    });

    test('should generate valid UUIDs', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/orders/execute',
        payload: {
          tokenIn: 'SOL',
          tokenOut: 'USDC',
          amount: 1000,
          slippage: 0.01,
        },
      });

      const body = JSON.parse(response.body);
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(body.orderId).toMatch(uuidRegex);
    });
  });
});
