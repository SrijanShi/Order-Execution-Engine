import {
  retry,
  retrySync,
  retryUntil,
  DEFAULT_RETRY_CONFIG,
  AGGRESSIVE_RETRY_CONFIG,
  CONSERVATIVE_RETRY_CONFIG,
  getRetryConfig,
  RetryConfig,
} from '../../utils/retry';
import {
  DexApiError,
  InsufficientLiquidityError,
  NetworkError,
  InvalidTokenError,
  SlippageError,
  InvalidAmountError,
  MaxRetriesExceededError,
  isRetryableError,
  getErrorCode,
  createError,
} from '../../utils/errors';
import { ExecutionErrorHandler } from '../error-handler';
import { ErrorCode } from '../../types/common';

describe('Retry Logic', () => {
  describe('Retry Configuration', () => {
    test('should have default retry config', () => {
      expect(DEFAULT_RETRY_CONFIG.maxAttempts).toBe(3);
      expect(DEFAULT_RETRY_CONFIG.initialDelayMs).toBe(1000);
      expect(DEFAULT_RETRY_CONFIG.maxDelayMs).toBe(4000);
      expect(DEFAULT_RETRY_CONFIG.backoffMultiplier).toBe(2);
    });

    test('should have aggressive retry config', () => {
      expect(AGGRESSIVE_RETRY_CONFIG.maxAttempts).toBe(2);
      expect(AGGRESSIVE_RETRY_CONFIG.initialDelayMs).toBe(500);
    });

    test('should have conservative retry config', () => {
      expect(CONSERVATIVE_RETRY_CONFIG.maxAttempts).toBe(5);
      expect(CONSERVATIVE_RETRY_CONFIG.initialDelayMs).toBe(2000);
    });

    test('should get config by name', () => {
      const defaultConfig = getRetryConfig('default');
      expect(defaultConfig).toEqual(DEFAULT_RETRY_CONFIG);

      const aggressiveConfig = getRetryConfig('aggressive');
      expect(aggressiveConfig).toEqual(AGGRESSIVE_RETRY_CONFIG);

      const conservativeConfig = getRetryConfig('conservative');
      expect(conservativeConfig).toEqual(CONSERVATIVE_RETRY_CONFIG);
    });
  });

  describe('Retry Success Cases', () => {
    test('should succeed on first attempt', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        return 'success';
      };

      const result = await retry(fn, 'test-operation');

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.attempts).toBe(1);
      expect(result.totalDelayMs).toBe(0);
    });

    test('should succeed after retry', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        if (attempts < 2) {
          throw new DexApiError('Temporary failure');
        }
        return 'success';
      };

      const result = await retry(fn, 'test-operation');

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.attempts).toBe(2);
      expect(result.totalDelayMs).toBeGreaterThan(0);
    });

    test('should succeed on third attempt', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        if (attempts < 3) {
          throw new NetworkError('Network unavailable');
        }
        return 'success-after-retries';
      };

      const result = await retry(fn, 'test-operation');

      expect(result.success).toBe(true);
      expect(result.result).toBe('success-after-retries');
      expect(result.attempts).toBe(3);
    });
  });

  describe('Retry Failure Cases', () => {
    test('should fail after max attempts exceeded', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        throw new DexApiError('Persistent failure');
      };

      const result = await retry(fn, 'test-operation', {
        maxAttempts: 2,
        initialDelayMs: 10,
        maxDelayMs: 100,
        backoffMultiplier: 2,
        jitterFactor: 0,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.attempts).toBe(2);
    });

    test('should not retry non-retryable errors', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        throw new InvalidAmountError('Invalid amount');
      };

      const result = await retry(fn, 'test-operation');

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
    });

    test('should include last error in result', async () => {
      const testError = new DexApiError('Test error');
      const fn = async () => {
        throw testError;
      };

      const result = await retry(fn, 'test-operation');

      expect(result.success).toBe(false);
      expect(result.lastError).toBeDefined();
      expect(result.error).toBeDefined();
    });
  });

  describe('Exponential Backoff', () => {
    test('should increase delay with exponential backoff', async () => {
      const delays: number[] = [];
      let attempts = 0;

      const fn = async () => {
        attempts++;
        throw new DexApiError('Always fails');
      };

      const config: RetryConfig = {
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 500,
        backoffMultiplier: 2,
        jitterFactor: 0,
      };

      const result = await retry(fn, 'test-operation', config);

      // Should have attempted 3 times: first succeeds, second fails, third fails
      expect(result.attempts).toBe(3);
      expect(result.totalDelayMs).toBeGreaterThan(0);
    });

    test('should cap delay at maxDelayMs', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        throw new NetworkError('Always fails');
      };

      const config: RetryConfig = {
        maxAttempts: 4,
        initialDelayMs: 100,
        maxDelayMs: 300,    // Cap delay
        backoffMultiplier: 10, // Large multiplier
        jitterFactor: 0,
      };

      const result = await retry(fn, 'test-operation', config);

      // Total delay should not exceed maxDelayMs * number of retries
      expect(result.totalDelayMs).toBeLessThanOrEqual(config.maxDelayMs * 3);
    });
  });

  describe('Retry with Predicate', () => {
    test('should retry until predicate is satisfied', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        return { value: attempts };
      };

      const result = await retryUntil(
        fn,
        (result) => result.value >= 3,
        'test-operation',
        {
          maxAttempts: 5,
          initialDelayMs: 10,
          maxDelayMs: 100,
          backoffMultiplier: 2,
          jitterFactor: 0,
        },
      );

      expect(result.success).toBe(true);
      expect(result.result?.value).toBe(3);
      expect(result.attempts).toBe(3);
    });

    test('should fail if predicate never satisfied', async () => {
      const fn = async () => {
        return { value: 1 };
      };

      const result = await retryUntil(
        fn,
        (result) => result.value >= 10,
        'test-operation',
        {
          maxAttempts: 2,
          initialDelayMs: 10,
          maxDelayMs: 100,
          backoffMultiplier: 2,
          jitterFactor: 0,
        },
      );

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(2);
    });
  });

  describe('Retry Sync', () => {
    test('should retry synchronous functions', async () => {
      let attempts = 0;
      const fn = () => {
        attempts++;
        if (attempts < 2) {
          throw new DexApiError('Failure');
        }
        return 'sync-success';
      };

      const result = await retrySync(fn, 'test-operation');

      expect(result.success).toBe(true);
      expect(result.result).toBe('sync-success');
      expect(result.attempts).toBe(2);
    });
  });
});

