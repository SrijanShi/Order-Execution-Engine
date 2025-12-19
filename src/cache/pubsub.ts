import { redis } from './redis';
import { logger } from '../utils/logger';
import { PUBSUB_CHANNELS } from './constants';

/**
 * Pub/Sub Message Manager
 * Handles publishing and subscribing to order and price updates
 */
export class PubSub {
  private handlers: Map<string, Set<(message: any) => void>> = new Map();

  /**
   * Subscribe to order status updates
   */
  async subscribeToOrderUpdates(
    orderId: string,
    handler: (message: any) => void
  ): Promise<void> {
    const channel = PUBSUB_CHANNELS.ORDER_STATUS_UPDATE(orderId);
    
    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, new Set());

      // Subscribe to Redis channel
      await redis.subscribe(channel, (message) => {
        const handlers = this.handlers.get(channel);
        if (handlers) {
          handlers.forEach((h) => h(message));
        }
      });
    }

    const handlers = this.handlers.get(channel)!;
    handlers.add(handler);

    logger.debug('Subscribed to order updates', { orderId, channel });
  }

  /**
   * Unsubscribe from order status updates
   */
  async unsubscribeFromOrderUpdates(
    orderId: string,
    handler: (message: any) => void
  ): Promise<void> {
    const channel = PUBSUB_CHANNELS.ORDER_STATUS_UPDATE(orderId);
    const handlers = this.handlers.get(channel);

    if (handlers) {
      handlers.delete(handler);

      if (handlers.size === 0) {
        await redis.unsubscribe(channel);
        this.handlers.delete(channel);
      }
    }

    logger.debug('Unsubscribed from order updates', { orderId, channel });
  }

  /**
   * Subscribe to price updates
   */
  async subscribeToPriceUpdates(
    tokenMint: string,
    handler: (message: any) => void
  ): Promise<void> {
    const channel = PUBSUB_CHANNELS.ORDER_PRICE_UPDATE(tokenMint);

    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, new Set());

      await redis.subscribe(channel, (message) => {
        const handlers = this.handlers.get(channel);
        if (handlers) {
          handlers.forEach((h) => h(message));
        }
      });
    }

    const handlers = this.handlers.get(channel)!;
    handlers.add(handler);

    logger.debug('Subscribed to price updates', { tokenMint, channel });
  }

  /**
   * Unsubscribe from price updates
   */
  async unsubscribeFromPriceUpdates(
    tokenMint: string,
    handler: (message: any) => void
  ): Promise<void> {
    const channel = PUBSUB_CHANNELS.ORDER_PRICE_UPDATE(tokenMint);
    const handlers = this.handlers.get(channel);

    if (handlers) {
      handlers.delete(handler);

      if (handlers.size === 0) {
        await redis.unsubscribe(channel);
        this.handlers.delete(channel);
      }
    }

    logger.debug('Unsubscribed from price updates', { tokenMint, channel });
  }

  /**
   * Publish order status update
   */
  async publishOrderUpdate(orderId: string, message: any): Promise<number> {
    const channel = PUBSUB_CHANNELS.ORDER_STATUS_UPDATE(orderId);
    return await redis.publish(channel, message);
  }

  /**
   * Publish price update
   */
  async publishPriceUpdate(tokenMint: string, message: any): Promise<number> {
    const channel = PUBSUB_CHANNELS.ORDER_PRICE_UPDATE(tokenMint);
    return await redis.publish(channel, message);
  }

  /**
   * Publish execution completion
   */
  async publishExecutionComplete(message: any): Promise<number> {
    return await redis.publish(PUBSUB_CHANNELS.EXECUTION_COMPLETE, message);
  }

  /**
   * Get active subscription count
   */
  getActiveSubscriptionCount(): number {
    let count = 0;
    this.handlers.forEach((handlers) => {
      count += handlers.size;
    });
    return count;
  }

  /**
   * Get active channels
   */
  getActiveChannels(): string[] {
    return Array.from(this.handlers.keys());
  }
}

export const pubsub = new PubSub();
