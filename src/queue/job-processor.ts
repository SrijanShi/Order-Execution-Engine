/**
 * STEP 5: Order Job Processor
 * Processes jobs from the queue: routing, executing, and tracking results
 */

import { OrderQueueManager } from './queue-manager';
import { OrderJob, OrderState, ProcessingResult, QueueEventType } from './types';
import { DexRouter } from '../router/dex-router';
import { logger } from '../utils/logger';

/**
 * Job processor that executes orders through the DEX router
 */
export class JobProcessor {
  private queueManager: OrderQueueManager;
  private dexRouter: DexRouter;
  private isRunning: boolean = false;
  private processingInterval: NodeJS.Timeout | null = null;

  constructor(queueManager: OrderQueueManager, dexRouter: DexRouter) {
    this.queueManager = queueManager;
    this.dexRouter = dexRouter;
  }

  /**
   * Start processing jobs from queue
   * Runs continuously, picking up next jobs and executing them
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('⚠️ Job processor is already running');
      return;
    }

    this.isRunning = true;
    logger.info('🚀 Job processor started');

    // Process jobs in a loop
    this.processingInterval = setInterval(async () => {
      await this.processNextJob();
    }, 100); // Check every 100ms for next job
  }

  /**
   * Stop processing jobs
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    logger.info('⏹️ Job processor stopped');
  }

  /**
   * Process the next available job
   */
  private async processNextJob(): Promise<void> {
    try {
      // Get next job from queue
      const job = this.queueManager.getNextJob();
      if (!job) {
        return; // No jobs to process
      }

      // Start processing
      const started = await this.queueManager.startProcessing(job.id);
      if (!started) {
        return;
      }

      try {
        // Execute the order
        const result = await this.executeOrder(job);

        // Mark as complete
        await this.queueManager.completeJob(job.id, result);
      } catch (error: any) {
        // Mark as failed, will trigger retry
        await this.queueManager.failJob(job.id, error?.message || 'Unknown error');
      }
    } catch (error) {
      logger.error('❌ Error in processNextJob', error);
    }
  }

  /**
   * Execute an order through the DEX router
   * 1. Route order to best DEX
   * 2. Execute trade
   * 3. Track result
   */
  private async executeOrder(job: OrderJob): Promise<ProcessingResult> {
    const startTime = Date.now();

    try {
      logger.info('📤 Executing order', {
        jobId: job.id,
        orderId: job.orderId,
        tokenIn: job.order.tokenIn,
        tokenOut: job.order.tokenOut,
        amount: job.order.amount,
      });

      // Step 1: Get routing information from DEX router
      const routingResponse = await this.dexRouter.routeOrder(
        job.order.tokenIn,
        job.order.tokenOut,
        job.order.amount,
        job.order.slippage
      );

      if (!routingResponse || !routingResponse.bestQuote) {
        throw new Error('No routing available for this order');
      }

      logger.info('🗺️ Order routed', {
        jobId: job.id,
        dex: routingResponse.bestQuote.dex,
        price: routingResponse.bestQuote.price,
        expectedOutput: routingResponse.bestQuote.amountOut,
      });

      // Step 2: Simulate execution (in production, would send to blockchain)
      const executionResult = await this.simulateExecution(job, routingResponse.bestQuote);

      logger.info('✅ Order executed successfully', {
        jobId: job.id,
        orderId: job.orderId,
        txHash: executionResult.txHash,
        executedPrice: executionResult.executedQuote?.price,
      });

      // Return success result
      return {
        success: true,
        state: OrderState.SUCCESS,
        executedQuote: routingResponse.bestQuote,
        txHash: executionResult.txHash,
        executedAt: new Date(),
        executionDurationMs: Date.now() - startTime,
      };
    } catch (error: any) {
      logger.error('❌ Order execution failed', {
        jobId: job.id,
        orderId: job.orderId,
        error: error?.message,
        durationMs: Date.now() - startTime,
      });

      throw error;
    }
  }

  /**
   * Simulate order execution on blockchain
   * In production, this would:
   * - Build transaction
   * - Send to RPC
   * - Wait for confirmation
   * - Track on-chain state
   */
  private async simulateExecution(
    job: OrderJob,
    quote: any
  ): Promise<{ txHash: string; executedQuote: any }> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000));

    // Simulate 95% success rate
    const shouldFail = Math.random() > 0.95;
    if (shouldFail) {
      throw new Error('Simulated blockchain error: transaction reverted');
    }

    // Generate mock transaction hash
    const txHash = `0x${Math.random().toString(16).substring(2)}${Math.random().toString(16).substring(2)}`;

    return {
      txHash,
      executedQuote: quote,
    };
  }

  /**
   * Process retry jobs
   * Moves retry-pending jobs back to pending if ready
   */
  async processRetries(): Promise<number> {
    try {
      const retryJobs = this.queueManager.getJobsByState(OrderState.RETRY_PENDING);
      let processedCount = 0;

      for (const job of retryJobs) {
        if (!job.retryInfo) continue;

        // Check if retry time has arrived
        if (job.retryInfo.nextRetryAt <= new Date()) {
          // Move back to pending
          job.state = OrderState.PENDING;
          job.updatedAt = new Date();
          processedCount++;

          logger.info('🔄 Retry job moved to pending', {
            jobId: job.id,
            orderId: job.orderId,
            attempt: job.retryInfo.attempt,
          });
        }
      }

      return processedCount;
    } catch (error) {
      logger.error('❌ Error processing retries', error);
      return 0;
    }
  }

  /**
   * Get processor status
   */
  getStatus(): {
    isRunning: boolean;
    uptime?: number;
  } {
    return {
      isRunning: this.isRunning,
    };
  }
}
