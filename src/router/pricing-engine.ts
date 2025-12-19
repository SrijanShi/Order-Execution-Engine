import { DexQuote, DexType } from '../types/dex';
import { logger } from '../utils/logger';
import { ROUTER_CONFIG } from './constants';

/**
 * Pricing Engine
 * Calculates pricing metrics and validates quotes
 */
export class PricingEngine {
  /**
   * Calculate execution price (amountOut / amountIn)
   */
  static calculateExecutionPrice(quote: DexQuote): number {
    if (quote.amountIn === 0) return 0;
    return quote.amountOut / quote.amountIn;
  }

  /**
   * Calculate minimum output after slippage
   */
  static calculateMinimumOutput(
    expectedOutput: number,
    slippage: number
  ): number {
    return expectedOutput * (1 - slippage / 100);
  }

  /**
   * Validate price impact
   */
  static validatePriceImpact(priceImpact: number): {
    isValid: boolean;
    level: 'low' | 'medium' | 'high' | 'critical';
  } {
    if (priceImpact < ROUTER_CONFIG.PRICE_IMPACT.ACCEPTABLE) {
      return { isValid: true, level: 'low' };
    } else if (priceImpact < ROUTER_CONFIG.PRICE_IMPACT.WARNING) {
      return { isValid: true, level: 'medium' };
    } else if (priceImpact < ROUTER_CONFIG.PRICE_IMPACT.CRITICAL) {
      return { isValid: true, level: 'high' };
    } else {
      return { isValid: false, level: 'critical' };
    }
  }

  /**
   * Calculate total fee impact
   */
  static calculateFeeImpact(amountOut: number, feeBps: number): number {
    return (feeBps / 10000) * 100; // Convert basis points to percentage
  }

  /**
   * Compare two quotes and return the better one
   */
  static selectBestQuote(quotes: DexQuote[]): DexQuote | null {
    if (quotes.length === 0) return null;

    return quotes.reduce((best, current) => {
      // Prefer higher output amount
      if (current.amountOut > best.amountOut) {
        return current;
      }
      return best;
    });
  }

  /**
   * Compare two quotes by price impact
   */
  static selectLowestImpact(quotes: DexQuote[]): DexQuote | null {
    if (quotes.length === 0) return null;

    return quotes.reduce((best, current) => {
      if (current.priceImpact < best.priceImpact) {
        return current;
      }
      return best;
    });
  }

  /**
   * Calculate weighted score for quote ranking
   */
  static calculateQuoteScore(
    quote: DexQuote,
    weights: {
      price: number;
      impact: number;
      liquidity: number;
    }
  ): number {
    const priceScore = quote.amountOut * weights.price;
    const impactScore = (100 - quote.priceImpact) * weights.impact;
    const liquidityScore = Math.min(quote.liquidity / 1_000_000, 1) * 100 * weights.liquidity;

    return priceScore + impactScore + liquidityScore;
  }

  /**
   * Rank multiple quotes
   */
  static rankQuotes(
    quotes: DexQuote[],
    weights?: {
      price: number;
      impact: number;
      liquidity: number;
    }
  ): DexQuote[] {
    const defaultWeights = weights || {
      price: 0.5,
      impact: 0.3,
      liquidity: 0.2,
    };

    return quotes.sort((a, b) => {
      const scoreA = this.calculateQuoteScore(a, defaultWeights);
      const scoreB = this.calculateQuoteScore(b, defaultWeights);
      return scoreB - scoreA; // Higher score first
    });
  }

  /**
   * Validate quote is fresh (not expired)
   */
  static isQuoteFresh(quote: DexQuote): boolean {
    return new Date() < quote.expiresAt;
  }

  /**
   * Get quote quality assessment
   */
  static assessQuoteQuality(
    quote: DexQuote
  ): {
    quality: 'excellent' | 'good' | 'acceptable' | 'poor';
    score: number;
  } {
    let score = 0;

    // Price impact scoring (lower is better)
    if (quote.priceImpact < 0.5) score += 40;
    else if (quote.priceImpact < 1.0) score += 30;
    else if (quote.priceImpact < 2.0) score += 20;
    else score += 10;

    // Liquidity scoring
    if (quote.liquidity > 5_000_000) score += 30;
    else if (quote.liquidity > 1_000_000) score += 25;
    else if (quote.liquidity > 500_000) score += 20;
    else score += 10;

    // Fee scoring
    if (quote.feeBps <= 25) score += 30;
    else if (quote.feeBps <= 50) score += 20;
    else score += 10;

    let quality: 'excellent' | 'good' | 'acceptable' | 'poor';
    if (score >= 90) quality = 'excellent';
    else if (score >= 70) quality = 'good';
    else if (score >= 50) quality = 'acceptable';
    else quality = 'poor';

    return { quality, score };
  }
}
