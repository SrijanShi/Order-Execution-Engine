/**
 * STEP 5: Order Queue Manager
 * Manages the queue of orders waiting for execution
 * Handles job lifecycle: add → process → complete/retry → remove
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  OrderJob,
  OrderState,
  QueueConfig,
  QueueEvent,
  QueueEventType,
  QueueState,
  RetryInfo,
  CircuitBreakerState,
  QueueStats,
} from './types';
import { Order } from '../types/order';
import { logger } from '../utils/logger';

/**
 * In-memory order queue manager
 * Tracks all orders in various states
 */
export class OrderQueueManager extends EventEmitter {
  private pendingJobs: Map<string, OrderJob> = new Map();
  private processingJobs: Map<string, OrderJob> = new Map();
  private completedJobs: Map<string, OrderJob> = new Map();
  private failedJobs: Map<string, OrderJob> = new Map();

  private config: QueueConfig;
  private circuitBreaker: CircuitBreakerState;
  private stats: {
    totalProcessed: number;
    totalSuccessful: number;
    totalFailed: number;
    totalRetries: number;
    processingTimes: number[];
  };

  constructor(config: Partial<QueueConfig> = {}) {
    super();

    // Default configuration
    this.config = {
      maxConcurrentJobs: config.maxConcurrentJobs || 5,
      maxRetries: config.maxRetries || 3,
      retryBackoffMs: config.retryBackoffMs || 1000,
      retryBackoffMultiplier: config.retryBackoffMultiplier || 2,
      jobTimeoutMs: config.jobTimeoutMs || 30000,
      circuitBreakerThreshold: config.circuitBreakerThreshold || 50,
    };

    // Initialize circuit breaker
    this.circuitBreaker = {
      isOpen: false,
      failureCount: 0,
      successCount: 0,
    };

    // Initialize stats
    this.stats = {
      totalProcessed: 0,
      totalSuccessful: 0,
      totalFailed: 0,
      totalRetries: 0,
      processingTimes: [],
    };

    logger.info('📊 OrderQueueManager initialized', {
      config: this.config,
    });
  }

  /**
   * Add a new order to the queue
   */
  async addOrder(order: Order, priority: 'low' | 'normal' | 'high' = 'normal'): Promise<OrderJob> {
    try {
      if (!order || !order.orderId) {
        throw new Error('Invalid order: missing order ID');
      }

      // Check if circuit breaker is open
      if (this.circuitBreaker.isOpen) {
        logger.warn('⚠️ Circuit breaker is open, rejecting new order', {
          orderId: order.orderId,
        });
        throw new Error('Queue circuit breaker is open');
      }

      // Create job
      const job: OrderJob = {
        id: uuidv4(),
        orderId: order.orderId,
        order,
        state: OrderState.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        priority,
      };

      // Add to pending queue
      this.pendingJobs.set(job.id, job);

      // Emit event
      this.emitQueueEvent({
        type: QueueEventType.ORDER_ADDED,
        jobId: job.id,
        orderId: order.orderId,
        state: OrderState.PENDING,
        timestamp: new Date(),
      });

      logger.info('✅ Order added to queue', {
        jobId: job.id,
        orderId: order.orderId,
        queueSize: this.pendingJobs.size,
      });

      return job;
    } catch (error) {
      logger.error('❌ Error adding order to queue', error);
      throw error;
    }
  }

  /**
   * Get next job to process
   * Respects max concurrent jobs and prioritization
   */
  getNextJob(): OrderJob | null {
    try {
      // Check if we can process more jobs
      if (this.processingJobs.size >= this.config.maxConcurrentJobs) {
        return null;
      }

      // Get pending jobs, sorted by priority
      const pendingArray = Array.from(this.pendingJobs.values());
      if (pendingArray.length === 0) {
        return null;
      }

      // Sort by priority: high → normal → low, then by creation time
      const priorityOrder = { high: 0, normal: 1, low: 2 };
      pendingArray.sort((a, b) => {
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });

      return pendingArray[0] || null;
    } catch (error) {
      logger.error('❌ Error getting next job', error);
      return null;
    }
  }

  /**
   * Move job to processing state
   */
  async startProcessing(jobId: string): Promise<boolean> {
    try {
      const job = this.pendingJobs.get(jobId);
      if (!job) {
        logger.warn('⚠️ Job not found in pending queue', { jobId });
        return false;
      }

      // Remove from pending, add to processing
      this.pendingJobs.delete(jobId);
      job.state = OrderState.PROCESSING;
      job.processingStartedAt = new Date();
      job.updatedAt = new Date();
      this.processingJobs.set(jobId, job);

      // Emit event
      this.emitQueueEvent({
        type: QueueEventType.ORDER_PROCESSING_STARTED,
        jobId,
        orderId: job.orderId,
        state: OrderState.PROCESSING,
        timestamp: new Date(),
      });

      logger.info('🔄 Job processing started', {
        jobId,
        orderId: job.orderId,
      });

      return true;
    } catch (error) {
      logger.error('❌ Error starting job processing', error);
      return false;
    }
  }

