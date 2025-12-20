import { EventEmitter } from 'events';
import WebSocket = require('ws');
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import {
  ClientSession,
  ClientSubscription,
  WebSocketMessage,
  MessageType,
  WebSocketStats,
  WebSocketConfig,
  WebSocketEvent,
  StatusUpdatePayload,
  OrderRoutedPayload,
  OrderSubmittedPayload,
  OrderConfirmedPayload,
  OrderFailedPayload,
  DEFAULT_WEBSOCKET_CONFIG,
} from './types';

/**
 * WebSocketManager
 * Manages WebSocket connections, subscriptions, and real-time order status updates
 */
export class WebSocketManager extends EventEmitter {
  private clients: Map<string, ClientSession> = new Map();
  private subscriptions: Map<string, Set<string>> = new Map(); // orderId -> clientIds
  private config: WebSocketConfig;
  private heartbeatIntervals: Map<string, NodeJS.Timeout> = new Map();
  private stats: WebSocketStats = {
    totalConnections: 0,
    activeConnections: 0,
    totalSubscriptions: 0,
    totalMessages: 0,
    messagesByType: {},
    averageSubscriptionsPerClient: 0,
  };
  private messageSequence = 0;

  constructor(config: WebSocketConfig = DEFAULT_WEBSOCKET_CONFIG) {
    super();
    this.config = config;
  }

  /**
   * Register a new client connection
   */
  registerClient(socket: WebSocket): string {
    const clientId = uuidv4();

    const session: ClientSession = {
      clientId,
      socket,
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
      subscriptions: new Map(),
      isAlive: true,
      messageCount: 0,
    };

    this.clients.set(clientId, session);
    this.stats.totalConnections++;
    this.stats.activeConnections++;

    // Setup socket event handlers
    this.setupSocketHandlers(clientId, socket);

    logger.info(`Client connected: ${clientId}`);
    this.emitEvent({
      type: 'client_connected',
      clientId,
      timestamp: new Date(),
    });

    // Start heartbeat for this client
    this.startHeartbeat(clientId);

    return clientId;
  }

