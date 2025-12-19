/**
 * STEP 5: Order Queue Types & Interfaces
 * Defines all types for queue management and async processing
 */

import { DexQuote } from '../types/dex';
import { Order } from '../types/order';

/**
 * Order processing states throughout the lifecycle
 */
export enum OrderState {
  PENDING = 'pending',           // Waiting in queue
  PROCESSING = 'processing',     // Currently being executed
  ROUTED = 'routed',            // Route selected from DEX router
  EXECUTING = 'executing',       // Transaction sent to blockchain
  SUCCESS = 'success',           // Order completed successfully
  FAILED = 'failed',            // Order failed
  RETRY_PENDING = 'retry_pending', // Waiting for retry
}

/**
 * Retry state tracking
 */
export interface RetryInfo {
  attempt: number;              // Current attempt number (1, 2, 3...)
  maxAttempts: number;          // Max retry attempts allowed
  lastError: string;            // Last error message
  nextRetryAt: Date;            // When next retry will execute
  backoffMs: number;            // Milliseconds to wait
}

/**
 * Processing result from executing an order
 */
export interface ProcessingResult {
  success: boolean;
  state: OrderState;
  executedQuote?: DexQuote;     // Quote used for execution
  txHash?: string;              // Blockchain transaction hash
  error?: string;               // Error message if failed
  executedAt: Date;
  executionDurationMs: number;  // Time taken to execute
}

/**
 * Job in the queue ready for processing
 */
export interface OrderJob {
  id: string;                   // Unique job ID (same as order ID)
  orderId: string;              // Reference to Order
  order: Order;                 // Full order data
  
  state: OrderState;
  createdAt: Date;
  updatedAt: Date;
  
  // Processing tracking
  processingStartedAt?: Date;
  completedAt?: Date;
  
  // Retry tracking
  retryInfo?: RetryInfo;
  
  // Execution results
  processingResult?: ProcessingResult;
  
  // Metadata
  priority: 'low' | 'normal' | 'high'; // For queue prioritization
  tags?: string[];              // Custom tags for filtering
}

/**
 * Queue state snapshot
 */
export interface QueueState {
  totalOrders: number;
  pendingOrders: number;
  processingOrders: number;
  successfulOrders: number;
  failedOrders: number;
  retryPendingOrders: number;
  
  // Performance metrics
  avgProcessingTimeMs: number;
  avgRetries: number;
  successRate: number; // 0-100
}

/**
 * Queue event emitted for status updates
 */
export interface QueueEvent {
  type: QueueEventType;
  jobId: string;
  orderId: string;
  state: OrderState;
  timestamp: Date;
  data?: {
    error?: string;
    quote?: DexQuote;
    txHash?: string;
    retryAttempt?: number;
  };
}

/**
 * Types of events emitted by queue
 */
export enum QueueEventType {
  ORDER_ADDED = 'order_added',
  ORDER_PROCESSING_STARTED = 'order_processing_started',
  ORDER_ROUTED = 'order_routed',
  ORDER_EXECUTING = 'order_executing',
  ORDER_SUCCESS = 'order_success',
  ORDER_FAILED = 'order_failed',
  ORDER_RETRY_SCHEDULED = 'order_retry_scheduled',
  ORDER_REMOVED = 'order_removed',
}

/**
 * Queue processor configuration
 */
export interface QueueConfig {
  maxConcurrentJobs: number;    // How many orders process simultaneously
  maxRetries: number;           // Max retry attempts
  retryBackoffMs: number;       // Initial backoff in milliseconds
  retryBackoffMultiplier: number; // Exponential backoff multiplier
  jobTimeoutMs: number;         // Timeout for processing job
  circuitBreakerThreshold: number; // % failure rate to trigger circuit break
}

/**
 * Circuit breaker state
 */
export interface CircuitBreakerState {
  isOpen: boolean;              // Circuit is broken, reject new jobs
  failureCount: number;         // Consecutive failures
  successCount: number;         // Consecutive successes
  lastFailureAt?: Date;
  openedAt?: Date;
}

/**
 * Queue statistics for monitoring
 */
export interface QueueStats {
  totalProcessed: number;
  totalSuccessful: number;
  totalFailed: number;
  totalRetries: number;
  currentQueueSize: number;
  currentProcessing: number;
  
  avgProcessingTime: number;
  minProcessingTime: number;
  maxProcessingTime: number;
  
  successRate: number;
  retryRate: number;
  
  circuitBreakerStatus: 'closed' | 'open' | 'half-open';
  lastUpdated: Date;
}
