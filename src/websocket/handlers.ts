import { WebSocketManager } from './manager';
import { ExecutionEngine } from '../execution/engine';
import { logger } from '../utils/logger';
import {
  MessageType,
  WebSocketMessage,
  StatusUpdatePayload,
  OrderRoutedPayload,
  OrderSubmittedPayload,
  OrderConfirmedPayload,
  OrderFailedPayload,
} from './types';
import { OrderStatus } from '../types/common';

/**
 * WebSocket message handlers and event broadcasters
 * Bridges execution engine events to WebSocket clients
 */
export class WebSocketHandlers {
  constructor(
    private wsManager: WebSocketManager,
    private executionEngine: ExecutionEngine
  ) {
    this.setupExecutionEventListeners();
  }

  /**
   * Setup listeners for execution engine events
   */
  private setupExecutionEventListeners(): void {
    this.executionEngine.on('execution_event', (event: any) => {
      this.handleExecutionEvent(event);
    });
  }

  /**
   * Handle execution engine events
   */
  private handleExecutionEvent(event: any): void {
    const { type, orderId, state, data, error, timestamp } = event;

    switch (type) {
      case 'state_change':
        this.handleStateChange(orderId, state, timestamp);
        break;
      case 'routing':
        this.handleRouting(orderId, data, timestamp);
        break;
      case 'submission':
        this.handleSubmission(orderId, data, timestamp);
        break;
      case 'confirmation':
        this.handleConfirmation(orderId, data, timestamp);
        break;
      case 'error':
        this.handleExecutionError(orderId, error, timestamp);
        break;
    }
  }

  /**
   * Handle state change event
   */
  private handleStateChange(orderId: string, state: any, timestamp: Date): void {
    // Map execution state to order status
    const statusMap: { [key: string]: OrderStatus } = {
      PENDING: OrderStatus.PENDING,
      ROUTING: OrderStatus.ROUTING,
      BUILDING: OrderStatus.BUILDING,
      SUBMITTED: OrderStatus.SUBMITTED,
      CONFIRMED: OrderStatus.CONFIRMED,
      FAILED: OrderStatus.FAILED,
    };

    const status = statusMap[state] || OrderStatus.PENDING;

    const payload: StatusUpdatePayload = {
      orderId,
      status,
      timestamp,
    };

    this.wsManager.broadcastStatusUpdate(payload);

    logger.info(`WebSocket broadcast: Order ${orderId} state changed to ${state}`);
  }

  /**
   * Handle routing event
   */
  private handleRouting(orderId: string, data: any, timestamp: Date): void {
    const payload: OrderRoutedPayload = {
      orderId,
      dexName: data.dexName || 'unknown',
      expectedOutput: data.expectedOutput || 0,
      priceImpact: data.priceImpact || 0,
      timestamp,
    };

    this.wsManager.broadcastOrderRouted(payload);

    logger.info(`WebSocket broadcast: Order ${orderId} routed through ${payload.dexName}`);
  }

  /**
   * Handle submission event
   */
  private handleSubmission(orderId: string, data: any, timestamp: Date): void {
    const payload: OrderSubmittedPayload = {
      orderId,
      txHash: data.txHash || '',
      timestamp,
    };

    this.wsManager.broadcastOrderSubmitted(payload);

    logger.info(`WebSocket broadcast: Order ${orderId} submitted with tx ${payload.txHash}`);
  }

  /**
   * Handle confirmation event
   */
  private handleConfirmation(orderId: string, data: any, timestamp: Date): void {
    const payload: OrderConfirmedPayload = {
      orderId,
      txHash: data.txHash || '',
      executionPrice: data.executionPrice || 0,
      totalTime: data.totalTime || 0,
      timestamp,
    };

    this.wsManager.broadcastOrderConfirmed(payload);

    logger.info(`WebSocket broadcast: Order ${orderId} confirmed`);
  }

  /**
   * Handle execution error event
   */
  private handleExecutionError(orderId: string, error: string, timestamp: Date): void {
    const payload: OrderFailedPayload = {
      orderId,
      error: error || 'Unknown error',
      timestamp,
    };

    this.wsManager.broadcastOrderFailed(payload);

    logger.error(`WebSocket broadcast: Order ${orderId} failed - ${error}`);
  }

  /**
   * Broadcast custom message to all clients
   */
  broadcastToAll(type: MessageType, payload: any): void {
    const message: WebSocketMessage = {
      type,
      payload,
      timestamp: new Date(),
    };

    this.wsManager.broadcastToAll(message);
  }

  /**
   * Broadcast custom message to order subscribers
   */
  broadcastToOrderSubscribers(orderId: string, type: MessageType, payload: any): void {
    const subscribers = this.wsManager.getOrderSubscribers(orderId);
    if (subscribers.length === 0) return;

    const message: WebSocketMessage = {
      type,
      orderId,
      payload,
      timestamp: new Date(),
    };

    subscribers.forEach((clientId) => {
      const client = this.wsManager.getClient(clientId);
      if (client) {
        try {
          client.socket.send(JSON.stringify(message));
        } catch (error: any) {
          logger.error(`Failed to broadcast to client ${clientId}: ${error.message}`);
        }
      }
    });
  }

  /**
   * Send notification to specific client
   */
  notifyClient(clientId: string, type: MessageType, payload: any): void {
    const client = this.wsManager.getClient(clientId);
    if (!client) return;

    const message: WebSocketMessage = {
      type,
      payload,
      timestamp: new Date(),
    };

    try {
      client.socket.send(JSON.stringify(message));
    } catch (error: any) {
      logger.error(`Failed to notify client ${clientId}: ${error.message}`);
    }
  }

  /**
   * Send status update to specific order
   */
  sendOrderStatus(orderId: string, status: OrderStatus): void {
    const payload: StatusUpdatePayload = {
      orderId,
      status,
      timestamp: new Date(),
    };

    this.wsManager.broadcastStatusUpdate(payload);
  }

  /**
   * Get active subscribers for an order
   */
  getOrderSubscribers(orderId: string): number {
    return this.wsManager.getSubscriptionCount(orderId);
  }

  /**
   * Get all connected clients count
   */
  getConnectedClientsCount(): number {
    return this.wsManager.getStats().activeConnections;
  }
}

/**
 * Helper function to create handlers
 */
export function createWebSocketHandlers(
  wsManager: WebSocketManager,
  executionEngine: ExecutionEngine
): WebSocketHandlers {
  return new WebSocketHandlers(wsManager, executionEngine);
}