  /**
   * Setup socket event handlers
   */
  private setupSocketHandlers(clientId: string, socket: WebSocket): void {
    socket.on('message', (data: string) => {
      try {
        const message = JSON.parse(data);
        this.handleMessage(clientId, message);
      } catch (error: any) {
        logger.error(`Message parse error for ${clientId}: ${error.message}`);
        this.sendError(clientId, 'Invalid message format');
      }
    });

    socket.on('close', () => {
      this.handleClientDisconnect(clientId);
    });

    socket.on('error', (error: any) => {
      logger.error(`Socket error for ${clientId}: ${error.message}`);
      this.emitEvent({
        type: 'error',
        clientId,
        timestamp: new Date(),
        error: error.message,
      });
    });

    socket.on('pong', () => {
      const session = this.clients.get(clientId);
      if (session) {
        session.lastHeartbeat = new Date();
        session.isAlive = true;
      }
    });
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(clientId: string, message: any): void {
    const session = this.clients.get(clientId);
    if (!session) return;

    const type = message.type as MessageType;
    const orderId = message.orderId as string;

    switch (type) {
      case MessageType.SUBSCRIBE:
        this.handleSubscribe(clientId, orderId);
        break;
      case MessageType.UNSUBSCRIBE:
        this.handleUnsubscribe(clientId, orderId);
        break;
      default:
        this.sendError(clientId, `Unknown message type: ${type}`);
    }
  }

  /**
   * Handle subscribe request
   */
  private handleSubscribe(clientId: string, orderId: string): void {
    const session = this.clients.get(clientId);
    if (!session) return;

    // Check limits
    if (session.subscriptions.size >= this.config.maxSubscriptionsPerClient) {
      this.sendError(clientId, 'Max subscriptions reached');
      return;
    }

    // Check if already subscribed
    if (session.subscriptions.has(orderId)) {
      this.sendAck(clientId, MessageType.SUBSCRIBE, orderId);
      return;
    }

    // Add subscription
    const subscription: ClientSubscription = {
      orderId,
      subscribedAt: new Date(),
    };

    session.subscriptions.set(orderId, subscription);

    // Add to global subscriptions map
    if (!this.subscriptions.has(orderId)) {
      this.subscriptions.set(orderId, new Set());
    }
    this.subscriptions.get(orderId)!.add(clientId);

    this.stats.totalSubscriptions++;

    logger.info(`Client ${clientId} subscribed to order ${orderId}`);
    this.sendAck(clientId, MessageType.SUBSCRIBE, orderId);

    this.emitEvent({
      type: 'client_subscribed',
      clientId,
      orderId,
      timestamp: new Date(),
    });
  }

  /**
   * Handle unsubscribe request
   */
  private handleUnsubscribe(clientId: string, orderId: string): void {
    const session = this.clients.get(clientId);
    if (!session) return;

    if (session.subscriptions.has(orderId)) {
      session.subscriptions.delete(orderId);

      const orderSubscribers = this.subscriptions.get(orderId);
      if (orderSubscribers) {
        orderSubscribers.delete(clientId);
        if (orderSubscribers.size === 0) {
          this.subscriptions.delete(orderId);
        }
      }

      this.stats.totalSubscriptions--;

      logger.info(`Client ${clientId} unsubscribed from order ${orderId}`);
      this.sendAck(clientId, MessageType.UNSUBSCRIBE, orderId);

      this.emitEvent({
        type: 'client_unsubscribed',
        clientId,
        orderId,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Broadcast status update to subscribed clients
   */
  broadcastStatusUpdate(payload: StatusUpdatePayload): void {
    const subscribers = this.subscriptions.get(payload.orderId);
    if (!subscribers || subscribers.size === 0) return;

    const message: WebSocketMessage = {
      type: MessageType.STATUS_UPDATE,
      orderId: payload.orderId,
      payload,
      timestamp: new Date(),
      sequenceNumber: this.messageSequence++,
    };

    subscribers.forEach((clientId) => {
      this.sendMessage(clientId, message);
    });
  }

  /**
   * Broadcast order routed event
   */
  broadcastOrderRouted(payload: OrderRoutedPayload): void {
    const subscribers = this.subscriptions.get(payload.orderId);
    if (!subscribers || subscribers.size === 0) return;

    const message: WebSocketMessage = {
      type: MessageType.ORDER_ROUTED,
      orderId: payload.orderId,
      payload,
      timestamp: new Date(),
      sequenceNumber: this.messageSequence++,
    };

    subscribers.forEach((clientId) => {
      this.sendMessage(clientId, message);
    });
  }

  /**
   * Broadcast order submitted event
   */
  broadcastOrderSubmitted(payload: OrderSubmittedPayload): void {
    const subscribers = this.subscriptions.get(payload.orderId);
    if (!subscribers || subscribers.size === 0) return;

    const message: WebSocketMessage = {
      type: MessageType.ORDER_SUBMITTED,
      orderId: payload.orderId,
      payload,
      timestamp: new Date(),
      sequenceNumber: this.messageSequence++,
    };

    subscribers.forEach((clientId) => {
      this.sendMessage(clientId, message);
    });
  }

  /**
   * Broadcast order confirmed event
   */
  broadcastOrderConfirmed(payload: OrderConfirmedPayload): void {
    const subscribers = this.subscriptions.get(payload.orderId);
    if (!subscribers || subscribers.size === 0) return;

    const message: WebSocketMessage = {
      type: MessageType.ORDER_CONFIRMED,
      orderId: payload.orderId,
      payload,
      timestamp: new Date(),
      sequenceNumber: this.messageSequence++,
    };

    subscribers.forEach((clientId) => {
      this.sendMessage(clientId, message);
    });
  }

  /**
   * Broadcast order failed event
   */
  broadcastOrderFailed(payload: OrderFailedPayload): void {
    const subscribers = this.subscriptions.get(payload.orderId);
    if (!subscribers || subscribers.size === 0) return;

    const message: WebSocketMessage = {
      type: MessageType.ORDER_FAILED,
      orderId: payload.orderId,
      payload,
      timestamp: new Date(),
      sequenceNumber: this.messageSequence++,
    };

    subscribers.forEach((clientId) => {
      this.sendMessage(clientId, message);
    });
  }

  /**
   * Send message to specific client
   */
  private sendMessage(clientId: string, message: WebSocketMessage): void {
    const session = this.clients.get(clientId);
    if (!session || session.socket.readyState !== WebSocket.OPEN) return;

    try {
      session.socket.send(JSON.stringify(message));
      session.messageCount++;
      this.stats.totalMessages++;

      const messageType = message.type;
      if (!this.stats.messagesByType[messageType]) {
        this.stats.messagesByType[messageType] = 0;
      }
      this.stats.messagesByType[messageType]!++;

      this.emitEvent({
        type: 'message_sent',
        clientId,
        orderId: message.orderId,
        timestamp: new Date(),
      });
    } catch (error: any) {
      logger.error(`Failed to send message to ${clientId}: ${error.message}`);
    }
  }

  /**
   * Send acknowledgment
   */
  private sendAck(clientId: string, acknowledging: MessageType, orderId?: string): void {
    const message: WebSocketMessage = {
      type: MessageType.ACK,
      orderId,
      payload: { acknowledging },
      timestamp: new Date(),
      sequenceNumber: this.messageSequence++,
    };

    this.sendMessage(clientId, message);
  }

  /**
   * Send error message
   */
  private sendError(clientId: string, error: string): void {
    const message: WebSocketMessage = {
      type: MessageType.ERROR,
      payload: { error },
      timestamp: new Date(),
      sequenceNumber: this.messageSequence++,
    };

    this.sendMessage(clientId, message);
  }

  /**
   * Start heartbeat for client
   */
  private startHeartbeat(clientId: string): void {
    const interval = setInterval(() => {
      const session = this.clients.get(clientId);
      if (!session) {
        clearInterval(interval);
        return;
      }

      if (!session.isAlive) {
        // Client is not responding to ping
        this.handleClientDisconnect(clientId);
        clearInterval(interval);
        return;
      }

      session.isAlive = false;

      const message: WebSocketMessage = {
        type: MessageType.HEARTBEAT,
        timestamp: new Date(),
        sequenceNumber: this.messageSequence++,
      };

      try {
        if (session.socket.readyState === WebSocket.OPEN) {
          session.socket.ping();
        }
      } catch (error: any) {
        logger.error(`Heartbeat error for ${clientId}: ${error.message}`);
        clearInterval(interval);
      }
    }, this.config.heartbeat.interval);

    this.heartbeatIntervals.set(clientId, interval);
  }

  /**
   * Handle client disconnect
   */
  private handleClientDisconnect(clientId: string): void {
    const session = this.clients.get(clientId);
    if (!session) return;

    // Clear heartbeat
    const interval = this.heartbeatIntervals.get(clientId);
    if (interval) {
      clearInterval(interval);
      this.heartbeatIntervals.delete(clientId);
    }

    // Clean up subscriptions
    session.subscriptions.forEach((_, orderId) => {
      const subscribers = this.subscriptions.get(orderId);
      if (subscribers) {
        subscribers.delete(clientId);
        if (subscribers.size === 0) {
          this.subscriptions.delete(orderId);
        }
      }
    });

    this.stats.totalSubscriptions -= session.subscriptions.size;
    this.stats.activeConnections--;

    this.clients.delete(clientId);

    logger.info(`Client disconnected: ${clientId}`);
    this.emitEvent({
      type: 'client_disconnected',
      clientId,
      timestamp: new Date(),
    });
  }

  /**
   * Get client session
   */
  getClient(clientId: string): ClientSession | undefined {
    return this.clients.get(clientId);
  }

  /**
   * Get all clients
   */
  getAllClients(): ClientSession[] {
    return Array.from(this.clients.values());
  }

  /**
   * Get subscribers for an order
   */
  getOrderSubscribers(orderId: string): string[] {
    const subscribers = this.subscriptions.get(orderId);
    return subscribers ? Array.from(subscribers) : [];
  }

  /**
   * Get statistics
   */
  getStats(): WebSocketStats {
    this.stats.averageSubscriptionsPerClient =
      this.stats.activeConnections > 0
        ? this.stats.totalSubscriptions / this.stats.activeConnections
        : 0;

    return { ...this.stats };
  }

  /**
   * Broadcast message to all connected clients
   */
  broadcastToAll(message: WebSocketMessage): void {
    this.clients.forEach((session, clientId) => {
      this.sendMessage(clientId, message);
    });
  }

  /**
   * Disconnect a client
   */
  disconnectClient(clientId: string): boolean {
    const session = this.clients.get(clientId);
    if (!session) return false;

    try {
      session.socket.close();
      return true;
    } catch (error: any) {
      logger.error(`Error disconnecting client ${clientId}: ${error.message}`);
      return false;
    }
  }

  /**
   * Get subscription count for order
   */
  getSubscriptionCount(orderId: string): number {
    const subscribers = this.subscriptions.get(orderId);
    return subscribers ? subscribers.size : 0;
  }

  /**
   * Emit WebSocket event
   */
  private emitEvent(event: WebSocketEvent): void {
    this.emit('websocket_event', event);
  }

  /**
   * Reset manager state
   */
  reset(): void {
    // Disconnect all clients
    this.clients.forEach((session, clientId) => {
      this.disconnectClient(clientId);
    });

    // Clear all intervals
    this.heartbeatIntervals.forEach((interval) => {
      clearInterval(interval);
    });

    // Reset collections
    this.clients.clear();
    this.subscriptions.clear();
    this.heartbeatIntervals.clear();

    // Reset statistics
    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      totalSubscriptions: 0,
      totalMessages: 0,
      messagesByType: {},
      averageSubscriptionsPerClient: 0,
    };

    this.messageSequence = 0;

    logger.info('WebSocket manager reset');
  }
}
