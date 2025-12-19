import { redis } from '../redis';
import { DexQuote } from '../../types/dex';
import { DexType } from '../../types/common';
import { logger } from '../../utils/logger';
import { CACHE_KEYS, CACHE_TTL, PUBSUB_CHANNELS, CacheEventType } from '../constants';

/**
 * Price Caching Strategy
 * Manages DEX price caching for quick routing decisions
 */
export class PriceCache {
  /**
   * Cache a price quote
   */
  static async setPrice(quote: DexQuote): Promise<void> {
    try {
      const key = CACHE_KEYS.PRICE(quote.tokenIn, quote.dex);
      await redis.set(key, quote, CACHE_TTL.PRICE);

      logger.debug('Price cached', {
        tokenIn: quote.tokenIn.substring(0, 8),
        dex: quote.dex,
        price: quote.price,
      });
    } catch (error) {
      logger.error('Failed to cache price', {
        tokenIn: quote.tokenIn,
        dex: quote.dex,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get cached price quote
   */
  static async getPrice(tokenMint: string, dex: DexType): Promise<DexQuote | null> {
    try {
      const key = CACHE_KEYS.PRICE(tokenMint, dex);
      return await redis.get<DexQuote>(key);
    } catch (error) {
      logger.error('Failed to get cached price', {
        tokenMint,
        dex,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Cache price feed for a token from all DEXs
   */
  static async setPriceFeed(tokenMint: string, prices: Map<DexType, number>): Promise<void> {
    try {
      const feedData = {
        tokenMint,
        prices: Array.from(prices.entries()),
        timestamp: new Date(),
      };

      const key = CACHE_KEYS.PRICE_FEED(tokenMint);
      await redis.set(key, feedData, CACHE_TTL.PRICE_FEED);

      logger.debug('Price feed cached', {
        tokenMint: tokenMint.substring(0, 8),
        dexCount: prices.size,
      });
    } catch (error) {
      logger.error('Failed to cache price feed', {
        tokenMint,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get cached price feed
   */
  static async getPriceFeed(
    tokenMint: string
  ): Promise<{ prices: Map<DexType, number>; timestamp: Date } | null> {
    try {
      const key = CACHE_KEYS.PRICE_FEED(tokenMint);
      const feedData = await redis.get<any>(key);

      if (!feedData) return null;

      const pricesMap = new Map(feedData.prices) as Map<DexType, number>;
      return {
        prices: pricesMap,
        timestamp: new Date(feedData.timestamp),
      };
    } catch (error) {
      logger.error('Failed to get cached price feed', {
        tokenMint,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Cache price history
   */
  static async setPriceHistory(tokenMint: string, priceHistory: DexQuote[]): Promise<void> {
    try {
      const key = CACHE_KEYS.PRICE_HISTORY(tokenMint);
      await redis.set(key, priceHistory, CACHE_TTL.PRICE_HISTORY);

      logger.debug('Price history cached', {
        tokenMint: tokenMint.substring(0, 8),
        count: priceHistory.length,
      });
    } catch (error) {
      logger.error('Failed to cache price history', {
        tokenMint,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get cached price history
   */
  static async getPriceHistory(tokenMint: string): Promise<DexQuote[] | null> {
    try {
      const key = CACHE_KEYS.PRICE_HISTORY(tokenMint);
      return await redis.get<DexQuote[]>(key);
    } catch (error) {
      logger.error('Failed to get cached price history', {
        tokenMint,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Invalidate price cache for a token
   */
  static async invalidateTokenPrices(tokenMint: string): Promise<void> {
    try {
      // Delete all price caches for this token across all DEXs
      const keys = await redis.keys(`price:${tokenMint}:*`);
      if (keys.length > 0) {
        await redis.delMultiple(keys);
      }

      // Delete feed and history
      await redis.del(CACHE_KEYS.PRICE_FEED(tokenMint));
      await redis.del(CACHE_KEYS.PRICE_HISTORY(tokenMint));

      logger.debug('Price cache invalidated', {
        tokenMint: tokenMint.substring(0, 8),
      });
    } catch (error) {
      logger.error('Failed to invalidate price cache', {
        tokenMint,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Publish price update
   */
  static async publishPriceUpdate(tokenMint: string, priceData: any): Promise<void> {
    try {
      const channel = PUBSUB_CHANNELS.ORDER_PRICE_UPDATE(tokenMint);
      const message = {
        eventType: CacheEventType.PRICE_UPDATED,
        tokenMint,
        timestamp: new Date(),
        ...priceData,
      };

      await redis.publish(channel, message);

      logger.debug('Price update published', {
        tokenMint: tokenMint.substring(0, 8),
        channel,
      });
    } catch (error) {
      logger.error('Failed to publish price update', {
        tokenMint,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get best price across DEXs from cache
   */
  static async getBestPrice(tokenMint: string): Promise<{ dex: DexType; price: number } | null> {
    try {
      const feed = await this.getPriceFeed(tokenMint);
      if (!feed) return null;

      let bestDex: DexType | null = null;
      let bestPrice = 0;

      feed.prices.forEach((price, dex) => {
        if (price > bestPrice) {
          bestPrice = price;
          bestDex = dex;
        }
      });

      return bestDex ? { dex: bestDex, price: bestPrice } : null;
    } catch (error) {
      logger.error('Failed to get best price', {
        tokenMint,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Get cache statistics
   */
  static async getCacheStats(): Promise<{
    pricesInCache: number;
  }> {
    try {
      const keys = await redis.keys('price:*');
      return {
        pricesInCache: keys.length,
      };
    } catch (error) {
      logger.error('Failed to get price cache statistics', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        pricesInCache: 0,
      };
    }
  }
}
