import { RaydiumFetcher } from './fetchers/raydium-fetcher';
import { MeteaFetcher } from './fetchers/meteora-fetcher';
import { BaseFetcher } from './fetchers/base-fetcher';
import { DexQuote, DexType } from '../types/dex';
import { PricingEngine } from './pricing-engine';
import { logger } from '../utils/logger';
import { ROUTER_CONFIG, RoutingPriority, QuoteSource } from './constants';

/**
 * DEX Router
 * Orchestrates fetching quotes from multiple DEXs and selects the best route
 */
export class DexRouter {
  private fetchers: Map<DexType, BaseFetcher> = new Map();

  constructor() {
    this.initializeFetchers();
  }

  /**
   * Initialize all DEX fetchers
   */
  private initializeFetchers(): void {
    this.fetchers.set(DexType.RAYDIUM, new RaydiumFetcher());
    this.fetchers.set(DexType.METEORA, new MeteaFetcher());

    logger.info('DEX Router initialized with fetchers', {
      fetchers: Array.from(this.fetchers.keys()),
    });
  }

  /**
   * Get quote from a specific DEX
   */
  async getQuoteFromDex(
    dex: DexType,
    tokenIn: string,
    tokenOut: string,
    amountIn: number,
    slippage: number
  ): Promise<DexQuote | null> {
    try {
      const fetcher = this.fetchers.get(dex);
      if (!fetcher) {
        logger.error('DEX fetcher not found', { dex });
        return null;
      }

      return await fetcher.getQuote(tokenIn, tokenOut, amountIn, slippage);
    } catch (error) {
      logger.error('Error fetching quote from DEX', {
        dex,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Get quotes from all DEXs in parallel
   */
  async getQuotesFromAllDexs(
    tokenIn: string,
    tokenOut: string,
    amountIn: number,
    slippage: number
  ): Promise<DexQuote[]> {
    try {
      const quotePromises: Promise<DexQuote | null>[] = [];

      // Fetch from all DEXs in parallel
      for (const [, fetcher] of this.fetchers) {
        quotePromises.push(
          fetcher.getQuote(tokenIn, tokenOut, amountIn, slippage)
        );
      }

      const quotes = await Promise.all(quotePromises);
      const validQuotes = quotes.filter((q) => q !== null) as DexQuote[];

      logger.debug('Quotes fetched from all DEXs', {
        totalFetchers: this.fetchers.size,
        validQuotes: validQuotes.length,
      });

      return validQuotes;
    } catch (error) {
      logger.error('Error fetching quotes from all DEXs', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Route order to best DEX based on priority
   */
  async routeOrder(
    tokenIn: string,
    tokenOut: string,
    amountIn: number,
    slippage: number,
    priority: RoutingPriority = RoutingPriority.BEST_PRICE
  ): Promise<{
    bestQuote: DexQuote | null;
    allQuotes: DexQuote[];
    source: QuoteSource;
  }> {
    try {
      logger.info('Routing order', {
        tokenIn: tokenIn.substring(0, 8),
        tokenOut: tokenOut.substring(0, 8),
        amountIn,
        priority,
      });

      // Get quotes from all DEXs
      const quotes = await this.getQuotesFromAllDexs(
        tokenIn,
        tokenOut,
        amountIn,
        slippage
      );

      if (quotes.length === 0) {
        logger.warn('No quotes available from any DEX');
        return { bestQuote: null, allQuotes: [], source: QuoteSource.FALLBACK };
      }

      // Select best quote based on priority
      const bestQuote = this.selectQuoteByPriority(quotes, priority);

      if (!bestQuote) {
        return { bestQuote: null, allQuotes: quotes, source: QuoteSource.FALLBACK };
      }

      // Validate price impact
      const validation = PricingEngine.validatePriceImpact(bestQuote.priceImpact);
      if (!validation.isValid) {
        logger.warn('Price impact too high', {
          priceImpact: bestQuote.priceImpact,
          level: validation.level,
        });
      }

      logger.info('✅ Best route selected', {
        dex: bestQuote.dex,
        price: bestQuote.price,
        priceImpact: bestQuote.priceImpact,
      });

      return {
        bestQuote,
        allQuotes: quotes,
        source: QuoteSource.LIVE,
      };
    } catch (error) {
      logger.error('Error routing order', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { bestQuote: null, allQuotes: [], source: QuoteSource.FALLBACK };
    }
  }

  /**
   * Select quote based on routing priority
   */
  private selectQuoteByPriority(
    quotes: DexQuote[],
    priority: RoutingPriority
  ): DexQuote | null {
    switch (priority) {
      case RoutingPriority.BEST_PRICE:
        return PricingEngine.selectBestQuote(quotes);

      case RoutingPriority.LOWEST_IMPACT:
        return PricingEngine.selectLowestImpact(quotes);

      case RoutingPriority.FASTEST:
        // For fastest, prefer lower slippage (handled by input)
        return PricingEngine.selectBestQuote(quotes);

      case RoutingPriority.MOST_LIQUID:
        return quotes.reduce((prev, current) =>
          current.liquidity > prev.liquidity ? current : prev
        );

      default:
        return PricingEngine.selectBestQuote(quotes);
    }
  }

  /**
   * Get routing statistics
   */
  async getRoutingStats(): Promise<{
    activeFetchers: number;
  }> {
    return {
      activeFetchers: this.fetchers.size,
    };
  }

  /**
   * Get a specific fetcher (for testing)
   */
  getFetcher(dex: DexType): BaseFetcher | undefined {
    return this.fetchers.get(dex);
  }
}

export const dexRouter = new DexRouter();
