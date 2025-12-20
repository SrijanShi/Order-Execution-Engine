import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { Order } from '../types/order';
import { DexRouter } from '../router/dex-router';
import { logger } from '../utils/logger';
import { retry, DEFAULT_RETRY_CONFIG } from '../utils/retry';
import { ExecutionErrorHandler, globalErrorHandler } from './error-handler';
import {
  ExecutionState,
  ExecutionContext,
  ExecutionResult,
  StateTransition,
  ExecutionStats,
  ExecutionConfig,
  ValidationResult,
  QuoteSelection,
  ExecutionEvent,
  Transaction,
  DEFAULT_EXECUTION_CONFIG,
} from './types';

/**
 * ExecutionEngine
 * Orchestrates order execution through the complete pipeline:
 * Validation → Routing → Building → Submission → Confirmation
 */
export class ExecutionEngine extends EventEmitter {
  private executions: Map<string, ExecutionContext> = new Map();
  private stateTransitions: StateTransition[] = [];
  private stats: ExecutionStats = {
    totalExecuted: 0,
    totalSuccessful: 0,
    totalFailed: 0,
    averageExecutionTime: 0,
    pendingCount: 0,
    routingCount: 0,
    buildingCount: 0,
    submittedCount: 0,
    failureRate: 0,
    stateDistribution: {
      [ExecutionState.PENDING]: 0,
      [ExecutionState.ROUTING]: 0,
      [ExecutionState.BUILDING]: 0,
      [ExecutionState.SUBMITTED]: 0,
      [ExecutionState.CONFIRMED]: 0,
      [ExecutionState.FAILED]: 0,
    },
  };
  private config: ExecutionConfig;
  private dexRouter: DexRouter;

  constructor(dexRouter: DexRouter, config: ExecutionConfig = DEFAULT_EXECUTION_CONFIG) {
    super();
    this.dexRouter = dexRouter;
    this.config = config;
  }

  /**
   * Start execution of an order
   */
  async executeOrder(order: Order): Promise<ExecutionResult> {
    const executionId = uuidv4();
    const context: ExecutionContext = {
      orderId: order.orderId,
      order,
      state: ExecutionState.PENDING,
      startTime: new Date(),
      lastStateChange: new Date(),
      totalTime: 0,
    };

    this.executions.set(executionId, context);
    this.stats.totalExecuted++;
    this.updateStateDistribution(ExecutionState.PENDING, 1);

    logger.info(`Execution started for order ${order.orderId}`);
    this.emitEvent({
      type: 'state_change',
      executionId,
      orderId: order.orderId,
      state: ExecutionState.PENDING,
      timestamp: new Date(),
    });

    try {
      // Step 1: Validate order
      const validationResult = this.validateOrder(order);
      if (!validationResult.isValid) {
        return this.handleExecutionError(
          executionId,
          context,
          `Validation failed: ${validationResult.errors.join(', ')}`
        );
      }

      // Step 2: Route and get best quote
      const routingResult = await this.routeOrder(executionId, context);
      if (!routingResult.success) {
        return this.handleExecutionError(executionId, context, routingResult.error!);
      }

      // Step 3: Build transaction
      const buildingResult = await this.buildTransaction(executionId, context);
      if (!buildingResult.success) {
        return this.handleExecutionError(executionId, context, buildingResult.error!);
      }

      // Step 4: Submit transaction
      const submissionResult = await this.submitTransaction(executionId, context);
      if (!submissionResult.success) {
        return this.handleExecutionError(executionId, context, submissionResult.error!);
      }

      // Step 5: Wait for confirmation
      const confirmationResult = await this.waitForConfirmation(executionId, context);
      if (!confirmationResult.success) {
        return this.handleExecutionError(executionId, context, confirmationResult.error!);
      }

      // Success
      context.state = ExecutionState.CONFIRMED;
      const now = new Date();
      context.lastStateChange = now;
      context.totalTime = now.getTime() - context.startTime.getTime();

      this.stats.totalSuccessful++;
      this.updateStateDistribution(ExecutionState.PENDING, -1);
      this.updateStateDistribution(ExecutionState.CONFIRMED, 1);
      this.updateAverageTime(context.totalTime);

      logger.info(`Order ${order.orderId} execution CONFIRMED in ${context.totalTime}ms`);
      this.emitEvent({
        type: 'confirmation',
        executionId,
        orderId: order.orderId,
        state: ExecutionState.CONFIRMED,
        data: { txHash: context.txHash, totalTime: context.totalTime },
        timestamp: new Date(),
      });

      return {
        success: true,
        newState: ExecutionState.CONFIRMED,
        data: {
          executionId,
          txHash: context.txHash,
          totalTime: context.totalTime,
        },
        timestamp: new Date(),
      };
    } catch (error: any) {
      return this.handleExecutionError(executionId, context, error.message || 'Unknown error');
    }
  }

