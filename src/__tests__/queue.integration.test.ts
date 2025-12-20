import { OrderQueue } from '../queue/order-queue';
import { DexRouter } from '../router/dex-router';

/**
 * STEP 10: Queue Processing Integration Tests
 * Tests queue initialization and statistics
 */
describe('Queue Processing - Order Management', () => {
  let queue: OrderQueue;
  let router: DexRouter;

  beforeAll(async () => {
    router = new DexRouter();
    queue = new OrderQueue(router);
    await queue.initialize();
  });

  afterAll(async () => {
    await queue.shutdown();
  });

  test('should initialize queue', () => {
    expect(queue).toBeDefined();
  });

  test('should get queue state', () => {
    const state = queue.getQueueState();
    expect(state).toBeDefined();
  });

  test('should get queue statistics', () => {
    const stats = queue.getQueueStats();
    expect(stats).toBeDefined();
    expect(typeof stats).toBe('object');
  });

  test('should list pending orders', () => {
    const pending = queue.getPendingOrders();
    expect(Array.isArray(pending)).toBe(true);
  });

  test('should list processing orders', () => {
    const processing = queue.getProcessingOrders();
    expect(Array.isArray(processing)).toBe(true);
  });

  test('should list successful orders', () => {
    const successful = queue.getSuccessfulOrders();
    expect(Array.isArray(successful)).toBe(true);
  });

  test('should list failed orders', () => {
    const failed = queue.getFailedOrders();
    expect(Array.isArray(failed)).toBe(true);
  });

  test('should support queue event listeners', (done) => {
    queue.onQueueEvent(() => {
      // Event listener triggered
    });
    expect(queue.listeners('event').length).toBeGreaterThan(0);
    done();
  });
});
