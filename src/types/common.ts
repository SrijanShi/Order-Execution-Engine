export enum OrderStatus {
  PENDING = 'pending',      // Order received and queued
  ROUTING = 'routing',      // Comparing DEX prices
  BUILDING = 'building',    // Creating transaction
  SUBMITTED = 'submitted',  // Transaction sent to network
  CONFIRMED = 'confirmed',  // Transaction successful
  FAILED = 'failed',        // Execution failed
}

export enum DexType {
  RAYDIUM = 'raydium',
  METEORA = 'meteora',
}

export enum OrderType {
  MARKET = 'market',      // Immediate execution at current price
  LIMIT = 'limit',        // Execute when target price reached
  SNIPER = 'sniper',      // Execute on token launch/migration
}

export enum ResultStatus {
  SUCCESS = 'success',
  ERROR = 'error',
  PENDING = 'pending',
}

export enum ErrorCode {
  // Validation errors
  INVALID_TOKEN_ADDRESS = 'INVALID_TOKEN_ADDRESS',
  INVALID_AMOUNT = 'INVALID_AMOUNT',
  INVALID_SLIPPAGE = 'INVALID_SLIPPAGE',
  
  // DEX errors
  INSUFFICIENT_LIQUIDITY = 'INSUFFICIENT_LIQUIDITY',
  DEX_API_ERROR = 'DEX_API_ERROR',
  PRICE_FEED_ERROR = 'PRICE_FEED_ERROR',
  
  // Network errors
  NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',
  RPC_ERROR = 'RPC_ERROR',
  
  // Execution errors
  SLIPPAGE_EXCEEDED = 'SLIPPAGE_EXCEEDED',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  
  // Retry errors
  MAX_RETRIES_EXCEEDED = 'MAX_RETRIES_EXCEEDED',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export const CONFIG = {
  // Queue settings
  MAX_CONCURRENT_ORDERS: 10,
  ORDER_PROCESSING_TIMEOUT_MS: 30_000,
  
  // Retry settings
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_BASE_DELAY_MS: 1_000,     // 1 second
  RETRY_BACKOFF_MULTIPLIER: 2,    // exponential backoff
  
  // DEX settings
  DEFAULT_SLIPPAGE: 0.01,          // 1%
  MIN_SLIPPAGE: 0.001,             // 0.1%
  MAX_SLIPPAGE: 0.5,               // 50%
  
  // Mock DEX delays
  DEX_QUOTE_DELAY_MS: 200,         // Time to get quote
  DEX_EXECUTION_DELAY_MIN_MS: 2_000,  // 2-3 seconds
  DEX_EXECUTION_DELAY_MAX_MS: 3_000,
  DEX_CONFIRMATION_DELAY_MS: 1_000,   // 1 second
  
  // Cache settings
  ORDER_CACHE_TTL_MS: 60_000,      // 1 minute
  ACTIVE_ORDERS_CACHE_TTL_MS: 3_600_000, // 1 hour
  
  // Database settings
  DB_POOL_SIZE: 10,
  DB_QUERY_TIMEOUT_MS: 10_000,
  
  // WebSocket settings
  WS_HEARTBEAT_INTERVAL_MS: 30_000, // 30 seconds
  WS_CONNECTION_TIMEOUT_MS: 60_000,  // 1 minute
} as const;


export interface Metadata {
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  tags?: string[];
}

export interface ApiResponse<T> {
  success: boolean;
  status: ResultStatus;
  data?: T;
  error?: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
  timestamp: Date;
}

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export interface SortParams {
  field: string;
  direction: 'asc' | 'desc';
}