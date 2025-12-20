import { logger } from '../utils/logger';
import {
  DexOrderError,
  DexApiError,
  InsufficientLiquidityError,
  NetworkError,
  InvalidTokenError,
  SlippageError,
  InvalidSlippageError,
  InvalidAmountError,
  RpcError,
  TransactionFailedError,
  InsufficientFundsError,
  MaxRetriesExceededError,
  UnknownError,
  isRetryableError,
  getErrorCode,
} from '../utils/errors';
import { ErrorCode } from '../types/common';

/**
 * Error context for logging and debugging
 */
export interface ErrorContext {
  orderId?: string;
  operation?: string;
  attempt?: number;
  maxAttempts?: number;
  metadata?: Record<string, any>;
}

/**
 * Error handling result
 */
export interface ErrorHandlingResult {
  handled: boolean;
  shouldRetry: boolean;
  error: Error;
  code: ErrorCode;
  message: string;
  context: ErrorContext;
  timestamp: Date;
}

/**
 * Centralized error handler for execution engine
 */
export class ExecutionErrorHandler {
  private errorLog: ErrorHandlingResult[] = [];

  /**
   * Handle an error with context
   */
  handleError(
    error: any,
    context: ErrorContext = {},
  ): ErrorHandlingResult {
    const code = getErrorCode(error);
    const shouldRetry = isRetryableError(error);
    const message = error?.message || 'Unknown error';
    const timestamp = new Date();

    const result: ErrorHandlingResult = {
      handled: true,
      shouldRetry,
      error,
      code,
      message,
      context,
      timestamp,
    };

    // Log the error with context
    this.logError(result);

    // Store in error log for post-mortem analysis
    this.errorLog.push(result);

    return result;
  }

  /**
   * Log error appropriately based on type
   */
  private logError(result: ErrorHandlingResult): void {
    const prefix = `[${result.context.operation || 'execution'}]`;
    const location = result.context.orderId ? ` Order ${result.context.orderId}` : '';
    const attempt =
      result.context.attempt && result.context.maxAttempts
        ? ` Attempt ${result.context.attempt}/${result.context.maxAttempts}`
        : '';

    const logEntry = `${prefix}${location}${attempt} ${result.message}`;

    if (result.shouldRetry) {
      logger.warn(logEntry, {
        code: result.code,
        retryable: true,
        ...result.context.metadata,
      });
    } else {
      logger.error(logEntry, {
        code: result.code,
        retryable: false,
        ...result.context.metadata,
      });
    }
  }

  /**
   * Handle specific error types with specialized messages
   */
  handleDexApiError(
    error: Error,
    orderId: string,
    operation: string = 'DEX API call',
  ): ErrorHandlingResult {
    return this.handleError(
      new DexApiError(`${operation} failed: ${error.message}`, {
        originalError: error.message,
      }),
      {
        orderId,
        operation,
      },
    );
  }

  /**
   * Handle insufficient liquidity
   */
  handleInsufficientLiquidity(
    orderId: string,
    dexName: string,
    amountRequested: number,
  ): ErrorHandlingResult {
    return this.handleError(
      new InsufficientLiquidityError(
        `Insufficient liquidity on ${dexName} for amount ${amountRequested}`,
        {
          dexName,
          amountRequested,
        },
      ),
      {
        orderId,
        operation: 'liquidity check',
      },
    );
  }

  /**
   * Handle network errors
   */
  handleNetworkError(
    error: Error,
    orderId: string,
    operation: string = 'network operation',
  ): ErrorHandlingResult {
    return this.handleError(
      new NetworkError(`${operation} failed: ${error.message}`, {
        originalError: error.message,
      }),
      {
        orderId,
        operation,
      },
    );
  }

  /**
   * Handle invalid token
   */
  handleInvalidToken(
    orderId: string,
    token: string,
    reason: string,
  ): ErrorHandlingResult {
    return this.handleError(
      new InvalidTokenError(`Invalid token ${token}: ${reason}`, {
        token,
        reason,
      }),
      {
        orderId,
        operation: 'token validation',
      },
    );
  }

  /**
   * Handle slippage exceeded
   */
  handleSlippageExceeded(
    orderId: string,
    expectedPrice: number,
    actualPrice: number,
    slippageTolerance: number,
  ): ErrorHandlingResult {
    const slippagePercent = Math.abs((actualPrice - expectedPrice) / expectedPrice) * 100;

    return this.handleError(
      new SlippageError(
        `Slippage ${slippagePercent.toFixed(2)}% exceeds tolerance ${(slippageTolerance * 100).toFixed(2)}%`,
        {
          expectedPrice,
          actualPrice,
          slippagePercent,
          slippageTolerance,
        },
      ),
      {
        orderId,
        operation: 'slippage validation',
      },
    );
  }

