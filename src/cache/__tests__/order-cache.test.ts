import { OrderCache } from '../strategies/order-cache';
import { Order, OrderStatus, OrderType } from '../../types';
import { logger } from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';

describe('Order Cache', () => {
  beforeAll(async () => {
    logger.info('🧪 Starting order cache tests...');
  });

  const createMockOrder = (overrides?: Partial<Order>): Order => ({
    orderId: uuidv4(),
    userId: 'test-user',
    type: OrderType.MARKET,
    status: OrderStatus.PENDING,
    tokenIn: 'EPjFWaLb3p4xQGpuJgr3YWnZdBXFQr3yBH1xYeeFQfpq',
    tokenOut: 'So11111111111111111111111111111111111111112',
    amount: 100_000_000,
    slippage: 0.01,
    currentAttempt: 1,
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    ...overrides,
  });

  describe('Order Caching', () => {
    test('should cache and retrieve order', async () => {
      const order = createMockOrder();
      await OrderCache.setOrder(order);

      const retrieved = await OrderCache.getOrder(order.orderId);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.orderId).toBe(order.orderId);
      expect(retrieved?.status).toBe(OrderStatus.PENDING);
    });

    test('should cache user orders', async () => {
      const userId = 'user-' + uuidv4();
      const orders = [
        createMockOrder({ userId }),
        createMockOrder({ userId }),
        createMockOrder({ userId }),
      ];

      await OrderCache.setUserOrders(userId, orders);
      const retrieved = await OrderCache.getUserOrders(userId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.length).toBe(3);
    });

    test('should cache pending orders', async () => {
      const orders = [
        createMockOrder({ status: OrderStatus.PENDING }),
        createMockOrder({ status: OrderStatus.ROUTING }),
      ];

      await OrderCache.setPendingOrders(orders);
      const retrieved = await OrderCache.getPendingOrders();

      expect(retrieved).not.toBeNull();
      expect(retrieved?.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Active Orders', () => {
    test('should add order to active set', async () => {
      const orderId = uuidv4();
      await OrderCache.addActiveOrder(orderId);

      const isActive = await OrderCache.isOrderActive(orderId);
      expect(isActive).toBe(true);
    });

    test('should remove order from active set', async () => {
      const orderId = uuidv4();
      await OrderCache.addActiveOrder(orderId);
      await OrderCache.removeActiveOrder(orderId);

      const isActive = await OrderCache.isOrderActive(orderId);
      expect(isActive).toBe(false);
    });

    test('should get all active order IDs', async () => {
      const order1 = createMockOrder();
      const order2 = createMockOrder();

      await OrderCache.addActiveOrder(order1.orderId);
      await OrderCache.addActiveOrder(order2.orderId);

      const activeIds = await OrderCache.getActiveOrderIds();
      expect(activeIds.length).toBeGreaterThan(0);
    });
  });

  describe('Cache Invalidation', () => {
    test('should invalidate order cache', async () => {
      const order = createMockOrder();
      await OrderCache.setOrder(order);
      await OrderCache.invalidateOrder(order.orderId);

      const retrieved = await OrderCache.getOrder(order.orderId);
      expect(retrieved).toBeNull();
    });

    test('should invalidate all order caches', async () => {
      const userId = 'user-' + uuidv4();
      const order = createMockOrder({ userId });

      await OrderCache.setOrder(order);
      await OrderCache.invalidateOrderAllCaches(order.orderId, userId);

      const retrieved = await OrderCache.getOrder(order.orderId);
      expect(retrieved).toBeNull();
    });
  });

  describe('Cache Statistics', () => {
    test('should get cache statistics', async () => {
      const stats = await OrderCache.getCacheStats();

      expect(stats).toHaveProperty('activeOrdersCount');
      expect(stats).toHaveProperty('pendingOrdersCached');
      expect(typeof stats.activeOrdersCount).toBe('number');
      expect(typeof stats.pendingOrdersCached).toBe('boolean');
    });
  });
});
