import Redis from 'ioredis';
import { CONFIG } from '../types';
import { logger } from '../utils/logger';

/**
 * Redis Connection Manager
 * Handles connection pooling, health checks, and basic operations
 */
class RedisManager {
  private client: Redis;
  private pubClient: Redis;
  private subClient: Redis;
  private initialized: boolean = false;

  constructor() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    logger.info('Initializing Redis connection', { url: redisUrl });

    // Main client for get/set operations
    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      enableOfflineQueue: true,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    // Pub client for publishing
    this.pubClient = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
    });

    // Sub client for subscribing
    this.subClient = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
    });

    // Handle client events
    this.setupEventHandlers();
  }

  /**
   * Setup Redis event handlers
   */
  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      logger.info('✅ Redis client connected');
    });

    this.client.on('error', (err) => {
      logger.error('Redis client error', { error: err.message });
    });

    this.client.on('reconnecting', () => {
      logger.warn('Redis client reconnecting...');
    });

    this.pubClient.on('error', (err) => {
      logger.error('Redis pub client error', { error: err.message });
    });

    this.subClient.on('error', (err) => {
      logger.error('Redis sub client error', { error: err.message });
    });
  }

  /**
   * Get value from Redis
   */
  async get<T = any>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      if (!value) {
        logger.debug('Cache miss', { key });
        return null;
      }

      logger.debug('Cache hit', { key });
      return JSON.parse(value) as T;
    } catch (error) {
      logger.error('Failed to get from cache', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Set value in Redis with TTL
   */
  async set<T = any>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);

      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, serialized);
        logger.debug('Cache set with TTL', { key, ttl: ttlSeconds });
      } else {
        await this.client.set(key, serialized);
        logger.debug('Cache set', { key });
      }
    } catch (error) {
      logger.error('Failed to set cache', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Delete key from Redis
   */
  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
      logger.debug('Cache deleted', { key });
    } catch (error) {
      logger.error('Failed to delete cache', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Delete multiple keys
   */
  async delMultiple(keys: string[]): Promise<void> {
    if (keys.length === 0) return;

    try {
      await this.client.del(...keys);
      logger.debug('Multiple cache entries deleted', { count: keys.length });
    } catch (error) {
      logger.error('Failed to delete multiple cache entries', {
        count: keys.length,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const exists = await this.client.exists(key);
      return exists === 1;
    } catch (error) {
      logger.error('Failed to check cache existence', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Get all keys matching pattern
   */
  async keys(pattern: string): Promise<string[]> {
    try {
      const keys = await this.client.keys(pattern);
      logger.debug('Retrieved keys by pattern', { pattern, count: keys.length });
      return keys;
    } catch (error) {
      logger.error('Failed to get keys by pattern', {
        pattern,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Publish message to channel
   */
  async publish(channel: string, message: any): Promise<number> {
    try {
      const serialized = JSON.stringify(message);
      const subscribers = await this.pubClient.publish(channel, serialized);
      logger.debug('Message published', {
        channel,
        subscribers,
      });
      return subscribers;
    } catch (error) {
      logger.error('Failed to publish message', {
        channel,
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * Subscribe to channel
   */
  async subscribe(
    channel: string,
    handler: (message: any) => void
  ): Promise<void> {
    try {
      await this.subClient.subscribe(channel);
      logger.info('Subscribed to channel', { channel });

      this.subClient.on('message', (ch, msg) => {
        if (ch === channel) {
          try {
            const parsed = JSON.parse(msg);
            handler(parsed);
          } catch (error) {
            logger.error('Failed to parse message', {
              channel,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      });
    } catch (error) {
      logger.error('Failed to subscribe to channel', {
        channel,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Unsubscribe from channel
   */
  async unsubscribe(channel: string): Promise<void> {
    try {
      await this.subClient.unsubscribe(channel);
      logger.info('Unsubscribed from channel', { channel });
    } catch (error) {
      logger.error('Failed to unsubscribe from channel', {
        channel,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Increment a counter
   */
  async increment(key: string): Promise<number> {
    try {
      const value = await this.client.incr(key);
      logger.debug('Counter incremented', { key, value });
      return value;
    } catch (error) {
      logger.error('Failed to increment counter', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * Add item to set
   */
  async sadd(key: string, ...members: string[]): Promise<number> {
    try {
      const added = await this.client.sadd(key, ...members);
      logger.debug('Items added to set', { key, count: added });
      return added;
    } catch (error) {
      logger.error('Failed to add to set', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * Remove item from set
   */
  async srem(key: string, ...members: string[]): Promise<number> {
    try {
      const removed = await this.client.srem(key, ...members);
      logger.debug('Items removed from set', { key, count: removed });
      return removed;
    } catch (error) {
      logger.error('Failed to remove from set', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * Get all members of set
   */
  async smembers(key: string): Promise<string[]> {
    try {
      const members = await this.client.smembers(key);
      logger.debug('Set members retrieved', { key, count: members.length });
      return members;
    } catch (error) {
      logger.error('Failed to get set members', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Check if member exists in set
   */
  async sismember(key: string, member: string): Promise<boolean> {
    try {
      const exists = await this.client.sismember(key, member);
      return exists === 1;
    } catch (error) {
      logger.error('Failed to check set membership', {
        key,
        member,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error('Redis health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Get Redis info
   */
  async getInfo(): Promise<string> {
    try {
      return await this.client.info();
    } catch (error) {
      logger.error('Failed to get Redis info', {
        error: error instanceof Error ? error.message : String(error),
      });
      return '';
    }
  }

  /**
   * Flush all data (use with caution!)
   */
  async flushAll(): Promise<void> {
    try {
      await this.client.flushall();
      logger.warn('✅ Redis cache flushed (all data deleted)');
    } catch (error) {
      logger.error('Failed to flush Redis', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    try {
      await this.client.quit();
      await this.pubClient.quit();
      await this.subClient.quit();
      logger.info('Redis connections closed');
    } catch (error) {
      logger.error('Error closing Redis connections', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

// Export singleton instance
export const redis = new RedisManager();