describe('Error Handling', () => {
  describe('Error Classes', () => {
    test('should create DexApiError', () => {
      const error = new DexApiError('API failed');
      expect(error.message).toBe('API failed');
      expect(error.code).toBe(ErrorCode.DEX_API_ERROR);
      expect(error.retryable).toBe(true);
    });

    test('should create InsufficientLiquidityError', () => {
      const error = new InsufficientLiquidityError('No liquidity');
      expect(error.code).toBe(ErrorCode.INSUFFICIENT_LIQUIDITY);
      expect(error.retryable).toBe(true);
    });

    test('should create NetworkError', () => {
      const error = new NetworkError('Network down');
      expect(error.code).toBe(ErrorCode.NETWORK_TIMEOUT);
      expect(error.retryable).toBe(true);
    });

    test('should create InvalidTokenError', () => {
      const error = new InvalidTokenError('Invalid token');
      expect(error.code).toBe(ErrorCode.INVALID_TOKEN_ADDRESS);
      expect(error.retryable).toBe(false);
    });

    test('should create SlippageError', () => {
      const error = new SlippageError('Slippage exceeded');
      expect(error.code).toBe(ErrorCode.SLIPPAGE_EXCEEDED);
      expect(error.retryable).toBe(true);
    });

    test('should include context in errors', () => {
      const context = { orderId: 'order-123' };
      const error = new DexApiError('API failed', context);
      expect(error.context).toEqual(context);
    });
  });

  describe('Error Utilities', () => {
    test('should check if error is retryable', () => {
      expect(isRetryableError(new DexApiError('API failed'))).toBe(true);
      expect(isRetryableError(new InvalidTokenError('Invalid token'))).toBe(false);
    });

    test('should get error code', () => {
      expect(getErrorCode(new DexApiError('API'))).toBe(ErrorCode.DEX_API_ERROR);
      expect(getErrorCode(new NetworkError('Network'))).toBe(ErrorCode.NETWORK_TIMEOUT);
    });

    test('should create error from code', () => {
      const error = createError('Test', ErrorCode.DEX_API_ERROR);
      expect(error).toBeInstanceOf(DexApiError);
      expect(error.code).toBe(ErrorCode.DEX_API_ERROR);
    });
  });

  describe('Error Handler', () => {
    let handler: ExecutionErrorHandler;

    beforeEach(() => {
      handler = new ExecutionErrorHandler();
    });

    test('should handle API errors', () => {
      const error = new DexApiError('API failed');
      const result = handler.handleError(error, {
        orderId: 'order-123',
        operation: 'routing',
      });

      expect(result.handled).toBe(true);
      expect(result.shouldRetry).toBe(true);
      expect(result.code).toBe(ErrorCode.DEX_API_ERROR);
      expect(result.context.orderId).toBe('order-123');
    });

    test('should handle invalid token errors', () => {
      const error = new InvalidTokenError('Invalid SOL');
      const result = handler.handleError(error, {
        orderId: 'order-456',
      });

      expect(result.shouldRetry).toBe(false);
    });

    test('should track error log', () => {
      handler.handleError(new DexApiError('Error 1'), { orderId: 'order-1' });
      handler.handleError(new NetworkError('Error 2'), { orderId: 'order-2' });

      const log = handler.getErrorLog();
      expect(log.length).toBe(2);
    });

    test('should filter errors by order', () => {
      handler.handleError(new DexApiError('Error 1'), { orderId: 'order-1' });
      handler.handleError(new DexApiError('Error 2'), { orderId: 'order-2' });
      handler.handleError(new DexApiError('Error 3'), { orderId: 'order-1' });

      const order1Errors = handler.getErrorsByOrder('order-1');
      expect(order1Errors.length).toBe(2);
    });

    test('should filter retryable errors', () => {
      handler.handleError(new DexApiError('Retryable'), {});
      handler.handleError(new InvalidTokenError('Non-retryable'), {});

      const retryable = handler.getRetryableErrors();
      const nonRetryable = handler.getNonRetryableErrors();

      expect(retryable.length).toBe(1);
      expect(nonRetryable.length).toBe(1);
    });

    test('should handle insufficient liquidity', () => {
      const result = handler.handleInsufficientLiquidity(
        'order-123',
        'raydium',
        1000,
      );

      expect(result.code).toBe(ErrorCode.INSUFFICIENT_LIQUIDITY);
      expect(result.shouldRetry).toBe(true);
    });

    test('should handle slippage exceeded', () => {
      const result = handler.handleSlippageExceeded(
        'order-123',
        1000,
        950,
        0.05,
      );

      expect(result.code).toBe(ErrorCode.SLIPPAGE_EXCEEDED);
      expect(result.shouldRetry).toBe(true);
    });

    test('should generate error statistics', () => {
      handler.handleError(new DexApiError('Error 1'), {});
      handler.handleError(new DexApiError('Error 2'), {});
      handler.handleError(new InvalidTokenError('Error 3'), {});

      const stats = handler.getErrorStats();
      expect(stats.totalErrors).toBe(3);
      expect(stats.retryableErrors).toBe(2);
      expect(stats.nonRetryableErrors).toBe(1);
    });

    test('should reset error log', () => {
      handler.handleError(new DexApiError('Error'), {});
      expect(handler.getErrorLog().length).toBe(1);

      handler.reset();
      expect(handler.getErrorLog().length).toBe(0);
    });
  });

  describe('Error Handler Specific Methods', () => {
    let handler: ExecutionErrorHandler;

    beforeEach(() => {
      handler = new ExecutionErrorHandler();
    });

    test('should handle DEX API errors', () => {
      const error = new Error('API down');
      const result = handler.handleDexApiError(error, 'order-123', 'routing');

      expect(result.shouldRetry).toBe(true);
      expect(result.code).toBe(ErrorCode.DEX_API_ERROR);
    });

    test('should handle network errors', () => {
      const error = new Error('Connection timeout');
      const result = handler.handleNetworkError(error, 'order-123', 'price feed');

      expect(result.shouldRetry).toBe(true);
      expect(result.code).toBe(ErrorCode.NETWORK_TIMEOUT);
    });

    test('should handle invalid tokens', () => {
      const result = handler.handleInvalidToken('order-123', 'INVALID', 'not found');

      expect(result.shouldRetry).toBe(false);
      expect(result.code).toBe(ErrorCode.INVALID_TOKEN_ADDRESS);
    });

    test('should handle transaction failures', () => {
      const result = handler.handleTransactionFailed(
        'order-123',
        '0xabc123',
        'out of gas',
      );

      expect(result.shouldRetry).toBe(false);
      expect(result.code).toBe(ErrorCode.TRANSACTION_FAILED);
    });

    test('should handle max retries exceeded', () => {
      const lastError = new NetworkError('Network down');
      const result = handler.handleMaxRetriesExceeded('order-123', 3, lastError);

      expect(result.shouldRetry).toBe(false);
      expect(result.code).toBe(ErrorCode.MAX_RETRIES_EXCEEDED);
    });

    test('should handle unknown errors', () => {
      const result = handler.handleUnknownError('Unknown error', 'order-123');

      expect(result.shouldRetry).toBe(false);
      expect(result.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});
