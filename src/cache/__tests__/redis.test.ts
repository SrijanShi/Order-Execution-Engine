import { redis } from '../redis';
import { logger } from '../../utils/logger';

describe('Redis Manager', () => {
  beforeAll(async () => {
    logger.info('🧪 Starting Redis tests...');
    // Flush Redis before tests to ensure clean state
    await redis.flushAll();
  });

  afterAll(async () => {
    logger.info('🧪 Closing Redis connection...');
    await redis.close();
  });

  describe('Connection', () => {
    test('should connect to Redis', async () => {
      const isHealthy = await redis.healthCheck();
      expect(isHealthy).toBe(true);
    });

    test('should get Redis info', async () => {
      const info = await redis.getInfo();
      expect(info).toBeDefined();
      expect(info.length).toBeGreaterThan(0);
    });
  });

  describe('String Operations', () => {
    test('should set and get value', async () => {
      await redis.set('test-key', { data: 'value' }, 60);
      const value = await redis.get('test-key');

      expect(value).not.toBeNull();
      expect((value as any)?.data).toBe('value');
    });

    test('should check if key exists', async () => {
      await redis.set('exists-key', 'test', 60);
      const exists = await redis.exists('exists-key');

      expect(exists).toBe(true);
    });

    test('should delete key', async () => {
      await redis.set('delete-key', 'test', 60);
      await redis.del('delete-key');

      const exists = await redis.exists('delete-key');
      expect(exists).toBe(false);
    });
  });

  describe('Set Operations', () => {
    test('should add members to set', async () => {
      const count = await redis.sadd('test-set', 'member1', 'member2', 'member3');
      expect(count).toBeGreaterThan(0);
    });

    test('should get set members', async () => {
      await redis.sadd('get-set', 'a', 'b', 'c');
      const members = await redis.smembers('get-set');

      expect(members).toContain('a');
      expect(members).toContain('b');
      expect(members).toContain('c');
    });

    test('should check set membership', async () => {
      await redis.sadd('member-set', 'test');
      const isMember = await redis.sismember('member-set', 'test');

      expect(isMember).toBe(true);
    });

    test('should remove from set', async () => {
      await redis.sadd('remove-set', 'item1', 'item2');
      await redis.srem('remove-set', 'item1');

      const isMember = await redis.sismember('remove-set', 'item1');
      expect(isMember).toBe(false);
    });
  });

  describe('Multiple Key Operations', () => {
    test('should delete multiple keys', async () => {
      await redis.set('key1', 'value1', 60);
      await redis.set('key2', 'value2', 60);
      await redis.set('key3', 'value3', 60);

      await redis.delMultiple(['key1', 'key2', 'key3']);

      const exists1 = await redis.exists('key1');
      const exists2 = await redis.exists('key2');
      const exists3 = await redis.exists('key3');

      expect(exists1).toBe(false);
      expect(exists2).toBe(false);
      expect(exists3).toBe(false);
    });
  });

  describe('Publish/Subscribe', () => {
    test('should publish message', async () => {
      const subscribers = await redis.publish('test-channel', { data: 'test' });
      expect(typeof subscribers).toBe('number');
    });
  });

  describe('Counter Operations', () => {
    test('should increment counter', async () => {
      const value = await redis.increment('counter-test');
      expect(value).toBeGreaterThan(0);
    });
  });
});
