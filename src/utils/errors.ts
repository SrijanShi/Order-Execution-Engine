import { ErrorCode } from '../types/common';

/**
 * Base custom error class
 */
export class DexOrderError extends Error {
  code: ErrorCode;
  retryable: boolean;
  timestamp: Date;
  context?: Record<string, any>;

  constructor(
    message: string,
    code: ErrorCode,
    retryable: boolean = false,
    context?: Record<string, any>,
  ) {
    super(message);
    this.code = code;
    this.retryable = retryable;
    this.timestamp = new Date();
    this.context = context;
    Object.setPrototypeOf(this, DexOrderError.prototype);
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      retryable: this.retryable,
      timestamp: this.timestamp,
      context: this.context,
    };
  }
}

/**
 * DEX API error - e.g., timeout, rate limit, API down
 */
export class DexApiError extends DexOrderError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, ErrorCode.DEX_API_ERROR, true, context);
    Object.setPrototypeOf(this, DexApiError.prototype);
  }
}

/**
 * Insufficient liquidity error - no good price available
 */
export class InsufficientLiquidityError extends DexOrderError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, ErrorCode.INSUFFICIENT_LIQUIDITY, true, context);
    Object.setPrototypeOf(this, InsufficientLiquidityError.prototype);
  }
}

/**
 * Network error - connection issues, timeouts
 */
export class NetworkError extends DexOrderError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, ErrorCode.NETWORK_TIMEOUT, true, context);
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

/**
 * Invalid token address error
 */
export class InvalidTokenError extends DexOrderError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, ErrorCode.INVALID_TOKEN_ADDRESS, false, context);
    Object.setPrototypeOf(this, InvalidTokenError.prototype);
  }
}

/**
 * Slippage exceeded error - price moved too much
 */
export class SlippageError extends DexOrderError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, ErrorCode.SLIPPAGE_EXCEEDED, true, context);
    Object.setPrototypeOf(this, SlippageError.prototype);
  }
}

/**
 * Invalid slippage parameter error
 */
export class InvalidSlippageError extends DexOrderError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, ErrorCode.INVALID_SLIPPAGE, false, context);
    Object.setPrototypeOf(this, InvalidSlippageError.prototype);
  }
}

/**
 * Invalid amount error
 */
export class InvalidAmountError extends DexOrderError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, ErrorCode.INVALID_AMOUNT, false, context);
    Object.setPrototypeOf(this, InvalidAmountError.prototype);
  }
}

/**
 * RPC error - blockchain node communication failure
 */
export class RpcError extends DexOrderError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, ErrorCode.RPC_ERROR, true, context);
    Object.setPrototypeOf(this, RpcError.prototype);
  }
}

/**
 * Transaction failed error
 */
export class TransactionFailedError extends DexOrderError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, ErrorCode.TRANSACTION_FAILED, false, context);
    Object.setPrototypeOf(this, TransactionFailedError.prototype);
  }
}

/**
 * Insufficient funds error
 */
export class InsufficientFundsError extends DexOrderError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, ErrorCode.INSUFFICIENT_FUNDS, false, context);
    Object.setPrototypeOf(this, InsufficientFundsError.prototype);
  }
}

/**
 * Max retries exceeded
 */
export class MaxRetriesExceededError extends DexOrderError {
  attempts: number;
  lastError?: Error;

  constructor(attempts: number, lastError?: Error, context?: Record<string, any>) {
    super(
      `Max retries exceeded after ${attempts} attempts`,
      ErrorCode.MAX_RETRIES_EXCEEDED,
      false,
      context,
    );
    this.attempts = attempts;
    this.lastError = lastError;
    Object.setPrototypeOf(this, MaxRetriesExceededError.prototype);
  }
}

/**
 * Unknown error
 */
export class UnknownError extends DexOrderError {
  originalError?: Error;

  constructor(message: string, originalError?: Error, context?: Record<string, any>) {
    super(message, ErrorCode.UNKNOWN_ERROR, false, context);
    this.originalError = originalError;
    Object.setPrototypeOf(this, UnknownError.prototype);
  }
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: any): boolean {
  if (error instanceof DexOrderError) {
    return error.retryable;
  }
  return false;
}

/**
 * Get error code from error
 */
export function getErrorCode(error: any): ErrorCode {
  if (error instanceof DexOrderError) {
    return error.code;
  }
  return ErrorCode.UNKNOWN_ERROR;
}

/**
 * Create appropriate error from message and code
 */
export function createError(
  message: string,
  code: ErrorCode,
  context?: Record<string, any>,
): DexOrderError {
  switch (code) {
    case ErrorCode.DEX_API_ERROR:
      return new DexApiError(message, context);
    case ErrorCode.INSUFFICIENT_LIQUIDITY:
      return new InsufficientLiquidityError(message, context);
    case ErrorCode.NETWORK_TIMEOUT:
      return new NetworkError(message, context);
    case ErrorCode.INVALID_TOKEN_ADDRESS:
      return new InvalidTokenError(message, context);
    case ErrorCode.SLIPPAGE_EXCEEDED:
      return new SlippageError(message, context);
    case ErrorCode.INVALID_SLIPPAGE:
      return new InvalidSlippageError(message, context);
    case ErrorCode.INVALID_AMOUNT:
      return new InvalidAmountError(message, context);
    case ErrorCode.RPC_ERROR:
      return new RpcError(message, context);
    case ErrorCode.TRANSACTION_FAILED:
      return new TransactionFailedError(message, context);
    case ErrorCode.INSUFFICIENT_FUNDS:
      return new InsufficientFundsError(message, context);
    default:
      return new UnknownError(message, undefined, context);
  }
}
