import { Order } from '../types/order';
import { OrderStatus } from '../types/common';
import { DexQuote, DexRouterResponse } from '../types/dex';

/**
 * Execution state machine states
 * Tracks order progression through execution pipeline
 */
export enum ExecutionState {
  PENDING = 'PENDING',           // Order queued, awaiting routing
  ROUTING = 'ROUTING',           // Querying DEX routers for best price
  BUILDING = 'BUILDING',         // Creating transaction
  SUBMITTED = 'SUBMITTED',       // Sent to blockchain network
  CONFIRMED = 'CONFIRMED',       // Confirmed on-chain with txHash
  FAILED = 'FAILED',             // Execution failed
}

/**
 * Transaction data structure
 */
export interface Transaction {
  hash?: string;                 // Transaction hash (after submission)
  from: string;                  // Sender address
  to: string;                    // Contract/DEX address
  data: string;                  // Encoded transaction data
  value: string;                 // ETH value if applicable
  gasLimit: string;              // Gas limit
  gasPrice: string;              // Gas price
  nonce: number;                 // Transaction nonce
}

/**
 * Execution context - contains all data for an execution
 */
export interface ExecutionContext {
  orderId: string;
  order: Order;
  state: ExecutionState;
  routeResult?: DexRouterResponse;     // Best route from DEX router
  quote?: DexQuote;                    // Selected quote
  transaction?: Transaction;           // Built transaction
  txHash?: string;                     // Confirmed transaction hash
  error?: string;                      // Error message if failed
  startTime: Date;
  lastStateChange: Date;
  totalTime: number;                   // Total execution time in ms
}

/**
 * Execution result - outcome of an execution step
 */
export interface ExecutionResult {
  success: boolean;
  newState: ExecutionState;
  data?: any;                    // Step-specific data (quote, tx, hash, etc.)
  error?: string;                // Error message if step failed
  timestamp: Date;
}

/**
 * State transition event
 */
export interface StateTransition {
  fromState: ExecutionState;
  toState: ExecutionState;
  timestamp: Date;
  reason: string;                // Why the state changed
  duration: number;              // Time spent in previous state (ms)
}

/**
 * Execution statistics
 */
export interface ExecutionStats {
  totalExecuted: number;
  totalSuccessful: number;
  totalFailed: number;
  averageExecutionTime: number;  // in ms
  pendingCount: number;
  routingCount: number;
  buildingCount: number;
  submittedCount: number;
  failureRate: number;           // percentage
  stateDistribution: {
    [key in ExecutionState]: number;
  };
}

/**
 * Execution configuration
 */
export interface ExecutionConfig {
  maxRetries: number;
  routingTimeout: number;        // ms
  buildingTimeout: number;       // ms
  submissionTimeout: number;     // ms
  confirmationTimeout: number;   // ms
  gasMultiplier: number;         // Multiplier for gas calculations
  slippageTolerance: number;     // Default slippage in bps (basis points)
}

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Quote selection criteria
 */
export interface QuoteSelection {
  quote: DexQuote;
  dexName: string;
  score: number;                 // Selection score (price-based)
  priceImpact: number;           // Estimated price impact
}

/**
 * Execution event
 */
export interface ExecutionEvent {
  type: 'state_change' | 'validation' | 'routing' | 'building' | 'submission' | 'confirmation' | 'error';
  executionId: string;
  orderId: string;
  state: ExecutionState;
  data?: any;
  timestamp: Date;
  error?: string;
}

/**
 * Default execution config preset
 */
export const DEFAULT_EXECUTION_CONFIG: ExecutionConfig = {
  maxRetries: 3,
  routingTimeout: 2000,
  buildingTimeout: 3000,
  submissionTimeout: 5000,
  confirmationTimeout: 60000,
  gasMultiplier: 1.2,
  slippageTolerance: 50,         // 0.5% default slippage
};

/**
 * Aggressive execution config (faster but riskier)
 */
export const AGGRESSIVE_EXECUTION_CONFIG: ExecutionConfig = {
  maxRetries: 1,
  routingTimeout: 1000,
  buildingTimeout: 1500,
  submissionTimeout: 2000,
  confirmationTimeout: 30000,
  gasMultiplier: 1.5,
  slippageTolerance: 100,        // 1% slippage
};

/**
 * Conservative execution config (slower but safer)
 */
export const CONSERVATIVE_EXECUTION_CONFIG: ExecutionConfig = {
  maxRetries: 5,
  routingTimeout: 5000,
  buildingTimeout: 5000,
  submissionTimeout: 10000,
  confirmationTimeout: 120000,
  gasMultiplier: 1.1,
  slippageTolerance: 25,         // 0.25% slippage
};
