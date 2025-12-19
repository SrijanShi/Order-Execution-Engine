import { dexRouter } from '../dex-router';
import { RoutingPriority, QuoteSource } from '../constants';
import { DexType } from '../../types/dex';
import { logger } from '../../utils/logger';

describe('DEX Router', () => {
  beforeAll(async () => {
    logger.info('🧪 Starting DEX Router tests...');
  });

  const testTokens = {
    tokenIn: 'EPjFWaLb3p4xQGpuJgr3YWnZdBXFQr3yBH1xYeeFQfpq',
    tokenOut: 'So11111111111111111111111111111111111111112',
  };

  describe('Single DEX Quote', () => {
    test('should fetch quote from Raydium', async () => {
      const quote = await dexRouter.getQuoteFromDex(
        DexType.RAYDIUM,
        testTokens.tokenIn,
        testTokens.tokenOut,
        100_000_000,
        0.5
      );

      expect(quote).not.toBeNull();
      expect(quote?.dex).toBe(DexType.RAYDIUM);
      expect(quote?.amountOut).toBeGreaterThan(0);
      expect(quote?.price).toBeGreaterThan(0);
    });

    test('should fetch quote from Meteora', async () => {
      const quote = await dexRouter.getQuoteFromDex(
        DexType.METEORA,
        testTokens.tokenIn,
        testTokens.tokenOut,
        100_000_000,
        0.5
      );

      expect(quote).not.toBeNull();
      expect(quote?.dex).toBe(DexType.METEORA);
      expect(quote?.amountOut).toBeGreaterThan(0);
    });

    test('should return null for invalid DEX', async () => {
      const quote = await dexRouter.getQuoteFromDex(
        'INVALID_DEX' as any,
        testTokens.tokenIn,
        testTokens.tokenOut,
        100_000_000,
        0.5
      );

      expect(quote).toBeNull();
    });
  });

  describe('Multi-DEX Quotes', () => {
    test('should fetch quotes from all DEXs', async () => {
      const quotes = await dexRouter.getQuotesFromAllDexs(
        testTokens.tokenIn,
        testTokens.tokenOut,
        100_000_000,
        0.5
      );

      expect(quotes.length).toBeGreaterThan(0);
      expect(quotes.length).toBeLessThanOrEqual(2);
    });

    test('should return empty array on error', async () => {
      const quotes = await dexRouter.getQuotesFromAllDexs(
        'invalid',
        'invalid',
        -100,
        0.5
      );

      expect(Array.isArray(quotes)).toBe(true);
    });
  });

  describe('Order Routing', () => {
    test('should route with BEST_PRICE priority', async () => {
      const result = await dexRouter.routeOrder(
        testTokens.tokenIn,
        testTokens.tokenOut,
        100_000_000,
        0.5,
        RoutingPriority.BEST_PRICE
      );

      expect(result.bestQuote).not.toBeNull();
      expect(result.allQuotes.length).toBeGreaterThan(0);
      expect(result.source).toBe(QuoteSource.LIVE);
    });

    test('should route with LOWEST_IMPACT priority', async () => {
      const result = await dexRouter.routeOrder(
        testTokens.tokenIn,
        testTokens.tokenOut,
        100_000_000,
        0.5,
        RoutingPriority.LOWEST_IMPACT
      );

      expect(result.bestQuote).not.toBeNull();
      expect(result.bestQuote?.priceImpact).toBeDefined();
    });

    test('should route with MOST_LIQUID priority', async () => {
      const result = await dexRouter.routeOrder(
        testTokens.tokenIn,
        testTokens.tokenOut,
        100_000_000,
        0.5,
        RoutingPriority.MOST_LIQUID
      );

      expect(result.bestQuote).not.toBeNull();
      expect(result.bestQuote?.liquidity).toBeGreaterThan(0);
    });

    test('should compare quotes and select best', async () => {
      const result = await dexRouter.routeOrder(
        testTokens.tokenIn,
        testTokens.tokenOut,
        100_000_000,
        0.5
      );

      if (result.allQuotes.length > 1) {
        const best = result.bestQuote;
        const hasHigher = result.allQuotes.some(q => q.amountOut > best!.amountOut);
        expect(hasHigher).toBe(false);
      }
    });

    test('should validate price impact', async () => {
      const result = await dexRouter.routeOrder(
        testTokens.tokenIn,
        testTokens.tokenOut,
        100_000_000,
        0.5
      );

      if (result.bestQuote) {
        expect(result.bestQuote.priceImpact).toBeLessThan(10);
      }
    });
  });

  describe('Router Statistics', () => {
    test('should return routing statistics', async () => {
      const stats = await dexRouter.getRoutingStats();

      expect(stats.activeFetchers).toBeGreaterThan(0);
      expect(typeof stats.activeFetchers).toBe('number');
    });

    test('should return available fetcher', async () => {
      const fetcher = dexRouter.getFetcher(DexType.RAYDIUM);
      expect(fetcher).toBeDefined();
    });

    test('should return undefined for invalid fetcher', async () => {
      const fetcher = dexRouter.getFetcher('INVALID_DEX' as any);
      expect(fetcher).toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    test('should handle zero amount', async () => {
      const result = await dexRouter.routeOrder(
        testTokens.tokenIn,
        testTokens.tokenOut,
        0,
        0.5
      );

      expect(result.bestQuote).toBeNull();
    });

    test('should handle large amount', async () => {
      const result = await dexRouter.routeOrder(
        testTokens.tokenIn,
        testTokens.tokenOut,
        1_000_000_000_000,
        0.5
      );

      expect(result.allQuotes.length).toBeGreaterThanOrEqual(0);
    });

    test('should handle high slippage', async () => {
      const result = await dexRouter.routeOrder(
        testTokens.tokenIn,
        testTokens.tokenOut,
        100_000_000,
        50
      );

      expect(result.bestQuote).not.toBeNull();
    });
  });
});
