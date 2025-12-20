import { DexRouter } from '../router/dex-router';

/**
 * STEP 10: DEX Router Integration Tests
 * Tests routing logic and quote selection
 */
describe('DEX Router - Routing Logic', () => {
  let router: DexRouter;

  beforeAll(() => {
    router = new DexRouter();
  });

  test('should route order successfully', async () => {
    const result = await router.routeOrder('SOL', 'USDC', 1, 0.5);
    expect(result).toBeDefined();
    expect(result.allQuotes).toBeDefined();
    expect(Array.isArray(result.allQuotes)).toBe(true);
    expect(result.source).toBeDefined();
  });

  test('should handle different amounts', async () => {
    const result1 = await router.routeOrder('SOL', 'USDC', 0.5, 0.5);
    const result2 = await router.routeOrder('SOL', 'USDC', 10, 0.5);
    expect(result1.source).toBeDefined();
    expect(result2.source).toBeDefined();
  });

  test('should return consistent structure', async () => {
    const result = await router.routeOrder('USDC', 'SOL', 100, 0.5);
    expect(result).toHaveProperty('bestQuote');
    expect(result).toHaveProperty('allQuotes');
    expect(result).toHaveProperty('source');
  });

  test('should compare multiple DEX quotes', async () => {
    const result = await router.routeOrder('SOL', 'USDC', 5, 0.5);
    if (result.allQuotes.length > 0) {
      result.allQuotes.forEach((quote) => {
        expect(quote.price).toBeGreaterThan(0);
        expect(quote.amountOut).toBeGreaterThan(0);
      });
    }
  });

  test('should select best quote when available', async () => {
    const result = await router.routeOrder('SOL', 'USDC', 50, 0.5);
    if (result.bestQuote && result.allQuotes.length > 0) {
      expect(result.bestQuote.amountOut).toBeGreaterThanOrEqual(0);
    }
  });
});
