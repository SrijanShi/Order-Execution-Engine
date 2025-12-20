import { logger } from './logger';

/**
 * Metrics for monitoring system performance and operations
 */
export interface SystemMetrics {
  // Timing metrics (in milliseconds)
  orderExecutionTime: number[];
  routingTime: number[];
  transactionBuildTime: number[];
  transactionSubmitTime: number[];

  // Counter metrics
  ordersProcessed: number;
  ordersSuccessful: number;
  ordersFailed: number;
  routingAttempts: number;
  routingFailures: number;

  // DEX metrics
  dexRoutesUsed: Map<string, number>;
  dexFailures: Map<string, number>;

  // Queue metrics
  queueEnqueuedOrders: number;
  queueCompletedOrders: number;
  queueAverageWaitTime: number;

  // WebSocket metrics
  wsConnections: number;
  wsMessages: number;
  wsErrors: number;

  // Error metrics
  validationErrors: number;
  routingErrors: number;
  submissionErrors: number;
  confirmationErrors: number;
}

/**
 * Metrics aggregation and reporting
 */
export class MetricsCollector {
  private metrics: SystemMetrics = {
    orderExecutionTime: [],
    routingTime: [],
    transactionBuildTime: [],
    transactionSubmitTime: [],
    ordersProcessed: 0,
    ordersSuccessful: 0,
    ordersFailed: 0,
    routingAttempts: 0,
    routingFailures: 0,
    dexRoutesUsed: new Map(),
    dexFailures: new Map(),
    queueEnqueuedOrders: 0,
    queueCompletedOrders: 0,
    queueAverageWaitTime: 0,
    wsConnections: 0,
    wsMessages: 0,
    wsErrors: 0,
    validationErrors: 0,
    routingErrors: 0,
    submissionErrors: 0,
    confirmationErrors: 0,
  };

  private maxHistorySize = 1000; // Keep last N measurements

  /**
   * Record order execution timing
   */
  recordOrderExecutionTime(durationMs: number): void {
    this.metrics.orderExecutionTime.push(durationMs);
    this.trimArray(this.metrics.orderExecutionTime);
  }

  /**
   * Record routing timing
   */
  recordRoutingTime(durationMs: number): void {
    this.metrics.routingTime.push(durationMs);
    this.trimArray(this.metrics.routingTime);
  }

  /**
   * Record transaction build timing
   */
  recordTransactionBuildTime(durationMs: number): void {
    this.metrics.transactionBuildTime.push(durationMs);
    this.trimArray(this.metrics.transactionBuildTime);
  }

  /**
   * Record transaction submission timing
   */
  recordTransactionSubmitTime(durationMs: number): void {
    this.metrics.transactionSubmitTime.push(durationMs);
    this.trimArray(this.metrics.transactionSubmitTime);
  }

  /**
   * Record successful order execution
   */
  recordOrderSuccess(): void {
    this.metrics.ordersProcessed++;
    this.metrics.ordersSuccessful++;
  }

  /**
   * Record failed order execution
   */
  recordOrderFailure(): void {
    this.metrics.ordersProcessed++;
    this.metrics.ordersFailed++;
  }

  /**
   * Record routing attempt
   */
  recordRoutingAttempt(dexName: string, success: boolean): void {
    this.metrics.routingAttempts++;
    this.metrics.dexRoutesUsed.set(
      dexName,
      (this.metrics.dexRoutesUsed.get(dexName) || 0) + 1
    );
    if (!success) {
      this.metrics.routingFailures++;
      this.metrics.dexFailures.set(
        dexName,
        (this.metrics.dexFailures.get(dexName) || 0) + 1
      );
    }
  }

  /**
   * Record queue enqueue
   */
  recordQueueEnqueue(): void {
    this.metrics.queueEnqueuedOrders++;
  }

  /**
   * Record queue completion
   */
  recordQueueCompletion(waitTimeMs: number): void {
    this.metrics.queueCompletedOrders++;
    // Update average wait time
    this.metrics.queueAverageWaitTime =
      (this.metrics.queueAverageWaitTime * (this.metrics.queueCompletedOrders - 1) +
        waitTimeMs) /
      this.metrics.queueCompletedOrders;
  }

  /**
   * Record WebSocket connection
   */
  recordWebSocketConnection(): void {
    this.metrics.wsConnections++;
  }

  /**
   * Record WebSocket message
   */
  recordWebSocketMessage(): void {
    this.metrics.wsMessages++;
  }

  /**
   * Record WebSocket error
   */
  recordWebSocketError(): void {
    this.metrics.wsErrors++;
  }

  /**
   * Record validation error
   */
  recordValidationError(): void {
    this.metrics.validationErrors++;
  }

