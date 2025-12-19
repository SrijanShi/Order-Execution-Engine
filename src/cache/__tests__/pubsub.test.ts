import { pubsub } from '../pubsub';
import { logger } from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';

describe('Pub/Sub', () => {
  beforeAll(async () => {
    logger.info('🧪 Starting Pub/Sub tests...');
  });

  afterAll(async () => {
    logger.info('🧪 Closing Pub/Sub connections...');
  });

  describe('Order Updates', () => {
    test('should track subscription count', async () => {
      const count = pubsub.getActiveSubscriptionCount();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test('should get active channels', async () => {
      const channels = pubsub.getActiveChannels();
      expect(Array.isArray(channels)).toBe(true);
    });
  });

  describe('Order Status Subscription', () => {
    test('should subscribe to order updates', async () => {
      const orderId = uuidv4();
      const handler = jest.fn();

      await pubsub.subscribeToOrderUpdates(orderId, handler);

      expect(pubsub.getActiveSubscriptionCount()).toBeGreaterThan(0);
    });

    test('should publish order update', async () => {
      const orderId = uuidv4();
      const message = { status: 'CONFIRMED', timestamp: new Date() };

      const subscribers = await pubsub.publishOrderUpdate(orderId, message);
      expect(typeof subscribers).toBe('number');
    });
  });

  describe('Price Updates', () => {
    test('should publish price update', async () => {
      const tokenMint = 'EPjFWaLb3p4xQGpuJgr3YWnZdBXFQr3yBH1xYeeFQfpq';
      const message = { price: 5.23, dex: 'raydium', timestamp: new Date() };

      const subscribers = await pubsub.publishPriceUpdate(tokenMint, message);
      expect(typeof subscribers).toBe('number');
    });
  });

  describe('Execution Events', () => {
    test('should publish execution completion', async () => {
      const message = { orderId: uuidv4(), status: 'SUCCESS', timestamp: new Date() };

      const subscribers = await pubsub.publishExecutionComplete(message);
      expect(typeof subscribers).toBe('number');
    });
  });
});
