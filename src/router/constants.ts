/**
 * Router configuration constants
 */
export const ROUTER_CONFIG = {
  // DEX identifiers
  DEX_NAMES: {
    RAYDIUM: 'raydium',
    METEORA: 'meteora',
  },

  // Slippage settings (in percentage)
  SLIPPAGE: {
    LOW: 0.1,      // 0.1% - for stable pairs
    MEDIUM: 0.5,   // 0.5% - standard
    HIGH: 1.0,     // 1.0% - for volatile pairs
  },

  // Price impact thresholds
  PRICE_IMPACT: {
    ACCEPTABLE: 2.0,    // 2% - acceptable impact
    WARNING: 5.0,       // 5% - issue warning
    CRITICAL: 10.0,     // 10% - reject order
  },

  // Quote expiration (in milliseconds)
  QUOTE_TTL: {
    SHORT: 10_000,      // 10 seconds
    MEDIUM: 30_000,     // 30 seconds
    LONG: 60_000,       // 1 minute
  },

  // Retry configuration
  RETRY: {
    MAX_ATTEMPTS: 3,
    BACKOFF_MS: 500,
    MAX_BACKOFF_MS: 2000,
  },

  // Fee configuration (in basis points: 1 bp = 0.01%)
  FEES: {
    RAYDIUM_STANDARD: 25,    // 0.25%
    RAYDIUM_STABLE: 5,       // 0.05%
    METEORA_STANDARD: 30,    // 0.30%
    METEORA_STABLE: 10,      // 0.10%
  },
};

/**
 * Routing decision priorities
 */
export enum RoutingPriority {
  BEST_PRICE = 'best_price',      // Minimize output amount
  LOWEST_IMPACT = 'lowest_impact', // Minimize price impact
  FASTEST = 'fastest',             // Lowest slippage
  MOST_LIQUID = 'most_liquid',     // Highest liquidity
}

/**
 * Quote sources
 */
export enum QuoteSource {
  LIVE = 'live',
  CACHED = 'cached',
  FALLBACK = 'fallback',
}
