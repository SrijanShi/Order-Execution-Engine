import { PricingEngine } from '../pricing-engine';
import { DexQuote, DexType } from '../../types/dex';
import { logger } from '../../utils/logger';

describe('Pricing Engine', () => {
  beforeAll(async () => {
    logger.info('🧪 Starting Pricing Engine tests...');
  });

  const createMockQuote = (overrides?: Partial<DexQuote>): DexQuote => ({
    dex: DexType.RAYDIUM,
    tokenIn: 'EPjFWaLb3p4xQGpuJgr3YWnZdBXFQr3yBH1xYeeFQfpq',
    tokenOut: 'So11111111111111111111111111111111111111112',
    amountIn: 100_000_000,
    amountOut: 523_000_000,
    price: 5.23,
    priceImpact: 0.5,
    feeBps: 25,
    fee: 1_307_500,
    liquidity: 1_000_000,
    quoteTime: new Date(),
    expiresAt: new Date(Date.now() + 30_000),
    ...overrides,
  });

  describe('Execution Price', () => {
    test('should calculate execution price correctly', () => {
      const quote = createMockQuote({
        amountIn: 100,
        amountOut: 523,
      });

      const price = PricingEngine.calculateExecutionPrice(quote);
      expect(price).toBe(5.23);
    });

    test('should return 0 for zero input', () => {
      const quote = createMockQuote({ amountIn: 0 });
      const price = PricingEngine.calculateExecutionPrice(quote);
      expect(price).toBe(0);
    });
  });

  describe('Minimum Output Calculation', () => {
    test('should calculate minimum output with slippage', () => {
      const expected = 500;
      const slippage = 1;

      const minimum = PricingEngine.calculateMinimumOutput(expected, slippage);
      expect(minimum).toBe(495);
    });

    test('should handle 0% slippage', () => {
      const expected = 500;
      const minimum = PricingEngine.calculateMinimumOutput(expected, 0);
      expect(minimum).toBe(500);
    });

    test('should handle high slippage', () => {
      const expected = 500;
      const minimum = PricingEngine.calculateMinimumOutput(expected, 50);
      expect(minimum).toBe(250);
    });
  });

  describe('Price Impact Validation', () => {
    test('should classify low impact (< 2%)', () => {
      const result = PricingEngine.validatePriceImpact(1);
      expect(result.isValid).toBe(true);
      expect(result.level).toBe('low');
    });

    test('should classify medium impact (2% - 5%)', () => {
      const result = PricingEngine.validatePriceImpact(3);
      expect(result.isValid).toBe(true);
      expect(result.level).toBe('medium');
    });

    test('should classify high impact (5% - 10%)', () => {
      const result = PricingEngine.validatePriceImpact(7);
      expect(result.isValid).toBe(true);
      expect(result.level).toBe('high');
    });

    test('should classify critical impact (> 10%)', () => {
      const result = PricingEngine.validatePriceImpact(15);
      expect(result.isValid).toBe(false);
      expect(result.level).toBe('critical');
    });
  });

  describe('Quote Selection', () => {
    test('should select best quote by amount', () => {
      const quotes = [
        createMockQuote({ amountOut: 500, dex: DexType.RAYDIUM }),
        createMockQuote({ amountOut: 600, dex: DexType.METEORA }),
        createMockQuote({ amountOut: 550, dex: DexType.RAYDIUM }),
      ];

      const best = PricingEngine.selectBestQuote(quotes);
      expect(best?.amountOut).toBe(600);
      expect(best?.dex).toBe(DexType.METEORA);
    });

    test('should select lowest impact quote', () => {
      const quotes = [
        createMockQuote({ priceImpact: 2.0 }),
        createMockQuote({ priceImpact: 0.5 }),
        createMockQuote({ priceImpact: 1.5 }),
      ];

      const best = PricingEngine.selectLowestImpact(quotes);
      expect(best?.priceImpact).toBe(0.5);
    });

    test('should return null for empty quotes', () => {
      const best = PricingEngine.selectBestQuote([]);
      expect(best).toBeNull();
    });
  });

  describe('Quote Ranking', () => {
    test('should rank quotes by score', () => {
      const quotes = [
        createMockQuote({ amountOut: 500, priceImpact: 2.0, liquidity: 500_000 }),
        createMockQuote({ amountOut: 600, priceImpact: 0.5, liquidity: 1_000_000 }),
        createMockQuote({ amountOut: 550, priceImpact: 1.0, liquidity: 800_000 }),
      ];

      const ranked = PricingEngine.rankQuotes(quotes);
      expect(ranked.length).toBe(3);
      expect(ranked[0].amountOut).toBe(600);
    });

    test('should rank quotes with custom weights', () => {
      const quotes = [
        createMockQuote({ amountOut: 500, priceImpact: 0.1 }),
        createMockQuote({ amountOut: 400, priceImpact: 5.0 }),
      ];

      const weights = { price: 0.1, impact: 0.8, liquidity: 0.1 };
      const ranked = PricingEngine.rankQuotes(quotes, weights);

      expect(ranked[0].priceImpact).toBe(0.1);
    });
  });

  describe('Quote Freshness', () => {
    test('should identify fresh quote', () => {
      const quote = createMockQuote({
        expiresAt: new Date(Date.now() + 10_000),
      });

      const fresh = PricingEngine.isQuoteFresh(quote);
      expect(fresh).toBe(true);
    });

    test('should identify expired quote', () => {
      const quote = createMockQuote({
        expiresAt: new Date(Date.now() - 1_000),
      });

      const fresh = PricingEngine.isQuoteFresh(quote);
      expect(fresh).toBe(false);
    });
  });

  describe('Quote Quality Assessment', () => {
    test('should assess excellent quality', () => {
      const quote = createMockQuote({
        priceImpact: 0.2,
        liquidity: 10_000_000,
        feeBps: 20,
      });

      const assessment = PricingEngine.assessQuoteQuality(quote);
      expect(assessment.quality).toBe('excellent');
      expect(assessment.score).toBeGreaterThanOrEqual(90);
    });

    test('should assess good quality', () => {
      const quote = createMockQuote({
        priceImpact: 0.8,
        liquidity: 2_000_000,
        feeBps: 25,
      });

      const assessment = PricingEngine.assessQuoteQuality(quote);
      expect(assessment.quality).toBe('good');
    });

    test('should assess poor quality', () => {
      const quote = createMockQuote({
        priceImpact: 9.0,
        liquidity: 100_000,
        feeBps: 100,
      });

      const assessment = PricingEngine.assessQuoteQuality(quote);
      expect(assessment.quality).toBe('poor');
    });
  });

  describe('Fee Impact', () => {
    test('should calculate fee impact correctly', () => {
      const impact = PricingEngine.calculateFeeImpact(1_000_000, 25);
      expect(impact).toBe(0.25);
    });

    test('should handle different fee structures', () => {
      const impact1 = PricingEngine.calculateFeeImpact(1_000_000, 30);
      const impact2 = PricingEngine.calculateFeeImpact(1_000_000, 50);

      expect(impact2).toBeGreaterThan(impact1);
    });
  });
});