  /**
   * Mark job as successfully completed
   */
  async completeJob(jobId: string, result?: any): Promise<boolean> {
    try {
      const job = this.processingJobs.get(jobId);
      if (!job) {
        logger.warn('⚠️ Job not found in processing queue', { jobId });
        return false;
      }

      // Calculate processing time
      const processingTimeMs = job.processingStartedAt
        ? Date.now() - job.processingStartedAt.getTime()
        : 0;

      // Move to completed
      this.processingJobs.delete(jobId);
      job.state = OrderState.SUCCESS;
      job.completedAt = new Date();
      job.updatedAt = new Date();
      job.processingResult = result;
      this.completedJobs.set(jobId, job);

      // Update stats
      this.stats.totalProcessed++;
      this.stats.totalSuccessful++;
      this.stats.processingTimes.push(processingTimeMs);
      this.circuitBreaker.successCount++;
      this.circuitBreaker.failureCount = 0;

      // Emit event
      this.emitQueueEvent({
        type: QueueEventType.ORDER_SUCCESS,
        jobId,
        orderId: job.orderId,
        state: OrderState.SUCCESS,
        timestamp: new Date(),
        data: result?.data,
      });

      logger.info('✅ Job completed successfully', {
        jobId,
        orderId: job.orderId,
        processingTimeMs,
      });

      return true;
    } catch (error) {
      logger.error('❌ Error completing job', error);
      return false;
    }
  }

  /**
   * Mark job as failed and schedule retry
   */
  async failJob(jobId: string, error: string): Promise<boolean> {
    try {
      const job = this.processingJobs.get(jobId);
      if (!job) {
        logger.warn('⚠️ Job not found in processing queue', { jobId });
        return false;
      }

      // Remove from processing
      this.processingJobs.delete(jobId);
      job.updatedAt = new Date();

      // Initialize retry info if needed
      if (!job.retryInfo) {
        job.retryInfo = {
          attempt: 0,
          maxAttempts: this.config.maxRetries,
          lastError: error,
          nextRetryAt: new Date(),
          backoffMs: this.config.retryBackoffMs,
        };
      } else {
        job.retryInfo.attempt++;
        job.retryInfo.lastError = error;
      }

      // Check if we should retry
      if (job.retryInfo.attempt < this.config.maxRetries) {
        // Schedule retry with exponential backoff
        const backoffMs =
          this.config.retryBackoffMs *
          Math.pow(this.config.retryBackoffMultiplier, job.retryInfo.attempt - 1);

        job.retryInfo.nextRetryAt = new Date(Date.now() + backoffMs);
        job.retryInfo.backoffMs = backoffMs;
        job.state = OrderState.RETRY_PENDING;

        // Add back to pending queue
        this.pendingJobs.set(jobId, job);

        // Update stats
        this.stats.totalRetries++;

        // Emit event
        this.emitQueueEvent({
          type: QueueEventType.ORDER_RETRY_SCHEDULED,
          jobId,
          orderId: job.orderId,
          state: OrderState.RETRY_PENDING,
          timestamp: new Date(),
          data: {
            error,
            retryAttempt: job.retryInfo.attempt,
          },
        });

        logger.info('🔄 Job retry scheduled', {
          jobId,
          orderId: job.orderId,
          attempt: job.retryInfo.attempt,
          nextRetryMs: backoffMs,
        });
      } else {
        // Max retries exceeded, mark as failed
        job.state = OrderState.FAILED;
        this.failedJobs.set(jobId, job);

        // Update stats
        this.stats.totalProcessed++;
        this.stats.totalFailed++;
        this.circuitBreaker.failureCount++;
        this.circuitBreaker.successCount = 0;

        // Check circuit breaker
        const failureRate =
          (this.circuitBreaker.failureCount /
            (this.circuitBreaker.failureCount + this.circuitBreaker.successCount)) *
          100;
        if (failureRate >= this.config.circuitBreakerThreshold) {
          this.circuitBreaker.isOpen = true;
          this.circuitBreaker.openedAt = new Date();
          logger.error('🔴 Circuit breaker opened', {
            failureRate: failureRate.toFixed(2),
            threshold: this.config.circuitBreakerThreshold,
          });
        }

        // Emit event
        this.emitQueueEvent({
          type: QueueEventType.ORDER_FAILED,
          jobId,
          orderId: job.orderId,
          state: OrderState.FAILED,
          timestamp: new Date(),
          data: {
            error,
            retryAttempt: job.retryInfo.attempt,
          },
        });

        logger.error('❌ Job failed (max retries exceeded)', {
          jobId,
          orderId: job.orderId,
          error,
          attempts: job.retryInfo.attempt,
        });
      }

      return true;
    } catch (error) {
      logger.error('❌ Error failing job', error);
      return false;
    }
  }

