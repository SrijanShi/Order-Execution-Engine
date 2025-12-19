import { DexType } from './common';

export { DexType };

export interface DexQuote {
  dex: DexType;
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  amountOut: number;
  price: number;
  priceImpact: number;
  feeBps: number;
  fee: number;
  liquidity: number;
  quoteTime: Date;
  expiresAt: Date;
}

export interface DexRouterInput {
  tokenIn: string;
  tokenOut: string;
  amount: number;
}

export interface DexRouterResponse {
  bestQuote: DexQuote;
  allQuotes: DexQuote[];
  comparison: DexComparison;
  routing: RoutingDecision;
}

export interface DexComparison {
  raydium: DexQuote | null;
  meteora: DexQuote | null;
  priceDifference: number;
  winner: DexType;
  reason: string;
  comparedAt: Date;
}

export interface RoutingDecision {
  selectedDex: DexType;
  expectedPrice: number;
  expectedFee: number;
  expectedOutput: number;
  reason: string;
  confidence: number;
  alternatives: Array<{
    dex: DexType;
    price: number;
    reason: string;
  }>;
  decisionTime: Date;
}

export interface TransactionBuildInput {
  dex: DexType;
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  amountOut: number;
  slippage: number;
}

export interface Transaction {
  signature: string;
  dex: DexType;
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  amountOut: number;
  executedPrice: number;
  fee: number;
  timestamp: Date;
}

export interface SwapResult {
  success: boolean;
  txHash?: string;
  executedPrice?: number;
  amountOut?: number;
  fee?: number;
  error?: {
    code: string;
    message: string;
  };
  timestamp: Date;
}

export interface RaydiumQuote extends DexQuote {
  poolAddress: string;
  poolId: string;
}

export interface MeteorQuote extends DexQuote {
  poolAddress: string;
  lpMint: string;
}

export interface PriceFeed {
  tokenMint: string;
  price: number;
  timestamp: Date;
  source: DexType;
  confidence: number;
}

export interface PriceHistory {
  tokenMint: string;
  prices: Array<{
    price: number;
    timestamp: Date;
    dex: DexType;
  }>;
  averagePrice: number;
  highPrice: number;
  lowPrice: number;
}
