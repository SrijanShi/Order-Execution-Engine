/**
 * STEP 5: Integrated Order Queue System
 * Combines queue manager, job processor, and event system
 * Main API for queue operations
 */

import { EventEmitter } from 'events';
import { OrderQueueManager } from './queue-manager';
import { JobProcessor } from './job-processor';
import { Order } from '../types/order';
import { OrderJob, QueueConfig, QueueState, QueueEvent, OrderState } from './types';
import { DexRouter } from '../router/dex-router';
import { logger } from '../utils/logger';

/**
 * Main OrderQueue class that orchestrates all queue operations
 */
export class OrderQueue extends EventEmitter {
  private queueManager: OrderQueueManager;
  private jobProcessor: JobProcessor;
  private retryCheckInterval: NodeJS.Timeout | null = null;

  constructor(dexRouter: DexRouter, config?: Partial<QueueConfig>) {
    super();

    // Initialize components
    this.queueManager = new OrderQueueManager(config);
    this.jobProcessor = new JobProcessor(this.queueManager, dexRouter);

    // Forward queue events
    this.queueManager.on('queueEvent', (event: QueueEvent) => {
      this.emit('event', event);
    });

    logger.info('📋 OrderQueue initialized');
  }

  /**
   * Initialize and start queue processing
   */
  async initialize(): Promise<void> {
    try {
      // Start job processor
      await this.jobProcessor.start();

      // Start retry checker (run every 5 seconds)
      this.retryCheckInterval = setInterval(async () => {
        await this.jobProcessor.processRetries();
      }, 5000);

      logger.info('✅ OrderQueue initialized and started');
    } catch (error) {
      logger.error('❌ Error initializing OrderQueue', error);
      throw error;
    }
  }

  /**
   * Shutdown queue gracefully
   */
  async shutdown(): Promise<void> {
    try {
      if (this.retryCheckInterval) {
        clearInterval(this.retryCheckInterval);
      }
      await this.jobProcessor.stop();
      logger.info('✅ OrderQueue shutdown complete');
    } catch (error) {
      logger.error('❌ Error shutting down OrderQueue', error);
      throw error;
    }
  }

  /**
   * Submit an order to the queue
   */
  async submitOrder(order: Order, priority?: 'low' | 'normal' | 'high'): Promise<OrderJob> {
    try {
      return await this.queueManager.addOrder(order, priority);
    } catch (error) {
      logger.error('❌ Error submitting order', error);
      throw error;
    }
  }

  /**
   * Get order status by job ID
   */
  getOrderStatus(jobId: string): OrderJob | null {
    return this.queueManager.getJob(jobId);
  }

  /**
   * Cancel an order (only if pending)
   */
  async cancelOrder(jobId: string): Promise<boolean> {
    try {
      const job = this.queueManager.getJob(jobId);
      if (!job) {
        logger.warn('⚠️ Order not found', { jobId });
        return false;
      }

      // Can only cancel pending orders
      if (job.state !== OrderState.PENDING && job.state !== OrderState.RETRY_PENDING) {
        logger.warn('⚠️ Cannot cancel order in state', { jobId, state: job.state });
        return false;
      }

      return await this.queueManager.removeJob(jobId);
    } catch (error) {
      logger.error('❌ Error canceling order', error);
      return false;
    }
  }

  /**
   * Get current queue state
   */
  getQueueState(): QueueState {
    return this.queueManager.getQueueState();
  }

  /**
   * Get detailed queue statistics
   */
  getQueueStats() {
    return this.queueManager.getStats();
  }

  /**
   * Get all jobs in a specific state
   */
  getJobsByState(state: OrderState): OrderJob[] {
    return this.queueManager.getJobsByState(state);
  }

  /**
   * Get all pending orders
   */
  getPendingOrders(): OrderJob[] {
    return this.queueManager.getJobsByState(OrderState.PENDING);
  }

  /**
   * Get all processing orders
   */
  getProcessingOrders(): OrderJob[] {
    return this.queueManager.getJobsByState(OrderState.PROCESSING);
  }

  /**
   * Get all successful orders
   */
  getSuccessfulOrders(): OrderJob[] {
    return this.queueManager.getJobsByState(OrderState.SUCCESS);
  }

  /**
   * Get all failed orders
   */
  getFailedOrders(): OrderJob[] {
    return this.queueManager.getJobsByState(OrderState.FAILED);
  }

  /**
   * Get all retry pending orders
   */
  getRetryPendingOrders(): OrderJob[] {
    return this.queueManager.getJobsByState(OrderState.RETRY_PENDING);
  }

  /**
   * Listen to queue events
   */
  onQueueEvent(callback: (event: QueueEvent) => void): void {
    this.on('event', callback);
  }

  /**
   * Register callback for specific event type
   */
  onOrderEvent(eventType: string, callback: (event: QueueEvent) => void): void {
    this.on('event', (event: QueueEvent) => {
      if (event.type === eventType) {
        callback(event);
      }
    });
  }

  /**
   * Get processor status
   */
  getProcessorStatus() {
    return this.jobProcessor.getStatus();
  }
}