  /**
   * Validate order input
   */
  private validateOrder(order: Order): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required fields
    if (!order.orderId) errors.push('Missing orderId');
    if (!order.tokenIn) errors.push('Missing tokenIn');
    if (!order.tokenOut) errors.push('Missing tokenOut');
    if (!order.amount || order.amount <= 0) {
      errors.push('Invalid amount');
    }

    // Check slippage
    if (order.slippage && (order.slippage < 0 || order.slippage > 10000)) {
      errors.push('Slippage must be between 0 and 10000 bps');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Step 1: Route order through DEX routers to find best quote
   */
  private async routeOrder(executionId: string, context: ExecutionContext): Promise<ExecutionResult> {
    try {
      this.updateStateDistribution(context.state, -1);
      context.state = ExecutionState.ROUTING;
      context.lastStateChange = new Date();
      this.updateStateDistribution(ExecutionState.ROUTING, 1);

      this.emitEvent({
        type: 'state_change',
        executionId,
        orderId: context.orderId,
        state: ExecutionState.ROUTING,
        timestamp: new Date(),
      });

      const { tokenIn, tokenOut, amount } = context.order;

      // Use retry with exponential backoff for routing
      const retryResult = await retry(
        async () => {
          const routingPromise = this.dexRouter.routeOrder(tokenIn, tokenOut, amount, 50);
          const routeResult = await Promise.race([
            routingPromise,
            this.delay(this.config.routingTimeout),
          ]).catch(() => {
            throw new Error(`Routing timeout after ${this.config.routingTimeout}ms`);
          });

          if (!routeResult) {
            throw new Error('No routes found');
          }

          return routeResult;
        },
        'order-routing',
        DEFAULT_RETRY_CONFIG,
      );

      if (!retryResult.success) {
        const error = retryResult.error!;
        globalErrorHandler.handleDexApiError(error, context.orderId, 'routing');
        return {
          success: false,
          newState: ExecutionState.FAILED,
          error: `Routing failed after ${retryResult.attempts} attempts: ${error.message}`,
          timestamp: new Date(),
        };
      }

      const routeResult = retryResult.result;

      // Select best quote
      const quoteSelection = this.selectBestQuote(routeResult as any);
      context.routeResult = routeResult as any;
      context.quote = quoteSelection.quote;

      logger.info(
        `Order ${context.orderId} routed through ${quoteSelection.dexName} with score ${quoteSelection.score}`
      );
      this.emitEvent({
        type: 'routing',
        executionId,
        orderId: context.orderId,
        state: ExecutionState.ROUTING,
        data: {
          dexName: quoteSelection.dexName,
          expectedOutput: quoteSelection.quote.amountOut,
          priceImpact: quoteSelection.priceImpact,
        },
        timestamp: new Date(),
      });

      return {
        success: true,
        newState: ExecutionState.ROUTING,
        data: quoteSelection,
        timestamp: new Date(),
      };
    } catch (error: any) {
      return {
        success: false,
        newState: ExecutionState.FAILED,
        error: error.message,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Step 2: Build transaction
   */
  private async buildTransaction(
    executionId: string,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    try {
      this.updateStateDistribution(context.state, -1);
      context.state = ExecutionState.BUILDING;
      context.lastStateChange = new Date();
      this.updateStateDistribution(ExecutionState.BUILDING, 1);

      this.emitEvent({
        type: 'state_change',
        executionId,
        orderId: context.orderId,
        state: ExecutionState.BUILDING,
        timestamp: new Date(),
      });

      // Simulate transaction building
      await this.delay(100); // Simulated building time

      const transaction: Transaction = {
        from: '0x' + '1'.repeat(40),           // Simulated address
        to: '0x' + 'a'.repeat(40),             // DEX contract (simulated)
        data: '0x' + '0'.repeat(128),          // Simulated encoded data
        value: '0',
        gasLimit: (300000 * this.config.gasMultiplier).toString(),
        gasPrice: '50000000000',               // 50 Gwei
        nonce: Math.floor(Math.random() * 1000),
      };

      context.transaction = transaction;

      logger.info(`Transaction built for order ${context.orderId}`);
      this.emitEvent({
        type: 'building',
        executionId,
        orderId: context.orderId,
        state: ExecutionState.BUILDING,
        data: {
          to: transaction.to,
          gasLimit: transaction.gasLimit,
          gasPrice: transaction.gasPrice,
        },
        timestamp: new Date(),
      });

      return {
        success: true,
        newState: ExecutionState.BUILDING,
        data: transaction,
        timestamp: new Date(),
      };
    } catch (error: any) {
      return {
        success: false,
        newState: ExecutionState.FAILED,
        error: error.message,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Step 3: Submit transaction to blockchain
   */
  private async submitTransaction(
    executionId: string,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    try {
      this.updateStateDistribution(context.state, -1);
      context.state = ExecutionState.SUBMITTED;
      context.lastStateChange = new Date();
      this.updateStateDistribution(ExecutionState.SUBMITTED, 1);

      this.emitEvent({
        type: 'state_change',
        executionId,
        orderId: context.orderId,
        state: ExecutionState.SUBMITTED,
        timestamp: new Date(),
      });

      // Simulate submission
      await this.delay(50);

      // Generate transaction hash
      const txHash = '0x' + Math.random().toString(16).substring(2, 66);
      context.txHash = txHash;
      context.transaction!.hash = txHash;

      logger.info(`Transaction submitted for order ${context.orderId}: ${txHash}`);
      this.emitEvent({
        type: 'submission',
        executionId,
        orderId: context.orderId,
        state: ExecutionState.SUBMITTED,
        data: { txHash },
        timestamp: new Date(),
      });

      return {
        success: true,
        newState: ExecutionState.SUBMITTED,
        data: { txHash },
        timestamp: new Date(),
      };
    } catch (error: any) {
      return {
        success: false,
        newState: ExecutionState.FAILED,
        error: error.message,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Step 4: Wait for transaction confirmation
   */
  private async waitForConfirmation(
    executionId: string,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    try {
      // Simulate confirmation with small delay
      await this.delay(100);

      logger.info(
        `Transaction confirmed for order ${context.orderId}: ${context.txHash}`
      );

      return {
        success: true,
        newState: ExecutionState.CONFIRMED,
        data: { txHash: context.txHash },
        timestamp: new Date(),
      };
    } catch (error: any) {
      return {
        success: false,
        newState: ExecutionState.FAILED,
        error: error.message,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Handle execution error
   */
  private handleExecutionError(
    executionId: string,
    context: ExecutionContext,
    errorMessage: string
  ): ExecutionResult {
    this.updateStateDistribution(context.state, -1);
    context.state = ExecutionState.FAILED;
    context.error = errorMessage;
    context.lastStateChange = new Date();
    const now = new Date();
    context.totalTime = now.getTime() - context.startTime.getTime();

    this.updateStateDistribution(ExecutionState.FAILED, 1);
    this.stats.totalFailed++;
    this.updateAverageTime(context.totalTime);

    logger.error(`Order ${context.orderId} execution FAILED: ${errorMessage}`);
    this.emitEvent({
      type: 'error',
      executionId,
      orderId: context.orderId,
      state: ExecutionState.FAILED,
      error: errorMessage,
      timestamp: new Date(),
    });

    return {
      success: false,
      newState: ExecutionState.FAILED,
      error: errorMessage,
      timestamp: new Date(),
    };
  }

  /**
   * Select best quote based on price
   */
  private selectBestQuote(routeResult: any): QuoteSelection {
    // For now, return the first quote with highest output
    const quote = routeResult.quotes[0];
    const dexName = routeResult.dexName || 'unknown';
    const score = quote.amountOut;
    const priceImpact = routeResult.priceImpact || 0;

    return { quote, dexName, score, priceImpact };
  }

  /**
   * Get execution context
   */
  getExecution(executionId: string): ExecutionContext | undefined {
    return this.executions.get(executionId);
  }

  /**
   * Get all executions by state
   */
  getExecutionsByState(state: ExecutionState): ExecutionContext[] {
    return Array.from(this.executions.values()).filter((exec) => exec.state === state);
  }

  /**
   * Get execution statistics
   */
  getStats(): ExecutionStats {
    this.stats.failureRate =
      this.stats.totalExecuted > 0
        ? (this.stats.totalFailed / this.stats.totalExecuted) * 100
        : 0;
    return { ...this.stats };
  }

  /**
   * Get state transitions history
   */
  getStateTransitions(executionId?: string): StateTransition[] {
    if (!executionId) {
      return this.stateTransitions;
    }
    return this.stateTransitions.filter((t) =>
      this.executions.get(executionId)?.orderId === this.executions
        .get(executionId)
        ?.orderId
    );
  }

  /**
   * Update state distribution
   */
  private updateStateDistribution(state: ExecutionState, delta: number): void {
    this.stats.stateDistribution[state] += delta;
  }

  /**
   * Update average execution time
   */
  private updateAverageTime(newTime: number): void {
    const totalTime =
      this.stats.averageExecutionTime * (this.stats.totalExecuted - 1) + newTime;
    this.stats.averageExecutionTime = totalTime / this.stats.totalExecuted;
  }

  /**
   * Emit execution event
   */
  private emitEvent(event: ExecutionEvent): void {
    this.emit('execution_event', event);
    this.emit(`execution:${event.orderId}`, event);
  }

  /**
   * Utility: Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Reset engine state
   */
  reset(): void {
    this.executions.clear();
    this.stateTransitions = [];
    this.stats = {
      totalExecuted: 0,
      totalSuccessful: 0,
      totalFailed: 0,
      averageExecutionTime: 0,
      pendingCount: 0,
      routingCount: 0,
      buildingCount: 0,
      submittedCount: 0,
      failureRate: 0,
      stateDistribution: {
        [ExecutionState.PENDING]: 0,
        [ExecutionState.ROUTING]: 0,
        [ExecutionState.BUILDING]: 0,
        [ExecutionState.SUBMITTED]: 0,
        [ExecutionState.CONFIRMED]: 0,
        [ExecutionState.FAILED]: 0,
      },
    };
  }
}
