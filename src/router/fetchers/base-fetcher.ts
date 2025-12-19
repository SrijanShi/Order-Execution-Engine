import { DexQuote, DexType } from '../../types/dex';
import { logger } from '../../utils/logger';

/**
 * Abstract base class for DEX price fetchers
 * All DEX fetchers must implement this interface
 */
export abstract class BaseFetcher {
  protected dexName: string;
  protected dexType: DexType;

  constructor(dexName: string, dexType: DexType) {
    this.dexName = dexName;
    this.dexType = dexType;
  }

  /**
   * Get a price quote for a token swap
   * This is implemented by each DEX fetcher
   */
  abstract getQuote(
    tokenIn: string,
    tokenOut: string,
    amountIn: number,
    slippage: number
  ): Promise<DexQuote | null>;

  /**
   * Get quotes for multiple amounts
   * Useful for determining price impact
   */
  abstract getQuoteRange(
    tokenIn: string,
    tokenOut: string,
    amounts: number[],
    slippage: number
  ): Promise<DexQuote[]>;

  /**
   * Check if a trading pair is available on this DEX
   */
  abstract supportsPair(tokenIn: string, tokenOut: string): Promise<boolean>;

  /**
   * Get liquidity information for a pair
   */
  abstract getLiquidity(tokenIn: string, tokenOut: string): Promise<number>;

  /**
   * Validate quote parameters
   */
  protected validateParams(
    tokenIn: string,
    tokenOut: string,
    amountIn: number,
    slippage: number
  ): boolean {
    if (!tokenIn || !tokenOut) {
      logger.error('Invalid token parameters', { tokenIn, tokenOut });
      return false;
    }

    if (amountIn <= 0) {
      logger.error('Invalid amount', { amountIn });
      return false;
    }

    if (slippage < 0 || slippage > 100) {
      logger.error('Invalid slippage', { slippage });
      return false;
    }

    return true;
  }

  /**
   * Calculate price impact: (expectedOut - actualOut) / expectedOut * 100
   */
  protected calculatePriceImpact(
    expectedAmountOut: number,
    actualAmountOut: number
  ): number {
    if (expectedAmountOut === 0) return 0;
    return ((expectedAmountOut - actualAmountOut) / expectedAmountOut) * 100;
  }

  /**
   * Apply slippage to output amount: actualOut * (1 - slippage/100)
   */
  protected applySlippage(amountOut: number, slippage: number): number {
    return amountOut * (1 - slippage / 100);
  }

  /**
   * Get current timestamp
   */
  protected getCurrentTime(): Date {
    return new Date();
  }

  /**
   * Get quote expiration time
   */
  protected getExpirationTime(ttlMs: number): Date {
    return new Date(Date.now() + ttlMs);
  }

  /**
   * Log fetcher activity
   */
  protected logActivity(message: string, data?: any): void {
    logger.debug(`[${this.dexName}] ${message}`, data);
  }

  /**
   * Log fetcher error
   */
  protected logError(message: string, error?: any): void {
    logger.error(`[${this.dexName}] ${message}`, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
