import { RaydiumFetcher } from '../fetchers/raydium-fetcher';
import { DexType } from '../../types/dex';
import { logger } from '../../utils/logger';

describe('Raydium Fetcher', () => {
  beforeAll(async () => {
    logger.info('🧪 Starting Raydium Fetcher tests...');
  });

  const fetcher = new RaydiumFetcher();
  const testTokens = {
    tokenIn: 'EPjFWaLb3p4xQGpuJgr3YWnZdBXFQr3yBH1xYeeFQfpq',
    tokenOut: 'So11111111111111111111111111111111111111112',
  };

  describe('Quote Fetching', () => {
    test('should fetch a valid quote', async () => {
      const quote = await fetcher.getQuote(
        testTokens.tokenIn,
        testTokens.tokenOut,
        100_000_000,
        0.5
      );

      expect(quote).not.toBeNull();
      expect(quote?.dex).toBe(DexType.RAYDIUM);
      expect(quote?.amountOut).toBeGreaterThan(0);
      expect(quote?.price).toBeGreaterThan(0);
      expect(quote?.priceImpact).toBeGreaterThanOrEqual(0);
      expect(quote?.fee).toBeGreaterThan(0);
    });

    test('should include fee information', async () => {
      const quote = await fetcher.getQuote(
        testTokens.tokenIn,
        testTokens.tokenOut,
        100_000_000,
        0.5
      );

      expect(quote?.feeBps).toBe(25);
      expect(quote?.fee).toBeGreaterThan(0);
    });

    test('should return a quote even with invalid token (simulated)', async () => {
      const quote = await fetcher.getQuote(
        'invalid',
        testTokens.tokenOut,
        100_000_000,
        0.5
      );

      // In simulation mode, we still get quotes
      expect(quote).not.toBeNull();
      expect(quote?.dex).toBe(DexType.RAYDIUM);
    });

    test('should return null for zero amount', async () => {
      const quote = await fetcher.getQuote(
        testTokens.tokenIn,
        testTokens.tokenOut,
        0,
        0.5
      );

      expect(quote).toBeNull();
    });

    test('should return null for invalid slippage', async () => {
      const quote = await fetcher.getQuote(
        testTokens.tokenIn,
        testTokens.tokenOut,
        100_000_000,
        150 // > 100
      );

      expect(quote).toBeNull();
    });
  });

  describe('Quote Range', () => {
    test('should fetch quotes for multiple amounts', async () => {
      const amounts = [100_000_000, 200_000_000, 300_000_000];
      const quotes = await fetcher.getQuoteRange(
        testTokens.tokenIn,
        testTokens.tokenOut,
        amounts,
        0.5
      );

      expect(quotes.length).toBe(amounts.length);
      quotes.forEach(q => {
        expect(q.amountOut).toBeGreaterThan(0);
      });
    });

    test('should handle empty amounts array', async () => {
      const quotes = await fetcher.getQuoteRange(
        testTokens.tokenIn,
        testTokens.tokenOut,
        [],
        0.5
      );

      expect(quotes.length).toBe(0);
    });
  });

  describe('Pair Support', () => {
    test('should support valid pairs', async () => {
      const supports = await fetcher.supportsPair(
        testTokens.tokenIn,
        testTokens.tokenOut
      );

      expect(supports).toBe(true);
    });

    test('should have sufficient liquidity', async () => {
      const liquidity = await fetcher.getLiquidity(
        testTokens.tokenIn,
        testTokens.tokenOut
      );

      expect(liquidity).toBeGreaterThan(0);
    });
  });

  describe('Liquidity', () => {
    test('should return default liquidity', async () => {
      const liquidity = await fetcher.getLiquidity(
        testTokens.tokenIn,
        testTokens.tokenOut
      );

      expect(liquidity).toBeGreaterThan(0);
    });
  });

  describe('Price Consistency', () => {
    test('should return consistent prices for same input', async () => {
      const quote1 = await fetcher.getQuote(
        testTokens.tokenIn,
        testTokens.tokenOut,
        100_000_000,
        0.5
      );

      const quote2 = await fetcher.getQuote(
        testTokens.tokenIn,
        testTokens.tokenOut,
        100_000_000,
        0.5
      );

      expect(quote1?.price).toBe(quote2?.price);
    });

    test('should return quotes with different slippage settings', async () => {
      const quote1 = await fetcher.getQuote(
        testTokens.tokenIn,
        testTokens.tokenOut,
        100_000_000,
        0.1
      );

      const quote2 = await fetcher.getQuote(
        testTokens.tokenIn,
        testTokens.tokenOut,
        100_000_000,
        1.0
      );

      // Both quotes should exist
      expect(quote1).not.toBeNull();
      expect(quote2).not.toBeNull();
      expect(quote1?.price).toBeGreaterThan(0);
      expect(quote2?.price).toBeGreaterThan(0);
    });
  });

  describe('Price Impact Calculation', () => {
    test('should calculate price impact for large orders', async () => {
      const quote = await fetcher.getQuote(
        testTokens.tokenIn,
        testTokens.tokenOut,
        10_000_000_000_000, // Very large order
        0.5
      );

      expect(quote?.priceImpact).toBeGreaterThan(0);
      expect(quote?.priceImpact).toBeLessThan(10); // Capped at 2% in simulation
    });
  });
});
