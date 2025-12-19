import { OrderQueueManager } from '../queue-manager';
import { OrderQueue } from '../order-queue';
import { DexRouter } from '../../router/dex-router';
import { Order } from '../../types/order';
import { OrderStatus, OrderType } from '../../types/common';
import { OrderState, QueueEventType } from '../types';
import { logger } from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';

// Helper to create test orders
function createTestOrder(overrides?: Partial<Order>): Order {
  return {
    orderId: uuidv4(),
    type: OrderType.LIMIT,
    tokenIn: 'EPjFWaLb3p4xQGpuJgr3YWnZdBXFQr3yBH1xYeeFQfpq',
    tokenOut: 'So11111111111111111111111111111111111111112',
    amount: 100_000_000,
    slippage: 0.5,
    status: OrderStatus.PENDING,
    currentAttempt: 0,
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    ...overrides,
  };
}

describe('STEP 5: Order Queue & Async Processing', () => {
  beforeAll(() => {
    logger.info('🧪 Starting Order Queue tests...');
  });

  describe('Queue Manager: Add Order', () => {
    let queueManager: OrderQueueManager;

    beforeEach(() => {
      queueManager = new OrderQueueManager({
        maxConcurrentJobs: 3,
        maxRetries: 2,
        retryBackoffMs: 100,
      });
    });

    test('should add order to pending queue', async () => {
      const order = createTestOrder();
      const job = await queueManager.addOrder(order);

      expect(job).not.toBeNull();
      expect(job.orderId).toBe(order.orderId);
      expect(job.state).toBe(OrderState.PENDING);
      expect(queueManager.getQueueState().pendingOrders).toBe(1);
    });

    test('should add order with priority', async () => {
      const order1 = createTestOrder();
      const order2 = createTestOrder();

      const job1 = await queueManager.addOrder(order1, 'low');
      const job2 = await queueManager.addOrder(order2, 'high');

      const nextJob = queueManager.getNextJob();
      expect(nextJob?.id).toBe(job2.id);
    });

    test('should reject order with invalid data', async () => {
      const invalidOrder = { tokenIn: 'token1' } as any;
      await expect(queueManager.addOrder(invalidOrder)).rejects.toThrow();
    });
  });

  describe('Queue Manager: Get Next Job', () => {
    let queueManager: OrderQueueManager;

    beforeEach(() => {
      queueManager = new OrderQueueManager({
        maxConcurrentJobs: 3,
      });
    });

    test('should return null when queue is empty', () => {
      const job = queueManager.getNextJob();
      expect(job).toBeNull();
    });

    test('should return next pending job', async () => {
      const order = createTestOrder();
      const addedJob = await queueManager.addOrder(order);
      const nextJob = queueManager.getNextJob();

      expect(nextJob?.id).toBe(addedJob.id);
    });

    test('should respect max concurrent jobs limit', async () => {
      for (let i = 0; i < 5; i++) {
        await queueManager.addOrder(createTestOrder());
      }

      for (let i = 0; i < 3; i++) {
        const job = queueManager.getNextJob();
        if (job) {
          await queueManager.startProcessing(job.id);
        }
      }

      const nextJob = queueManager.getNextJob();
      expect(nextJob).toBeNull();
    });

    test('should prioritize jobs by priority', async () => {
      const order1 = createTestOrder();
      const order2 = createTestOrder();

      const job1 = await queueManager.addOrder(order1, 'low');
      const job2 = await queueManager.addOrder(order2, 'high');

      const nextJob = queueManager.getNextJob();
      expect(nextJob?.id).toBe(job2.id);
    });
  });

  describe('Queue Manager: Processing', () => {
    let queueManager: OrderQueueManager;

    beforeEach(() => {
      queueManager = new OrderQueueManager();
    });

    test('should start processing job', async () => {
      const order = createTestOrder();
      const job = await queueManager.addOrder(order);
      const started = await queueManager.startProcessing(job.id);

      expect(started).toBe(true);
      expect(queueManager.getQueueState().processingOrders).toBe(1);
      expect(queueManager.getQueueState().pendingOrders).toBe(0);
    });

    test('should set processingStartedAt timestamp', async () => {
      const order = createTestOrder();
      const job = await queueManager.addOrder(order);
      await queueManager.startProcessing(job.id);

      const processingJob = queueManager.getJob(job.id);
      expect(processingJob?.processingStartedAt).not.toBeUndefined();
    });

    test('should complete job successfully', async () => {
      const order = createTestOrder();
      const job = await queueManager.addOrder(order);
      await queueManager.startProcessing(job.id);
      const completed = await queueManager.completeJob(job.id);

      expect(completed).toBe(true);
      expect(queueManager.getQueueState().successfulOrders).toBe(1);
      const completedJob = queueManager.getJob(job.id);
      expect(completedJob?.state).toBe(OrderState.SUCCESS);
    });
  });

  describe('Queue Manager: Retry Logic', () => {
    let queueManager: OrderQueueManager;

    beforeEach(() => {
      queueManager = new OrderQueueManager({
        maxConcurrentJobs: 5,
        maxRetries: 2,
        retryBackoffMs: 100,
      });
    });

    test('should schedule retry on failure', async () => {
      const order = createTestOrder();
      const job = await queueManager.addOrder(order);
      await queueManager.startProcessing(job.id);
      const failed = await queueManager.failJob(job.id, 'Test error');

      expect(failed).toBe(true);
      const failedJob = queueManager.getJob(job.id);
      expect(failedJob?.state).toBe(OrderState.RETRY_PENDING);
      expect(failedJob?.retryInfo?.attempt).toBe(0); // First attempt is 0
    });

    test('should apply exponential backoff', async () => {
      const order = createTestOrder();
      const job = await queueManager.addOrder(order);
      await queueManager.startProcessing(job.id);
      await queueManager.failJob(job.id, 'Error 1');

      const failedJob1 = queueManager.getJob(job.id);
      const firstBackoff = failedJob1?.retryInfo?.backoffMs;

      await queueManager.startProcessing(job.id);
      await queueManager.failJob(job.id, 'Error 2');

      const failedJob2 = queueManager.getJob(job.id);
      const secondBackoff = failedJob2?.retryInfo?.backoffMs;

      expect(secondBackoff).toBe((firstBackoff || 100) * 2);
    });

    test('should mark as failed after max retries', async () => {
      const order = createTestOrder();
      const job = await queueManager.addOrder(order);

      for (let i = 0; i < 3; i++) {
        await queueManager.startProcessing(job.id);
        await queueManager.failJob(job.id, `Attempt ${i}`);
      }

      const finalJob = queueManager.getJob(job.id);
      expect(finalJob?.state).toBe(OrderState.FAILED);
    });
  });

  describe('Queue Manager: Statistics', () => {
    let queueManager: OrderQueueManager;

    beforeEach(() => {
      queueManager = new OrderQueueManager();
    });

    test('should track queue state', async () => {
      const order = createTestOrder();
      await queueManager.addOrder(order);

      const state = queueManager.getQueueState();
      expect(state.totalOrders).toBe(1);
      expect(state.pendingOrders).toBe(1);
    });

    test('should calculate success rate', async () => {
      for (let i = 0; i < 3; i++) {
        const order = createTestOrder();
        const job = await queueManager.addOrder(order);
        await queueManager.startProcessing(job.id);
        await queueManager.completeJob(job.id);
      }

      const state = queueManager.getQueueState();
      expect(state.successRate).toBe(100);
    });

    test('should track processing times', async () => {
      for (let i = 0; i < 2; i++) {
        const order = createTestOrder();
        const job = await queueManager.addOrder(order);
        await queueManager.startProcessing(job.id);
        await new Promise(r => setTimeout(r, 20));
        await queueManager.completeJob(job.id);
      }

      const state = queueManager.getQueueState();
      expect(state.avgProcessingTimeMs).toBeGreaterThan(0);
    });

    test('should get queue statistics', async () => {
      const order = createTestOrder();
      const job = await queueManager.addOrder(order);
      await queueManager.startProcessing(job.id);
      await queueManager.completeJob(job.id);

      const stats = queueManager.getStats();
      expect(stats.totalProcessed).toBe(1);
      expect(stats.totalSuccessful).toBe(1);
      expect(stats.successRate).toBe(100);
    });
  });

  describe('Queue Manager: Remove Job', () => {
    let queueManager: OrderQueueManager;

    beforeEach(() => {
      queueManager = new OrderQueueManager();
    });

    test('should remove pending job', async () => {
      const order = createTestOrder();
      const job = await queueManager.addOrder(order);
      const removed = await queueManager.removeJob(job.id);

      expect(removed).toBe(true);
      expect(queueManager.getJob(job.id)).toBeNull();
    });

    test('should return false when removing nonexistent job', async () => {
      const removed = await queueManager.removeJob('nonexistent-id');
      expect(removed).toBe(false);
    });
  });

  describe('Order Queue Integration', () => {
    let orderQueue: OrderQueue;
    let dexRouter: DexRouter;

    beforeEach(async () => {
      dexRouter = new DexRouter();
      orderQueue = new OrderQueue(dexRouter, {
        maxConcurrentJobs: 2,
        maxRetries: 2,
      });
      await orderQueue.initialize();
    });

    afterEach(async () => {
      await orderQueue.shutdown();
    });

    test('should submit and retrieve order', async () => {
      const order = createTestOrder();
      const job = await orderQueue.submitOrder(order);

      expect(job).not.toBeNull();
      expect(job.orderId).toBe(order.orderId);

      const retrievedJob = orderQueue.getOrderStatus(job.id);
      expect(retrievedJob?.id).toBe(job.id);
    });

    test('should track pending orders', async () => {
      const order = createTestOrder();
      await orderQueue.submitOrder(order);

      const pendingOrders = orderQueue.getPendingOrders();
      expect(pendingOrders.length).toBeGreaterThan(0);
    });

    test('should cancel pending order', async () => {
      const order = createTestOrder();
      const job = await orderQueue.submitOrder(order);
      const canceled = await orderQueue.cancelOrder(job.id);

      expect(canceled).toBe(true);
      expect(orderQueue.getOrderStatus(job.id)).toBeNull();
    });

    test('should not cancel processing order', async () => {
      const order = createTestOrder();
      const job = await orderQueue.submitOrder(order);
      const status = orderQueue.getOrderStatus(job.id);
      if (status) {
        status.state = OrderState.PROCESSING;
      }

      const canceled = await orderQueue.cancelOrder(job.id);
      expect(canceled).toBe(false);
    });

    test('should get queue statistics', async () => {
      const order = createTestOrder();
      await orderQueue.submitOrder(order);

      const stats = orderQueue.getQueueStats();
      expect(stats.currentQueueSize).toBeGreaterThanOrEqual(0);
      expect(stats.totalProcessed).toBeGreaterThanOrEqual(0);
    });

    test('should get orders by state', async () => {
      const order = createTestOrder();
      await orderQueue.submitOrder(order);

      const pending = orderQueue.getPendingOrders();
      expect(pending.length).toBeGreaterThan(0);

      const successful = orderQueue.getSuccessfulOrders();
      expect(Array.isArray(successful)).toBe(true);
    });
  });

  describe('Edge Cases & Error Handling', () => {
    let queueManager: OrderQueueManager;

    beforeEach(() => {
      queueManager = new OrderQueueManager();
    });

    test('should handle concurrent order additions', async () => {
      const orders = [];
      for (let i = 0; i < 5; i++) {
        orders.push(createTestOrder());
      }

      const promises = orders.map(order => queueManager.addOrder(order));
      const jobs = await Promise.all(promises);

      expect(jobs.length).toBe(5);
      expect(queueManager.getQueueState().totalOrders).toBe(5);
    });

    test('should handle get next job when empty', () => {
      const job = queueManager.getNextJob();
      expect(job).toBeNull();
    });

    test('should maintain order consistency', async () => {
      for (let i = 0; i < 3; i++) {
        await queueManager.addOrder(createTestOrder());
      }

      const state = queueManager.getQueueState();
      expect(state.totalOrders).toBe(3);
    });

    test('should handle job retrieval for nonexistent job', () => {
      const job = queueManager.getJob('nonexistent-id');
      expect(job).toBeNull();
    });

    test('should return false when starting nonexistent job', async () => {
      const started = await queueManager.startProcessing('nonexistent-id');
      expect(started).toBe(false);
    });
  });

  describe('Queue State Transitions', () => {
    let queueManager: OrderQueueManager;

    beforeEach(() => {
      queueManager = new OrderQueueManager();
    });

    test('should transition PENDING → PROCESSING → SUCCESS', async () => {
      const order = createTestOrder();
      const job = await queueManager.addOrder(order);

      let currentJob = queueManager.getJob(job.id);
      expect(currentJob?.state).toBe(OrderState.PENDING);

      await queueManager.startProcessing(job.id);
      currentJob = queueManager.getJob(job.id);
      expect(currentJob?.state).toBe(OrderState.PROCESSING);

      await queueManager.completeJob(job.id);
      currentJob = queueManager.getJob(job.id);
      expect(currentJob?.state).toBe(OrderState.SUCCESS);
    });

    test('should transition PENDING → PROCESSING → RETRY_PENDING', async () => {
      const order = createTestOrder();
      const job = await queueManager.addOrder(order);

      await queueManager.startProcessing(job.id);
      await queueManager.failJob(job.id, 'Error');

      const currentJob = queueManager.getJob(job.id);
      expect(currentJob?.state).toBe(OrderState.RETRY_PENDING);
    });
  });
});
