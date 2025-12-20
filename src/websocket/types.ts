import WebSocket = require('ws');
import { OrderStatus } from '../types/common';

/**
 * WebSocket message types
 */
export enum MessageType {
  SUBSCRIBE = 'subscribe',          // Subscribe to order updates
  UNSUBSCRIBE = 'unsubscribe',      // Unsubscribe from order
  STATUS_UPDATE = 'status',         // Order status update from server
  ORDER_ROUTED = 'routed',          // Order routed through DEX
  ORDER_SUBMITTED = 'submitted',    // Order submitted to blockchain
  ORDER_CONFIRMED = 'confirmed',    // Order confirmed on-chain
  ORDER_FAILED = 'failed',          // Order execution failed
  HEARTBEAT = 'heartbeat',          // Keep-alive ping
  ERROR = 'error',                  // Error message
  ACK = 'ack',                       // Acknowledgment
}

/**
 * WebSocket message structure
 */
export interface WebSocketMessage {
  type: MessageType;
  orderId?: string;
  payload?: any;
  timestamp: Date;
  sequenceNumber?: number;
}

/**
 * Client subscription model
 */
export interface ClientSubscription {
  orderId: string;
  subscribedAt: Date;
  lastUpdate?: Date;
}

/**
 * Client session model
 */
export interface ClientSession {
  clientId: string;
  socket: WebSocket;
  connectedAt: Date;
  lastHeartbeat: Date;
  subscriptions: Map<string, ClientSubscription>;
  isAlive: boolean;
  messageCount: number;
}

/**
 * WebSocket statistics
 */
export interface WebSocketStats {
  totalConnections: number;
  activeConnections: number;
  totalSubscriptions: number;
  totalMessages: number;
  messagesByType: {
    [key in MessageType]?: number;
  };
  averageSubscriptionsPerClient: number;
}

/**
 * Heartbeat configuration
 */
export interface HeartbeatConfig {
  interval: number;         // ms between heartbeats
  timeout: number;          // ms before connection considered dead
}

/**
 * Status update payload
 */
export interface StatusUpdatePayload {
  orderId: string;
  status: OrderStatus;
  executionPrice?: number;
  txHash?: string;
  error?: string;
  timestamp: Date;
}

/**
 * Order routing event payload
 */
export interface OrderRoutedPayload {
  orderId: string;
  dexName: string;
  expectedOutput: number;
  priceImpact: number;
  timestamp: Date;
}

/**
 * Order submitted payload
 */
export interface OrderSubmittedPayload {
  orderId: string;
  txHash: string;
  timestamp: Date;
}

/**
 * Order confirmed payload
 */
export interface OrderConfirmedPayload {
  orderId: string;
  txHash: string;
  executionPrice: number;
  totalTime: number;        // execution time in ms
  timestamp: Date;
}

/**
 * Order failed payload
 */
export interface OrderFailedPayload {
  orderId: string;
  error: string;
  timestamp: Date;
}

/**
 * WebSocket manager configuration
 */
export interface WebSocketConfig {
  heartbeat: HeartbeatConfig;
  maxClientsPerServer: number;
  maxSubscriptionsPerClient: number;
  messageQueueSize: number;
  enableCompression: boolean;
}

/**
 * Default WebSocket configuration
 */
export const DEFAULT_WEBSOCKET_CONFIG: WebSocketConfig = {
  heartbeat: {
    interval: 10000,        // 10 seconds
    timeout: 30000,         // 30 seconds
  },
  maxClientsPerServer: 10000,
  maxSubscriptionsPerClient: 100,
  messageQueueSize: 1000,
  enableCompression: true,
};

/**
 * WebSocket connection event
 */
export interface WebSocketEvent {
  type: 'client_connected' | 'client_disconnected' | 'client_subscribed' | 'client_unsubscribed' | 'message_sent' | 'error';
  clientId: string;
  orderId?: string;
  timestamp: Date;
  error?: string;
}
