import { redis } from '../redis';
import { logger } from '../../utils/logger';
import { CACHE_KEYS, CACHE_TTL } from '../constants';

/**
 * WebSocket Subscription Cache
 * Tracks active WebSocket connections per order
 */
export class SubscriptionCache {
  /**
   * Add WebSocket client to order subscription
   */
  static async addSubscriber(orderId: string, clientId: string): Promise<void> {
    try {
      const key = CACHE_KEYS.WS_SUBSCRIPTION(orderId);
      await redis.sadd(key, clientId);

      logger.debug('Client subscribed to order', { orderId, clientId });
    } catch (error) {
      logger.error('Failed to add subscriber', {
        orderId,
        clientId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Remove WebSocket client from order subscription
   */
  static async removeSubscriber(orderId: string, clientId: string): Promise<void> {
    try {
      const key = CACHE_KEYS.WS_SUBSCRIPTION(orderId);
      await redis.srem(key, clientId);

      logger.debug('Client unsubscribed from order', { orderId, clientId });
    } catch (error) {
      logger.error('Failed to remove subscriber', {
        orderId,
        clientId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get all subscribers for an order
   */
  static async getSubscribers(orderId: string): Promise<string[]> {
    try {
      const key = CACHE_KEYS.WS_SUBSCRIPTION(orderId);
      return await redis.smembers(key);
    } catch (error) {
      logger.error('Failed to get subscribers', {
        orderId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Check if client is subscribed to order
   */
  static async isSubscribed(orderId: string, clientId: string): Promise<boolean> {
    try {
      const key = CACHE_KEYS.WS_SUBSCRIPTION(orderId);
      return await redis.sismember(key, clientId);
    } catch (error) {
      logger.error('Failed to check subscription', {
        orderId,
        clientId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Get all subscriptions for a client
   */
  static async getClientSubscriptions(clientId: string): Promise<string[]> {
    try {
      const pattern = 'ws:sub:*';
      const keys = await redis.keys(pattern);

      const subscriptions: string[] = [];

      for (const key of keys) {
        const isSubscribed = await redis.sismember(key, clientId);
        if (isSubscribed) {
          const orderId = key.replace('ws:sub:', '');
          subscriptions.push(orderId);
        }
      }

      logger.debug('Client subscriptions retrieved', {
        clientId,
        count: subscriptions.length,
      });

      return subscriptions;
    } catch (error) {
      logger.error('Failed to get client subscriptions', {
        clientId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Clear all subscribers for an order
   */
  static async clearSubscribers(orderId: string): Promise<void> {
    try {
      const key = CACHE_KEYS.WS_SUBSCRIPTION(orderId);
      await redis.del(key);

      logger.debug('Order subscribers cleared', { orderId });
    } catch (error) {
      logger.error('Failed to clear subscribers', {
        orderId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get subscription count for an order
   */
  static async getSubscriberCount(orderId: string): Promise<number> {
    try {
      const subscribers = await this.getSubscribers(orderId);
      return subscribers.length;
    } catch (error) {
      logger.error('Failed to get subscriber count', {
        orderId,
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * Get total active subscriptions
   */
  static async getTotalSubscriptions(): Promise<number> {
    try {
      const pattern = 'ws:sub:*';
      const keys = await redis.keys(pattern);
      return keys.length;
    } catch (error) {
      logger.error('Failed to get total subscriptions', {
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }
}
