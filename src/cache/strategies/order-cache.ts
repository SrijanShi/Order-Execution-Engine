import { redis } from '../redis';
import { Order } from '../../types/order';
import { OrderStatus } from '../../types/common';
import { logger } from '../../utils/logger';
import { CACHE_KEYS, CACHE_TTL, CacheEventType, PUBSUB_CHANNELS } from '../constants';

/**
 * Order Caching Strategy
 * Manages order caching with automatic invalidation
 */
export class OrderCache {
  /**
   * Cache an order
   */
  static async setOrder(order: Order): Promise<void> {
    try {
      const key = CACHE_KEYS.ORDER(order.orderId);
      
      // Confirmed orders live longer
      const ttl = order.status === OrderStatus.CONFIRMED 
        ? CACHE_TTL.ORDER_CONFIRMED 
        : CACHE_TTL.ORDER;

      await redis.set(key, order, ttl);
      
      logger.debug('Order cached', {
        orderId: order.orderId,
        status: order.status,
        ttl,
      });

      // Add to active orders set
      if (order.status !== OrderStatus.CONFIRMED && order.status !== OrderStatus.FAILED) {
        await redis.sadd(CACHE_KEYS.ACTIVE_ORDERS, order.orderId);
      }
    } catch (error) {
      logger.error('Failed to cache order', {
        orderId: order.orderId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get cached order
   */
  static async getOrder(orderId: string): Promise<Order | null> {
    try {
      const key = CACHE_KEYS.ORDER(orderId);
      return await redis.get<Order>(key);
    } catch (error) {
      logger.error('Failed to get cached order', {
        orderId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Cache user's orders
   */
  static async setUserOrders(userId: string, orders: Order[]): Promise<void> {
    try {
      const key = CACHE_KEYS.ORDERS_BY_USER(userId);
      await redis.set(key, orders, CACHE_TTL.PENDING_ORDERS);

      logger.debug('User orders cached', {
        userId,
        count: orders.length,
      });
    } catch (error) {
      logger.error('Failed to cache user orders', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get cached user orders
   */
  static async getUserOrders(userId: string): Promise<Order[] | null> {
    try {
      const key = CACHE_KEYS.ORDERS_BY_USER(userId);
      return await redis.get<Order[]>(key);
    } catch (error) {
      logger.error('Failed to get cached user orders', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Cache pending orders
   */
  static async setPendingOrders(orders: Order[]): Promise<void> {
    try {
      await redis.set(CACHE_KEYS.PENDING_ORDERS, orders, CACHE_TTL.PENDING_ORDERS);

      logger.debug('Pending orders cached', { count: orders.length });
    } catch (error) {
      logger.error('Failed to cache pending orders', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get cached pending orders
   */
  static async getPendingOrders(): Promise<Order[] | null> {
    try {
      return await redis.get<Order[]>(CACHE_KEYS.PENDING_ORDERS);
    } catch (error) {
      logger.error('Failed to get cached pending orders', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Add order to active set
   */
  static async addActiveOrder(orderId: string): Promise<void> {
    try {
      await redis.sadd(CACHE_KEYS.ACTIVE_ORDERS, orderId);
      logger.debug('Order added to active set', { orderId });
    } catch (error) {
      logger.error('Failed to add to active orders', {
        orderId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Remove order from active set
   */
  static async removeActiveOrder(orderId: string): Promise<void> {
    try {
      await redis.srem(CACHE_KEYS.ACTIVE_ORDERS, orderId);
      logger.debug('Order removed from active set', { orderId });
    } catch (error) {
      logger.error('Failed to remove from active orders', {
        orderId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get all active order IDs
   */
  static async getActiveOrderIds(): Promise<string[]> {
    try {
      return await redis.smembers(CACHE_KEYS.ACTIVE_ORDERS);
    } catch (error) {
      logger.error('Failed to get active order IDs', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Check if order is active
   */
  static async isOrderActive(orderId: string): Promise<boolean> {
    try {
      return await redis.sismember(CACHE_KEYS.ACTIVE_ORDERS, orderId);
    } catch (error) {
      logger.error('Failed to check if order is active', {
        orderId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Invalidate order cache
   */
  static async invalidateOrder(orderId: string): Promise<void> {
    try {
      const key = CACHE_KEYS.ORDER(orderId);
      await redis.del(key);
      await this.removeActiveOrder(orderId);

      logger.debug('Order cache invalidated', { orderId });
    } catch (error) {
      logger.error('Failed to invalidate order cache', {
        orderId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Invalidate all caches for an order
   */
  static async invalidateOrderAllCaches(orderId: string, userId?: string): Promise<void> {
    try {
      await this.invalidateOrder(orderId);
      
      if (userId) {
        const userKey = CACHE_KEYS.ORDERS_BY_USER(userId);
        await redis.del(userKey);
      }

      await redis.del(CACHE_KEYS.PENDING_ORDERS);

      logger.debug('All order caches invalidated', { orderId, userId });
    } catch (error) {
      logger.error('Failed to invalidate all order caches', {
        orderId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Publish order status update
   */
  static async publishOrderUpdate(orderId: string, order: Order): Promise<void> {
    try {
      const channel = PUBSUB_CHANNELS.ORDER_STATUS_UPDATE(orderId);
      const message = {
        eventType: CacheEventType.ORDER_UPDATED,
        orderId,
        status: order.status,
        timestamp: new Date(),
        order,
      };

      await redis.publish(channel, message);

      logger.debug('Order status update published', {
        orderId,
        channel,
      });
    } catch (error) {
      logger.error('Failed to publish order update', {
        orderId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get cache statistics
   */
  static async getCacheStats(): Promise<{
    activeOrdersCount: number;
    pendingOrdersCached: boolean;
  }> {
    try {
      const activeIds = await this.getActiveOrderIds();
      const pendingOrders = await this.getPendingOrders();

      return {
        activeOrdersCount: activeIds.length,
        pendingOrdersCached: pendingOrders !== null,
      };
    } catch (error) {
      logger.error('Failed to get cache statistics', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        activeOrdersCount: 0,
        pendingOrdersCached: false,
      };
    }
  }
}
