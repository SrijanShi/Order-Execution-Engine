/**
 * STEP 5: Queue Constants & Configuration
 */

import { QueueConfig } from './types';

/**
 * Default queue configuration
 */
export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  // Process up to 5 orders concurrently
  maxConcurrentJobs: 5,

  // Maximum retry attempts for failed orders
  maxRetries: 3,

  // Initial backoff delay: 1 second
  retryBackoffMs: 1000,

  // Exponential backoff multiplier (backoff = 1000 * 2^attempt)
  retryBackoffMultiplier: 2,

  // Job timeout: 30 seconds
  jobTimeoutMs: 30000,

  // Circuit breaker: open if failure rate >= 50%
  circuitBreakerThreshold: 50,
};

/**
 * Aggressive configuration (more throughput)
 */
export const AGGRESSIVE_QUEUE_CONFIG: QueueConfig = {
  maxConcurrentJobs: 10,
  maxRetries: 5,
  retryBackoffMs: 500,
  retryBackoffMultiplier: 1.5,
  jobTimeoutMs: 20000,
  circuitBreakerThreshold: 60,
};

/**
 * Conservative configuration (reliability focused)
 */
export const CONSERVATIVE_QUEUE_CONFIG: QueueConfig = {
  maxConcurrentJobs: 2,
  maxRetries: 5,
  retryBackoffMs: 2000,
  retryBackoffMultiplier: 2.5,
  jobTimeoutMs: 60000,
  circuitBreakerThreshold: 30,
};

/**
 * Retry delay calculation based on attempt number
 */
export function calculateRetryDelay(
  attempt: number,
  baseMs: number,
  multiplier: number
): number {
  // Formula: baseMs * multiplier^(attempt-1)
  // Attempt 1: baseMs * 1 = baseMs
  // Attempt 2: baseMs * multiplier
  // Attempt 3: baseMs * multiplier^2
  return baseMs * Math.pow(multiplier, attempt - 1);
}

/**
 * Queue event messages
 */
export const QUEUE_EVENT_MESSAGES = {
  ORDER_ADDED: '📋 Order added to queue',
  ORDER_PROCESSING_STARTED: '🔄 Order processing started',
  ORDER_ROUTED: '🗺️ Order routed to DEX',
  ORDER_EXECUTING: '⚙️ Executing order on blockchain',
  ORDER_SUCCESS: '✅ Order completed successfully',
  ORDER_FAILED: '❌ Order failed',
  ORDER_RETRY_SCHEDULED: '🔄 Order retry scheduled',
  ORDER_REMOVED: '🗑️ Order removed from queue',
};

/**
 * Queue state color codes for logging
 */
export const QUEUE_STATE_COLORS = {
  PENDING: '⏳',
  PROCESSING: '🔄',
  ROUTED: '🗺️',
  EXECUTING: '⚙️',
  SUCCESS: '✅',
  FAILED: '❌',
  RETRY_PENDING: '🔁',
};
