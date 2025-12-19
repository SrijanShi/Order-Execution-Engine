import { PriceCache } from '../strategies/price-cache';
import { DexQuote, DexType } from '../../types';
import { logger } from '../../utils/logger';

describe('Price Cache', () => {
  beforeAll(async () => {
    logger.info('🧪 Starting price cache tests...');
  });

  const createMockQuote = (overrides?: Partial<DexQuote>): DexQuote => ({
    dex: DexType.RAYDIUM,
    tokenIn: 'EPjFWaLb3p4xQGpuJgr3YWnZdBXFQr3yBH1xYeeFQfpq',
    tokenOut: 'So11111111111111111111111111111111111111112',
    amountIn: 100,
    amountOut: 523,
    price: 5.23,
    priceImpact: 0.5,
    feeBps: 30,
    fee: 0.3,
    liquidity: 1_000_000,
    quoteTime: new Date(),
    expiresAt: new Date(Date.now() + 30_000),
    ...overrides,
  });

  describe('Price Caching', () => {
    test('should cache and retrieve price', async () => {
      const quote = createMockQuote();
      await PriceCache.setPrice(quote);

      const retrieved = await PriceCache.getPrice(quote.tokenIn, quote.dex);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.price).toBe(quote.price);
    });

    test('should cache price feed', async () => {
      const tokenMint = 'EPjFWaLb3p4xQGpuJgr3YWnZdBXFQr3yBH1xYeeFQfpq';
      const prices = new Map<DexType, number>([
        [DexType.RAYDIUM, 5.23],
        [DexType.METEORA, 5.20],
      ]);

      await PriceCache.setPriceFeed(tokenMint, prices);
      const feed = await PriceCache.getPriceFeed(tokenMint);

      expect(feed).not.toBeNull();
      expect(feed?.prices.size).toBe(2);
    });

    test('should cache price history', async () => {
      const tokenMint = 'EPjFWaLb3p4xQGpuJgr3YWnZdBXFQr3yBH1xYeeFQfpq';
      const history = [
        createMockQuote({ price: 5.0 }),
        createMockQuote({ price: 5.1 }),
        createMockQuote({ price: 5.2 }),
      ];

      await PriceCache.setPriceHistory(tokenMint, history);
      const retrieved = await PriceCache.getPriceHistory(tokenMint);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.length).toBe(3);
    });
  });

  describe('Price Queries', () => {
    test('should get best price', async () => {
      const tokenMint = 'EPjFWaLb3p4xQGpuJgr3YWnZdBXFQr3yBH1xYeeFQfpq';
      const prices = new Map<DexType, number>([
        [DexType.RAYDIUM, 5.5],
        [DexType.METEORA, 5.2],
      ]);

      await PriceCache.setPriceFeed(tokenMint, prices);
      const best = await PriceCache.getBestPrice(tokenMint);

      expect(best).not.toBeNull();
      expect(best?.dex).toBe(DexType.RAYDIUM);
      expect(best?.price).toBe(5.5);
    });
  });

  describe('Cache Invalidation', () => {
    test('should invalidate token prices', async () => {
      const tokenMint = 'EPjFWaLb3p4xQGpuJgr3YWnZdBXFQr3yBH1xYeeFQfpq';
      const quote = createMockQuote({ tokenIn: tokenMint });

      await PriceCache.setPrice(quote);
      await PriceCache.invalidateTokenPrices(tokenMint);

      const retrieved = await PriceCache.getPrice(tokenMint, DexType.RAYDIUM);
      expect(retrieved).toBeNull();
    });
  });

  describe('Cache Statistics', () => {
    test('should get cache statistics', async () => {
      const stats = await PriceCache.getCacheStats();

      expect(stats).toHaveProperty('pricesInCache');
      expect(typeof stats.pricesInCache).toBe('number');
    });
  });
});