  /**
   * Handle invalid amount
   */
  handleInvalidAmount(
    orderId: string,
    amount: number,
    reason: string,
  ): ErrorHandlingResult {
    return this.handleError(
      new InvalidAmountError(`Invalid amount ${amount}: ${reason}`, {
        amount,
        reason,
      }),
      {
        orderId,
        operation: 'amount validation',
      },
    );
  }

  /**
   * Handle RPC error
   */
  handleRpcError(
    error: Error,
    orderId: string,
    endpoint?: string,
  ): ErrorHandlingResult {
    return this.handleError(
      new RpcError(`RPC call failed: ${error.message}`, {
        originalError: error.message,
        endpoint,
      }),
      {
        orderId,
        operation: 'RPC call',
      },
    );
  }

  /**
   * Handle transaction failed
   */
  handleTransactionFailed(
    orderId: string,
    txHash: string,
    reason: string,
  ): ErrorHandlingResult {
    return this.handleError(
      new TransactionFailedError(`Transaction ${txHash} failed: ${reason}`, {
        txHash,
        reason,
      }),
      {
        orderId,
        operation: 'transaction',
      },
    );
  }

  /**
   * Handle insufficient funds
   */
  handleInsufficientFunds(
    orderId: string,
    available: number,
    required: number,
  ): ErrorHandlingResult {
    return this.handleError(
      new InsufficientFundsError(
        `Insufficient funds: have ${available}, need ${required}`,
        {
          available,
          required,
          shortfall: required - available,
        },
      ),
      {
        orderId,
        operation: 'balance check',
      },
    );
  }

  /**
   * Handle max retries exceeded
   */
  handleMaxRetriesExceeded(
    orderId: string,
    attempts: number,
    lastError?: Error,
  ): ErrorHandlingResult {
    return this.handleError(
      new MaxRetriesExceededError(attempts, lastError, {
        lastErrorMessage: lastError?.message,
      }),
      {
        orderId,
        operation: 'retry exhausted',
        attempt: attempts,
        maxAttempts: attempts,
      },
    );
  }

  /**
   * Handle unknown error
   */
  handleUnknownError(
    error: any,
    orderId: string,
    operation: string = 'unknown operation',
  ): ErrorHandlingResult {
    return this.handleError(
      new UnknownError(
        `Unexpected error during ${operation}: ${error?.message || error}`,
        error instanceof Error ? error : undefined,
        {
          originalError: String(error),
        },
      ),
      {
        orderId,
        operation,
      },
    );
  }

  /**
   * Get all logged errors
   */
  getErrorLog(): ErrorHandlingResult[] {
    return [...this.errorLog];
  }

  /**
   * Get errors for specific order
   */
  getErrorsByOrder(orderId: string): ErrorHandlingResult[] {
    return this.errorLog.filter((e) => e.context.orderId === orderId);
  }

  /**
   * Get errors by code
   */
  getErrorsByCode(code: ErrorCode): ErrorHandlingResult[] {
    return this.errorLog.filter((e) => e.code === code);
  }

  /**
   * Get retryable errors
   */
  getRetryableErrors(): ErrorHandlingResult[] {
    return this.errorLog.filter((e) => e.shouldRetry);
  }

  /**
   * Get non-retryable errors
   */
  getNonRetryableErrors(): ErrorHandlingResult[] {
    return this.errorLog.filter((e) => !e.shouldRetry);
  }

  /**
   * Get error statistics
   */
  getErrorStats() {
    const totalErrors = this.errorLog.length;
    const retryableErrors = this.errorLog.filter((e) => e.shouldRetry).length;
    const nonRetryableErrors = totalErrors - retryableErrors;

    const errorsByCode: Record<string, number> = {};
    const errorsByOperation: Record<string, number> = {};

    for (const error of this.errorLog) {
      errorsByCode[error.code] = (errorsByCode[error.code] || 0) + 1;
      const op = error.context.operation || 'unknown';
      errorsByOperation[op] = (errorsByOperation[op] || 0) + 1;
    }

    return {
      totalErrors,
      retryableErrors,
      nonRetryableErrors,
      retryableRate: totalErrors > 0 ? (retryableErrors / totalErrors * 100).toFixed(2) + '%' : 'N/A',
      errorsByCode,
      errorsByOperation,
    };
  }

  /**
   * Clear error log
   */
  reset(): void {
    this.errorLog = [];
    logger.info('Error handler reset');
  }
}

/**
 * Global error handler instance
 */
export const globalErrorHandler = new ExecutionErrorHandler();
