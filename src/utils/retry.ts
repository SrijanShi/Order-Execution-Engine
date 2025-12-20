import { logger } from './logger';
import { isRetryableError } from './errors';

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxAttempts: number;           // Max number of retry attempts
  initialDelayMs: number;        // Initial delay in milliseconds
  maxDelayMs: number;            // Max delay between retries
  backoffMultiplier: number;     // Exponential backoff multiplier
  jitterFactor: number;          // Random jitter (0-1)
}

/**
 * Default retry configuration
 * Attempt 1: 1s delay
 * Attempt 2: 2s delay
 * Attempt 3: 4s delay
 * Attempt 4: Give up
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,    // 1 second
  maxDelayMs: 4000,        // 4 seconds max
  backoffMultiplier: 2,    // Double the delay each time
  jitterFactor: 0.1,       // 10% random jitter
};

/**
 * Aggressive retry configuration (for time-sensitive operations)
 */
export const AGGRESSIVE_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 2,
  initialDelayMs: 500,
  maxDelayMs: 2000,
  backoffMultiplier: 2,
  jitterFactor: 0.05,
};

/**
 * Conservative retry configuration (for less critical operations)
 */
export const CONSERVATIVE_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 5,
  initialDelayMs: 2000,
  maxDelayMs: 10000,
  backoffMultiplier: 1.5,
  jitterFactor: 0.2,
};

/**
 * Retry result
 */
export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalDelayMs: number;
  lastError?: Error;
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(
  attemptNumber: number,
  config: RetryConfig,
): number {
  // Calculate base delay: initialDelay * (multiplier ^ attempt)
  const baseDelay = config.initialDelayMs *
    Math.pow(config.backoffMultiplier, attemptNumber - 1);

  // Cap at maxDelay
  const cappedDelay = Math.min(baseDelay, config.maxDelayMs);

  // Add jitter: random factor between -jitterFactor and +jitterFactor
  const jitterRange = cappedDelay * config.jitterFactor;
  const jitter = (Math.random() - 0.5) * 2 * jitterRange;

  return Math.max(0, cappedDelay + jitter);
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  operationName: string,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): Promise<RetryResult<T>> {
  let lastError: Error | undefined;
  let totalDelayMs = 0;
  let attempt = 0;

  for (attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      logger.info(`[${operationName}] Attempt ${attempt}/${config.maxAttempts}`);

      const result = await fn();

      logger.info(
        `[${operationName}] Success on attempt ${attempt} after ${totalDelayMs}ms`,
      );

      return {
        success: true,
        result,
        attempts: attempt,
        totalDelayMs,
      };
    } catch (error: any) {
      lastError = error;

      // Check if error is retryable
      const shouldRetry = isRetryableError(error) && attempt < config.maxAttempts;

      if (shouldRetry) {
        const delayMs = calculateDelay(attempt, config);
        totalDelayMs += delayMs;

        logger.warn(
          `[${operationName}] Attempt ${attempt} failed: ${error.message}. Retrying in ${delayMs.toFixed(0)}ms`,
        );

        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else {
        logger.error(
          `[${operationName}] Attempt ${attempt} failed (non-retryable): ${error.message}`,
        );
        break;
      }
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: attempt,
    totalDelayMs,
    lastError,
  };
}

/**
 * Retry a synchronous function (wraps in Promise)
 */
export async function retrySync<T>(
  fn: () => T,
  operationName: string,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): Promise<RetryResult<T>> {
  return retry(
    async () => fn(),
    operationName,
    config,
  );
}

/**
 * Retry with custom predicate (not just error-based)
 */
export async function retryUntil<T>(
  fn: () => Promise<T>,
  predicate: (result: T) => boolean,
  operationName: string,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): Promise<RetryResult<T>> {
  let lastResult: T | undefined;
  let lastError: Error | undefined;
  let totalDelayMs = 0;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      logger.info(`[${operationName}] Attempt ${attempt}/${config.maxAttempts}`);

      const result = await fn();
      lastResult = result;

      // Check if predicate is satisfied
      if (predicate(result)) {
        logger.info(
          `[${operationName}] Success on attempt ${attempt} after ${totalDelayMs}ms`,
        );

        return {
          success: true,
          result,
          attempts: attempt,
          totalDelayMs,
        };
      }

      // Predicate not satisfied, retry if attempts remaining
      if (attempt < config.maxAttempts) {
        const delayMs = calculateDelay(attempt, config);
        totalDelayMs += delayMs;

        logger.warn(
          `[${operationName}] Attempt ${attempt} failed predicate. Retrying in ${delayMs.toFixed(0)}ms`,
        );

        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    } catch (error: any) {
      lastError = error;
      logger.error(
        `[${operationName}] Attempt ${attempt} error: ${error.message}`,
      );

      if (attempt < config.maxAttempts) {
        const delayMs = calculateDelay(attempt, config);
        totalDelayMs += delayMs;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  return {
    success: false,
    result: lastResult,
    error: lastError,
    attempts: config.maxAttempts,
    totalDelayMs,
    lastError,
  };
}

/**
 * Get retry config by name
 */
export function getRetryConfig(
  configName: string = 'default',
): RetryConfig {
  switch (configName.toLowerCase()) {
    case 'aggressive':
      return AGGRESSIVE_RETRY_CONFIG;
    case 'conservative':
      return CONSERVATIVE_RETRY_CONFIG;
    default:
      return DEFAULT_RETRY_CONFIG;
  }
}