  /**
   * Get job by ID
   */
  getJob(jobId: string): OrderJob | null {
    return (
      this.pendingJobs.get(jobId) ||
      this.processingJobs.get(jobId) ||
      this.completedJobs.get(jobId) ||
      this.failedJobs.get(jobId) ||
      null
    );
  }

  /**
   * Get current queue state
   */
  getQueueState(): QueueState {
    return {
      totalOrders: this.getTotalOrders(),
      pendingOrders: this.pendingJobs.size,
      processingOrders: this.processingJobs.size,
      successfulOrders: this.completedJobs.size,
      failedOrders: this.failedJobs.size,
      retryPendingOrders: Array.from(this.pendingJobs.values()).filter(
        j => j.state === OrderState.RETRY_PENDING
      ).length,
      avgProcessingTimeMs:
        this.stats.processingTimes.length > 0
          ? this.stats.processingTimes.reduce((a, b) => a + b, 0) /
            this.stats.processingTimes.length
          : 0,
      avgRetries: this.stats.totalProcessed > 0 ? this.stats.totalRetries / this.stats.totalProcessed : 0,
      successRate:
        this.stats.totalProcessed > 0
          ? (this.stats.totalSuccessful / this.stats.totalProcessed) * 100
          : 0,
    };
  }

  /**
   * Get queue statistics
   */
  getStats(): QueueStats {
    const failureCount = this.circuitBreaker.failureCount;
    const successCount = this.circuitBreaker.successCount;
    const totalResults = failureCount + successCount;

    return {
      totalProcessed: this.stats.totalProcessed,
      totalSuccessful: this.stats.totalSuccessful,
      totalFailed: this.stats.totalFailed,
      totalRetries: this.stats.totalRetries,
      currentQueueSize: this.pendingJobs.size,
      currentProcessing: this.processingJobs.size,
      avgProcessingTime:
        this.stats.processingTimes.length > 0
          ? this.stats.processingTimes.reduce((a, b) => a + b, 0) /
            this.stats.processingTimes.length
          : 0,
      minProcessingTime:
        this.stats.processingTimes.length > 0 ? Math.min(...this.stats.processingTimes) : 0,
      maxProcessingTime:
        this.stats.processingTimes.length > 0 ? Math.max(...this.stats.processingTimes) : 0,
      successRate:
        this.stats.totalProcessed > 0
          ? (this.stats.totalSuccessful / this.stats.totalProcessed) * 100
          : 0,
      retryRate:
        this.stats.totalProcessed > 0
          ? (this.stats.totalRetries / this.stats.totalProcessed) * 100
          : 0,
      circuitBreakerStatus: this.circuitBreaker.isOpen
        ? 'open'
        : totalResults === 0
        ? 'closed'
        : 'half-open',
      lastUpdated: new Date(),
    };
  }

  /**
   * Remove job from queue
   */
  async removeJob(jobId: string): Promise<boolean> {
    try {
      if (this.pendingJobs.delete(jobId)) {
        this.emitQueueEvent({
          type: QueueEventType.ORDER_REMOVED,
          jobId,
          orderId: '',
          state: OrderState.PENDING,
          timestamp: new Date(),
        });
        return true;
      }

      if (this.processingJobs.delete(jobId)) {
        this.emitQueueEvent({
          type: QueueEventType.ORDER_REMOVED,
          jobId,
          orderId: '',
          state: OrderState.PROCESSING,
          timestamp: new Date(),
        });
        return true;
      }

      return false;
    } catch (error) {
      logger.error('❌ Error removing job', error);
      return false;
    }
  }

  /**
   * Get all jobs in a specific state
   */
  getJobsByState(state: OrderState): OrderJob[] {
    const allJobs = [
      ...this.pendingJobs.values(),
      ...this.processingJobs.values(),
      ...this.completedJobs.values(),
      ...this.failedJobs.values(),
    ];

    return allJobs.filter(job => job.state === state);
  }

  /**
   * Get total number of orders
   */
  getTotalOrders(): number {
    return (
      this.pendingJobs.size +
      this.processingJobs.size +
      this.completedJobs.size +
      this.failedJobs.size
    );
  }

  /**
   * Emit queue event
   */
  private emitQueueEvent(event: QueueEvent): void {
    this.emit('queueEvent', event);
  }

  /**
   * Reset circuit breaker (for recovery)
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker = {
      isOpen: false,
      failureCount: 0,
      successCount: 0,
    };
    logger.info('🟢 Circuit breaker reset');
  }
}
