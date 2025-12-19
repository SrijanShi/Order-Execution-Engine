/**
 * Cache key prefixes and constants
 */
export const CACHE_KEYS = {
  // Order caching
  ORDER: (orderId: string) => `order:${orderId}`,
  ORDERS_BY_USER: (userId: string) => `orders:user:${userId}`,
  PENDING_ORDERS: 'orders:pending',
  ACTIVE_ORDERS: 'orders:active',
  
  // Price caching
  PRICE: (tokenMint: string, dex: string) => `price:${tokenMint}:${dex}`,
  PRICE_FEED: (tokenMint: string) => `price:feed:${tokenMint}`,
  PRICE_HISTORY: (tokenMint: string) => `price:history:${tokenMint}`,
  
  // WebSocket subscriptions
  WS_SUBSCRIPTION: (orderId: string) => `ws:sub:${orderId}`,
  WS_SUBSCRIPTIONS: 'ws:subscriptions',
  
  // Queue caching
  QUEUE_PROCESSING: 'queue:processing',
  QUEUE_FAILED: 'queue:failed',
  
  // Statistics
  ORDER_STATS: 'stats:orders',
  DEX_STATS: (dex: string) => `stats:dex:${dex}`,
};

/**
 * Cache TTL values (in seconds)
 */
export const CACHE_TTL = {
  // Order caching
  ORDER: 60,                    // 1 minute
  ORDER_CONFIRMED: 3600,        // 1 hour (confirmed orders live longer)
  PENDING_ORDERS: 30,           // 30 seconds
  ACTIVE_ORDERS: 300,           // 5 minutes
  
  // Price caching
  PRICE: 10,                    // 10 seconds
  PRICE_FEED: 5,                // 5 seconds (real-time)
  PRICE_HISTORY: 600,           // 10 minutes
  
  // WebSocket subscriptions
  WS_SUBSCRIPTION: 3600,        // 1 hour
  
  // Statistics
  STATS: 60,                    // 1 minute
};

/**
 * Pub/Sub channels
 */
export const PUBSUB_CHANNELS = {
  ORDER_STATUS_UPDATE: (orderId: string) => `channel:order:${orderId}:status`,
  ORDER_PRICE_UPDATE: (tokenMint: string) => `channel:price:${tokenMint}:update`,
  EXECUTION_COMPLETE: 'channel:execution:complete',
  ERROR_ALERT: 'channel:error:alert',
};

/**
 * Event types
 */
export enum CacheEventType {
  ORDER_CREATED = 'ORDER_CREATED',
  ORDER_UPDATED = 'ORDER_UPDATED',
  ORDER_CONFIRMED = 'ORDER_CONFIRMED',
  ORDER_FAILED = 'ORDER_FAILED',
  PRICE_UPDATED = 'PRICE_UPDATED',
  PRICE_FEED_UPDATED = 'PRICE_FEED_UPDATED',
  WS_CONNECTED = 'WS_CONNECTED',
  WS_DISCONNECTED = 'WS_DISCONNECTED',
}