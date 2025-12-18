import { db } from '../database';
import { OrderQueries, ExecutionQueries, PriceHistoryQueries } from '../queries';
import { OrderStatus, OrderType, DexType } from '../../types/common';
import { SubmitOrderRequest } from '../../types/order';
import { logger } from '../../utils/logger';

describe('Database Layer', () => {
  beforeAll(async () => {
    logger.info('🧪 Starting database tests...');
    await db.initialize();
  });

  afterAll(async () => {
    logger.info('🧪 Closing database connection...');
    await db.close();
  });

  describe('DatabaseManager', () => {
    test('should connect to database', async () => {
      const isHealthy = await db.healthCheck();
      expect(isHealthy).toBe(true);
    });

    test('should return pool statistics', () => {
      const stats = db.getPoolStats();
      expect(stats.totalCount).toBeGreaterThan(0);
      expect(stats.idleCount).toBeGreaterThanOrEqual(0);
      expect(stats.waitingCount).toBeGreaterThanOrEqual(0);
    });

    test('should execute raw query', async () => {
      const result = await db.query('SELECT COUNT(*) as count FROM orders;');
      expect(result.rows).toBeDefined();
      expect(result.rows.length).toBeGreaterThan(0);
    });

    test('should handle transactions', async () => {
      const result = await db.transaction(async (client) => {
        const res = await client.query('SELECT NOW();');
        return res.rows[0];
      });

      expect(result).toBeDefined();
    });
  });

  describe('OrderQueries', () => {
    let testOrderId: string;

    test('createOrder should create a new order', async () => {
      const request: SubmitOrderRequest = {
        tokenIn: 'EPjFWaLb3p4xQGpuJgr3YWnZdBXFQr3yBH1xYeeFQfpq', // USDC
        tokenOut: 'So11111111111111111111111111111111111111112', // SOL
        amount: 100_000_000,
        slippage: 0.01,
        orderType: OrderType.MARKET,
      };

      const order = await OrderQueries.createOrder(request, 'test-user-1');
      testOrderId = order.orderId;

      expect(order.orderId).toBeDefined();
      expect(order.status).toBe(OrderStatus.PENDING);
      expect(order.tokenIn).toBe(request.tokenIn);
      expect(order.amount).toBe(request.amount);
      expect(order.currentAttempt).toBe(1);
    });

    test('getOrderById should retrieve order', async () => {
      const request: SubmitOrderRequest = {
        tokenIn: 'EPjFWaLb3p4xQGpuJgr3YWnZdBXFQr3yBH1xYeeFQfpq',
        tokenOut: 'So11111111111111111111111111111111111111112',
        amount: 50_000_000,
      };

      const createdOrder = await OrderQueries.createOrder(request, 'test-user-2');
      const retrievedOrder = await OrderQueries.getOrderById(createdOrder.orderId);

      expect(retrievedOrder).not.toBeNull();
      expect(retrievedOrder?.orderId).toBe(createdOrder.orderId);
      expect(retrievedOrder?.status).toBe(OrderStatus.PENDING);
    });

    test('getOrderById should return null for non-existent order', async () => {
      const order = await OrderQueries.getOrderById('non-existent-id-12345');
      expect(order).toBeNull();
    });

    test('updateOrderStatus should change order status', async () => {
      const request: SubmitOrderRequest = {
        tokenIn: 'EPjFWaLb3p4xQGpuJgr3YWnZdBXFQr3yBH1xYeeFQfpq',
        tokenOut: 'So11111111111111111111111111111111111111112',
        amount: 75_000_000,
      };

      const order = await OrderQueries.createOrder(request, 'test-user-3');

      const updated = await OrderQueries.updateOrderStatus(
        order.orderId,
        OrderStatus.ROUTING,
        {
          executedDex: DexType.RAYDIUM,
          expectedPrice: 5.23,
        }
      );

      expect(updated.status).toBe(OrderStatus.ROUTING);
      expect(updated.executedDex).toBe(DexType.RAYDIUM);
      expect(updated.expectedPrice).toBe(5.23);
    });

    test('updateOrderError should record error', async () => {
      const request: SubmitOrderRequest = {
        tokenIn: 'EPjFWaLb3p4xQGpuJgr3YWnZdBXFQr3yBH1xYeeFQfpq',
        tokenOut: 'So11111111111111111111111111111111111111112',
        amount: 25_000_000,
      };

      const order = await OrderQueries.createOrder(request, 'test-user-4');

      const updated = await OrderQueries.updateOrderError(
        order.orderId,
        'INSUFFICIENT_LIQUIDITY',
        'Pool does not have enough liquidity',
        1
      );

      expect(updated.error).toBeDefined();
      expect(updated.error?.code).toBe('INSUFFICIENT_LIQUIDITY');
      expect(updated.status).toBe(OrderStatus.PENDING); // Not failed on first attempt
    });

    test('updateOrderError should mark as failed after max attempts', async () => {
      const request: SubmitOrderRequest = {
        tokenIn: 'EPjFWaLb3p4xQGpuJgr3YWnZdBXFQr3yBH1xYeeFQfpq',
        tokenOut: 'So11111111111111111111111111111111111111112',
        amount: 35_000_000,
      };

      const order = await OrderQueries.createOrder(request, 'test-user-5');

      const updated = await OrderQueries.updateOrderError(
        order.orderId,
        'NETWORK_TIMEOUT',
        'Network request timed out',
        3 // Max attempts
      );

      expect(updated.status).toBe(OrderStatus.FAILED);
    });

    test('getOrdersByUser should retrieve user orders', async () => {
      const userId = 'test-user-batch';

      // Create multiple orders
      for (let i = 0; i < 3; i++) {
        await OrderQueries.createOrder(
          {
            tokenIn: 'EPjFWaLb3p4xQGpuJgr3YWnZdBXFQr3yBH1xYeeFQfpq',
            tokenOut: 'So11111111111111111111111111111111111111112',
            amount: 100_000_000 * (i + 1),
          },
          userId
        );
      }

      const { orders, total } = await OrderQueries.getOrdersByUser(userId, 50, 0);

      expect(orders.length).toBeGreaterThanOrEqual(3);
      expect(total).toBeGreaterThanOrEqual(3);
    });

    test('getPendingOrders should return active orders', async () => {
      // Create a pending order
      await OrderQueries.createOrder(
        {
          tokenIn: 'EPjFWaLb3p4xQGpuJgr3YWnZdBXFQr3yBH1xYeeFQfpq',
          tokenOut: 'So11111111111111111111111111111111111111112',
          amount: 100_000_000,
        },
        'test-user-pending'
      );

      const pending = await OrderQueries.getPendingOrders(100);

      expect(pending.length).toBeGreaterThan(0);
      expect(
        pending.some(
          (o) =>
            o.status === OrderStatus.PENDING ||
            o.status === OrderStatus.ROUTING ||
            o.status === OrderStatus.BUILDING ||
            o.status === OrderStatus.SUBMITTED
        )
      ).toBe(true);
    });

    test('getOrdersByStatus should filter orders', async () => {
      // Create and update an order to CONFIRMED
      const request: SubmitOrderRequest = {
        tokenIn: 'EPjFWaLb3p4xQGpuJgr3YWnZdBXFQr3yBH1xYeeFQfpq',
        tokenOut: 'So11111111111111111111111111111111111111112',
        amount: 100_000_000,
      };

      const order = await OrderQueries.createOrder(request, 'test-user-status');
      await OrderQueries.updateOrderStatus(
        order.orderId,
        OrderStatus.CONFIRMED,
        {
          executedPrice: 5.0,
          txHash: 'mock_tx_hash',
        }
      );

      const confirmed = await OrderQueries.getOrdersByStatus(OrderStatus.CONFIRMED, 100);

      expect(
        confirmed.some(
          (o) =>
            o.orderId === order.orderId && o.status === OrderStatus.CONFIRMED
        )
      ).toBe(true);
    });

    test('incrementAttempt should increase attempt counter', async () => {
      const request: SubmitOrderRequest = {
        tokenIn: 'EPjFWaLb3p4xQGpuJgr3YWnZdBXFQr3yBH1xYeeFQfpq',
        tokenOut: 'So11111111111111111111111111111111111111112',
        amount: 100_000_000,
      };

      const order = await OrderQueries.createOrder(request, 'test-user-attempt');
      const initialAttempt = order.currentAttempt;

      const updated = await OrderQueries.incrementAttempt(order.orderId);

      expect(updated.currentAttempt).toBe(initialAttempt + 1);
    });
  });

  describe('ExecutionQueries', () => {
    test('createExecution should record execution', async () => {
      const order = await OrderQueries.createOrder(
        {
          tokenIn: 'EPjFWaLb3p4xQGpuJgr3YWnZdBXFQr3yBH1xYeeFQfpq',
          tokenOut: 'So11111111111111111111111111111111111111112',
          amount: 100_000_000,
        },
        'test-user-exec'
      );

      await ExecutionQueries.createExecution(order.orderId, {
        success: true,
        status: OrderStatus.CONFIRMED,
        dex: DexType.RAYDIUM,
        executedPrice: 5.23,
        txHash: 'mock_tx_hash_123',
        totalDuration: 5000,
        executedAt: new Date(),
      });

      const executions = await ExecutionQueries.getExecutionsByOrderId(order.orderId);

      expect(executions.length).toBeGreaterThan(0);
      expect(executions[0].tx_hash).toBe('mock_tx_hash_123');
      expect(executions[0].dex_used).toBe(DexType.RAYDIUM);
    });

    test('getExecutionsByOrderId should retrieve executions', async () => {
      const order = await OrderQueries.createOrder(
        {
          tokenIn: 'EPjFWaLb3p4xQGpuJgr3YWnZdBXFQr3yBH1xYeeFQfpq',
          tokenOut: 'So11111111111111111111111111111111111111112',
          amount: 100_000_000,
        },
        'test-user-exec-history'
      );

      // Create multiple executions
      for (let i = 0; i < 2; i++) {
        await ExecutionQueries.createExecution(order.orderId, {
          success: i === 1,
          status: i === 1 ? OrderStatus.CONFIRMED : OrderStatus.FAILED,
          dex: i === 0 ? DexType.METEORA : DexType.RAYDIUM,
          executedPrice: i === 1 ? 5.23 : 0,
          txHash: i === 1 ? 'mock_tx_hash' : undefined,
          totalDuration: 3000,
          executedAt: new Date(),
        });
      }

      const executions = await ExecutionQueries.getExecutionsByOrderId(order.orderId);

      expect(executions.length).toBe(2);
    });

    test('getExecutionStats should return aggregated statistics', async () => {
      const stats = await ExecutionQueries.getExecutionStats(24);

      expect(Array.isArray(stats)).toBe(true);
    });
  });

  describe('PriceHistoryQueries', () => {
    const testTokenMint = 'EPjFWaLb3p4xQGpuJgr3YWnZdBXFQr3yBH1xYeeFQfpq';

    test('recordPrice should store price data', async () => {
      await PriceHistoryQueries.recordPrice(
        testTokenMint,
        DexType.RAYDIUM,
        5.23,
        1_000_000,
        0.5
      );

      const history = await PriceHistoryQueries.getPriceHistory(testTokenMint, 24);

      expect(history.length).toBeGreaterThan(0);
      expect(history[0].token_mint).toBe(testTokenMint);
    });

    test('getPriceHistory should retrieve price data', async () => {
      // Record some prices
      for (let i = 0; i < 3; i++) {
        await PriceHistoryQueries.recordPrice(
          testTokenMint,
          DexType.RAYDIUM,
          5.0 + i * 0.1,
          1_000_000 + i * 100_000,
          0.5 + i * 0.1
        );
      }

      const history = await PriceHistoryQueries.getPriceHistory(testTokenMint, 24);

      expect(history.length).toBeGreaterThan(0);
      expect(history[0].price).toBeDefined();
    });

    test('getAveragePrice should calculate average', async () => {
      // Record prices
      await PriceHistoryQueries.recordPrice(testTokenMint, DexType.RAYDIUM, 5.0);
      await PriceHistoryQueries.recordPrice(testTokenMint, DexType.RAYDIUM, 5.2);
      await PriceHistoryQueries.recordPrice(testTokenMint, DexType.RAYDIUM, 5.4);

      const avgPrice = await PriceHistoryQueries.getAveragePrice(
        testTokenMint,
        DexType.RAYDIUM,
        1
      );

      expect(avgPrice).toBeDefined();
      expect(avgPrice).toBeGreaterThan(0);
    });

    test('getPriceComparison should compare DEX prices', async () => {
      // Record prices from different DEXs
      await PriceHistoryQueries.recordPrice(testTokenMint, DexType.RAYDIUM, 5.23);
      await PriceHistoryQueries.recordPrice(testTokenMint, DexType.METEORA, 5.20);

      const comparison = await PriceHistoryQueries.getPriceComparison(testTokenMint, 60);

      expect(Array.isArray(comparison)).toBe(true);
      expect(comparison.length).toBeGreaterThan(0);
    });
  });
});