  /**
   * Record routing error
   */
  recordRoutingError(): void {
    this.metrics.routingErrors++;
  }

  /**
   * Record submission error
   */
  recordSubmissionError(): void {
    this.metrics.submissionErrors++;
  }

  /**
   * Record confirmation error
   */
  recordConfirmationError(): void {
    this.metrics.confirmationErrors++;
  }

  /**
   * Get average execution time
   */
  getAverageExecutionTime(): number {
    if (this.metrics.orderExecutionTime.length === 0) return 0;
    const sum = this.metrics.orderExecutionTime.reduce((a, b) => a + b, 0);
    return sum / this.metrics.orderExecutionTime.length;
  }

  /**
   * Get average routing time
   */
  getAverageRoutingTime(): number {
    if (this.metrics.routingTime.length === 0) return 0;
    const sum = this.metrics.routingTime.reduce((a, b) => a + b, 0);
    return sum / this.metrics.routingTime.length;
  }

  /**
   * Get success rate
   */
  getSuccessRate(): number {
    if (this.metrics.ordersProcessed === 0) return 0;
    return (
      (this.metrics.ordersSuccessful / this.metrics.ordersProcessed) * 100
    );
  }

  /**
   * Get routing success rate
   */
  getRoutingSuccessRate(): number {
    if (this.metrics.routingAttempts === 0) return 100;
    return (
      ((this.metrics.routingAttempts - this.metrics.routingFailures) /
        this.metrics.routingAttempts) *
      100
    );
  }

  /**
   * Get percentile for execution time
   */
  getExecutionTimePercentile(percentile: number): number {
    return this.calculatePercentile(this.metrics.orderExecutionTime, percentile);
  }

  /**
   * Get percentile for routing time
   */
  getRoutingTimePercentile(percentile: number): number {
    return this.calculatePercentile(this.metrics.routingTime, percentile);
  }

  /**
   * Get all metrics as object
   */
  getMetrics(): SystemMetrics {
    return {
      ...this.metrics,
      dexRoutesUsed: new Map(this.metrics.dexRoutesUsed),
      dexFailures: new Map(this.metrics.dexFailures),
    };
  }

  /**
   * Get metrics summary for logging
   */
  getSummary(): Record<string, any> {
    return {
      ordersProcessed: this.metrics.ordersProcessed,
      ordersSuccessful: this.metrics.ordersSuccessful,
      ordersFailed: this.metrics.ordersFailed,
      successRate: `${this.getSuccessRate().toFixed(2)}%`,
      avgExecutionTimeMs: Math.round(this.getAverageExecutionTime()),
      p95ExecutionTimeMs: Math.round(this.getExecutionTimePercentile(95)),
      p99ExecutionTimeMs: Math.round(this.getExecutionTimePercentile(99)),
      avgRoutingTimeMs: Math.round(this.getAverageRoutingTime()),
      routingSuccessRate: `${this.getRoutingSuccessRate().toFixed(2)}%`,
      queueEnqueuedOrders: this.metrics.queueEnqueuedOrders,
      queueCompletedOrders: this.metrics.queueCompletedOrders,
      wsConnections: this.metrics.wsConnections,
      wsMessages: this.metrics.wsMessages,
      validationErrors: this.metrics.validationErrors,
      routingErrors: this.metrics.routingErrors,
      submissionErrors: this.metrics.submissionErrors,
      confirmationErrors: this.metrics.confirmationErrors,
    };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics = {
      orderExecutionTime: [],
      routingTime: [],
      transactionBuildTime: [],
      transactionSubmitTime: [],
      ordersProcessed: 0,
      ordersSuccessful: 0,
      ordersFailed: 0,
      routingAttempts: 0,
      routingFailures: 0,
      dexRoutesUsed: new Map(),
      dexFailures: new Map(),
      queueEnqueuedOrders: 0,
      queueCompletedOrders: 0,
      queueAverageWaitTime: 0,
      wsConnections: 0,
      wsMessages: 0,
      wsErrors: 0,
      validationErrors: 0,
      routingErrors: 0,
      submissionErrors: 0,
      confirmationErrors: 0,
    };
  }

  /**
   * Log metrics summary
   */
  logSummary(): void {
    const summary = this.getSummary();
    logger.info('📊 Metrics Summary', summary);
  }

  /**
   * Helper: Trim array to max size
   */
  private trimArray(arr: number[]): void {
    if (arr.length > this.maxHistorySize) {
      arr.splice(0, arr.length - this.maxHistorySize);
    }
  }

  /**
   * Helper: Calculate percentile
   */
  private calculatePercentile(arr: number[], percentile: number): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
}

/**
 * Global metrics instance
 */
export const metrics = new MetricsCollector();

export default metrics;
