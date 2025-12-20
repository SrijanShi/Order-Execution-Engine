import { WebSocketManager } from '../manager';
import { WebSocketHandlers, createWebSocketHandlers } from '../handlers';
import { ExecutionEngine } from '../../execution/engine';
import { DexRouter } from '../../router/dex-router';
import { MessageType, WebSocketMessage, MessageType as MT, DEFAULT_WEBSOCKET_CONFIG } from '../types';
import { OrderStatus } from '../../types/common';
import { EventEmitter } from 'events';

// Mock WebSocket
class MockWebSocket extends EventEmitter {
  public sentMessages: string[] = [];
  public isOpen = true;
  public readyState = 1; // OPEN

  constructor() {
    super();
  }

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(): void {
    this.isOpen = false;
    this.readyState = 3; // CLOSED
    this.emit('close');
  }

  ping(): void {
    this.emit('pong');
  }
}

// Mock DexRouter
class MockDexRouter implements Partial<DexRouter> {
  async routeOrder(): Promise<any> {
    return {
      quotes: [
        {
          dexAddress: '0x1',
          amountOut: 1010,
          priceImpact: 0.01,
        },
      ],
      dexName: 'raydium',
      priceImpact: 0.01,
    };
  }
}

describe('WebSocketManager', () => {
  let wsManager: WebSocketManager;
  let executionEngine: ExecutionEngine;
  let mockRouter: MockDexRouter;

  beforeEach(() => {
    wsManager = new WebSocketManager(DEFAULT_WEBSOCKET_CONFIG);
    mockRouter = new MockDexRouter();
    executionEngine = new ExecutionEngine(mockRouter as any);
  });

  afterEach(() => {
    wsManager.reset();
  });

  describe('Client Registration', () => {
    test('should register a new client connection', () => {
      const socket = new MockWebSocket();
      const clientId = wsManager.registerClient(socket as any);

      expect(clientId).toBeDefined();
      expect(clientId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(wsManager.getClient(clientId)).toBeDefined();
    });

    test('should track total connections', () => {
      const socket1 = new MockWebSocket();
      const socket2 = new MockWebSocket();

      wsManager.registerClient(socket1 as any);
      wsManager.registerClient(socket2 as any);

      const stats = wsManager.getStats();
      expect(stats.totalConnections).toBe(2);
      expect(stats.activeConnections).toBe(2);
    });

    test('should initialize client with empty subscriptions', () => {
      const socket = new MockWebSocket();
      const clientId = wsManager.registerClient(socket as any);

      const client = wsManager.getClient(clientId);
      expect(client?.subscriptions.size).toBe(0);
      expect(client?.messageCount).toBe(0);
      expect(client?.isAlive).toBe(true);
    });

    test('should emit client_connected event', () => {
      const socket = new MockWebSocket();
      const events: any[] = [];

      wsManager.on('websocket_event', (event) => {
        events.push(event);
      });

      const clientId = wsManager.registerClient(socket as any);

      const connectionEvent = events.find((e) => e.type === 'client_connected');
      expect(connectionEvent).toBeDefined();
      expect(connectionEvent?.clientId).toBe(clientId);
    });
  });

  describe('Subscriptions', () => {
    test('should handle subscribe message', () => {
      const socket = new MockWebSocket();
      const clientId = wsManager.registerClient(socket as any);
      const mockSocket = socket as any;

      // Simulate subscribe message
      mockSocket.emit('message', JSON.stringify({
        type: MessageType.SUBSCRIBE,
        orderId: 'order-123',
      }));

      const client = wsManager.getClient(clientId);
      expect(client?.subscriptions.has('order-123')).toBe(true);
    });

    test('should prevent duplicate subscriptions', () => {
      const socket = new MockWebSocket();
      const clientId = wsManager.registerClient(socket as any);
      const mockSocket = socket as any;

      mockSocket.emit('message', JSON.stringify({
        type: MessageType.SUBSCRIBE,
        orderId: 'order-123',
      }));

      mockSocket.emit('message', JSON.stringify({
        type: MessageType.SUBSCRIBE,
        orderId: 'order-123',
      }));

      const client = wsManager.getClient(clientId);
      expect(client?.subscriptions.size).toBe(1);
    });

    test('should handle unsubscribe message', () => {
      const socket = new MockWebSocket();
      const clientId = wsManager.registerClient(socket as any);
      const mockSocket = socket as any;

      mockSocket.emit('message', JSON.stringify({
        type: MessageType.SUBSCRIBE,
        orderId: 'order-123',
      }));

      mockSocket.emit('message', JSON.stringify({
        type: MessageType.UNSUBSCRIBE,
        orderId: 'order-123',
      }));

      const client = wsManager.getClient(clientId);
      expect(client?.subscriptions.has('order-123')).toBe(false);
    });

    test('should track subscription count', () => {
      const socket = new MockWebSocket();
      const clientId = wsManager.registerClient(socket as any);
      const mockSocket = socket as any;

      mockSocket.emit('message', JSON.stringify({
        type: MessageType.SUBSCRIBE,
        orderId: 'order-123',
      }));

      expect(wsManager.getSubscriptionCount('order-123')).toBe(1);
    });

    test('should get order subscribers', () => {
      const socket1 = new MockWebSocket();
      const socket2 = new MockWebSocket();

      const clientId1 = wsManager.registerClient(socket1 as any);
      const clientId2 = wsManager.registerClient(socket2 as any);

      const mockSocket1 = socket1 as any;
      const mockSocket2 = socket2 as any;

      mockSocket1.emit('message', JSON.stringify({
        type: MessageType.SUBSCRIBE,
        orderId: 'order-123',
      }));

      mockSocket2.emit('message', JSON.stringify({
        type: MessageType.SUBSCRIBE,
        orderId: 'order-123',
      }));

      const subscribers = wsManager.getOrderSubscribers('order-123');
      expect(subscribers.length).toBe(2);
      expect(subscribers).toContain(clientId1);
      expect(subscribers).toContain(clientId2);
    });

    test('should emit subscription events', () => {
      const socket = new MockWebSocket();
      const clientId = wsManager.registerClient(socket as any);
      const events: any[] = [];

      wsManager.on('websocket_event', (event) => {
        events.push(event);
      });

      const mockSocket = socket as any;
      mockSocket.emit('message', JSON.stringify({
        type: MessageType.SUBSCRIBE,
        orderId: 'order-123',
      }));

      const subEvent = events.find((e) => e.type === 'client_subscribed');
      expect(subEvent).toBeDefined();
      expect(subEvent?.orderId).toBe('order-123');
    });
  });

  describe('Broadcasting', () => {
    test('should broadcast status update to subscribers', () => {
      const socket = new MockWebSocket();
      const clientId = wsManager.registerClient(socket as any);
      const mockSocket = socket as any;

      mockSocket.emit('message', JSON.stringify({
        type: MessageType.SUBSCRIBE,
        orderId: 'order-123',
      }));

      wsManager.broadcastStatusUpdate({
        orderId: 'order-123',
        status: OrderStatus.CONFIRMED,
        timestamp: new Date(),
      });

      const messages = (mockSocket as any).sentMessages;
      const statusMessages = messages.filter((m: string) => {
        const parsed = JSON.parse(m);
        return parsed.type === MessageType.STATUS_UPDATE;
      });

      expect(statusMessages.length).toBeGreaterThan(0);
    });

    test('should broadcast order routed event', () => {
      const socket = new MockWebSocket();
      const clientId = wsManager.registerClient(socket as any);
      const mockSocket = socket as any;

      mockSocket.emit('message', JSON.stringify({
        type: MessageType.SUBSCRIBE,
        orderId: 'order-123',
      }));

      wsManager.broadcastOrderRouted({
        orderId: 'order-123',
        dexName: 'raydium',
        expectedOutput: 1010,
        priceImpact: 0.01,
        timestamp: new Date(),
      });

      const messages = (mockSocket as any).sentMessages;
      const routedMessages = messages.filter((m: string) => {
        const parsed = JSON.parse(m);
        return parsed.type === MessageType.ORDER_ROUTED;
      });

      expect(routedMessages.length).toBeGreaterThan(0);
    });

    test('should broadcast order submitted event', () => {
      const socket = new MockWebSocket();
      const clientId = wsManager.registerClient(socket as any);
      const mockSocket = socket as any;

      mockSocket.emit('message', JSON.stringify({
        type: MessageType.SUBSCRIBE,
        orderId: 'order-123',
      }));

      wsManager.broadcastOrderSubmitted({
        orderId: 'order-123',
        txHash: '0x123abc',
        timestamp: new Date(),
      });

      const messages = (mockSocket as any).sentMessages;
      const submittedMessages = messages.filter((m: string) => {
        const parsed = JSON.parse(m);
        return parsed.type === MessageType.ORDER_SUBMITTED;
      });

      expect(submittedMessages.length).toBeGreaterThan(0);
    });

    test('should broadcast order confirmed event', () => {
      const socket = new MockWebSocket();
      const clientId = wsManager.registerClient(socket as any);
      const mockSocket = socket as any;

      mockSocket.emit('message', JSON.stringify({
        type: MessageType.SUBSCRIBE,
        orderId: 'order-123',
      }));

      wsManager.broadcastOrderConfirmed({
        orderId: 'order-123',
        txHash: '0x123abc',
        executionPrice: 1010,
        totalTime: 1000,
        timestamp: new Date(),
      });

      const messages = (mockSocket as any).sentMessages;
      const confirmedMessages = messages.filter((m: string) => {
        const parsed = JSON.parse(m);
        return parsed.type === MessageType.ORDER_CONFIRMED;
      });

      expect(confirmedMessages.length).toBeGreaterThan(0);
    });

    test('should broadcast order failed event', () => {
      const socket = new MockWebSocket();
      const clientId = wsManager.registerClient(socket as any);
      const mockSocket = socket as any;

      mockSocket.emit('message', JSON.stringify({
        type: MessageType.SUBSCRIBE,
        orderId: 'order-123',
      }));

      wsManager.broadcastOrderFailed({
        orderId: 'order-123',
        error: 'Insufficient liquidity',
        timestamp: new Date(),
      });

      const messages = (mockSocket as any).sentMessages;
      const failedMessages = messages.filter((m: string) => {
        const parsed = JSON.parse(m);
        return parsed.type === MessageType.ORDER_FAILED;
      });

      expect(failedMessages.length).toBeGreaterThan(0);
    });

    test('should not broadcast to unsubscribed clients', () => {
      const socket1 = new MockWebSocket();
      const socket2 = new MockWebSocket();

      wsManager.registerClient(socket1 as any);
      const clientId2 = wsManager.registerClient(socket2 as any);

      const mockSocket2 = socket2 as any;
      mockSocket2.emit('message', JSON.stringify({
        type: MessageType.SUBSCRIBE,
        orderId: 'order-123',
      }));

      wsManager.broadcastStatusUpdate({
        orderId: 'order-123',
        status: OrderStatus.CONFIRMED,
        timestamp: new Date(),
      });

      const socket1Messages = (socket1 as any).sentMessages;
      const statusMessages = socket1Messages.filter((m: string) => {
        try {
          const parsed = JSON.parse(m);
          return parsed.type === MessageType.STATUS_UPDATE;
        } catch {
          return false;
        }
      });

      expect(statusMessages.length).toBe(0);
    });
  });

  describe('Client Disconnection', () => {
    test('should handle client disconnect', () => {
      const socket = new MockWebSocket();
      const clientId = wsManager.registerClient(socket as any);
      const mockSocket = socket as any;

      expect(wsManager.getClient(clientId)).toBeDefined();

      mockSocket.emit('close');

      expect(wsManager.getClient(clientId)).toBeUndefined();
    });

    test('should clean up subscriptions on disconnect', () => {
      const socket = new MockWebSocket();
      const clientId = wsManager.registerClient(socket as any);
      const mockSocket = socket as any;

      mockSocket.emit('message', JSON.stringify({
        type: MessageType.SUBSCRIBE,
        orderId: 'order-123',
      }));

      expect(wsManager.getSubscriptionCount('order-123')).toBe(1);

      mockSocket.emit('close');

      expect(wsManager.getSubscriptionCount('order-123')).toBe(0);
    });

    test('should emit client_disconnected event', () => {
      const socket = new MockWebSocket();
      const clientId = wsManager.registerClient(socket as any);
      const events: any[] = [];

      wsManager.on('websocket_event', (event) => {
        events.push(event);
      });

      const mockSocket = socket as any;
      mockSocket.emit('close');

      const disconnectEvent = events.find((e) => e.type === 'client_disconnected');
      expect(disconnectEvent).toBeDefined();
      expect(disconnectEvent?.clientId).toBe(clientId);
    });

    test('should decrement active connection count', () => {
      const socket = new MockWebSocket();
      wsManager.registerClient(socket as any);

      expect(wsManager.getStats().activeConnections).toBe(1);

      const mockSocket = socket as any;
      mockSocket.emit('close');

      expect(wsManager.getStats().activeConnections).toBe(0);
    });
  });

  describe('Statistics', () => {
    test('should track message count', () => {
      const socket = new MockWebSocket();
      const clientId = wsManager.registerClient(socket as any);
      const mockSocket = socket as any;

      mockSocket.emit('message', JSON.stringify({
        type: MessageType.SUBSCRIBE,
        orderId: 'order-123',
      }));

      wsManager.broadcastStatusUpdate({
        orderId: 'order-123',
        status: OrderStatus.CONFIRMED,
        timestamp: new Date(),
      });

      const stats = wsManager.getStats();
      expect(stats.totalMessages).toBeGreaterThan(0);
    });

    test('should calculate average subscriptions per client', () => {
      const socket1 = new MockWebSocket();
      const socket2 = new MockWebSocket();

      const clientId1 = wsManager.registerClient(socket1 as any);
      const clientId2 = wsManager.registerClient(socket2 as any);

      const mockSocket1 = socket1 as any;
      const mockSocket2 = socket2 as any;

      mockSocket1.emit('message', JSON.stringify({
        type: MessageType.SUBSCRIBE,
        orderId: 'order-123',
      }));

      mockSocket1.emit('message', JSON.stringify({
        type: MessageType.SUBSCRIBE,
        orderId: 'order-456',
      }));

      mockSocket2.emit('message', JSON.stringify({
        type: MessageType.SUBSCRIBE,
        orderId: 'order-789',
      }));

      const stats = wsManager.getStats();
      expect(stats.averageSubscriptionsPerClient).toBeCloseTo(1.5, 1);
    });

    test('should track subscription count', () => {
      const socket = new MockWebSocket();
      const clientId = wsManager.registerClient(socket as any);
      const mockSocket = socket as any;

      mockSocket.emit('message', JSON.stringify({
        type: MessageType.SUBSCRIBE,
        orderId: 'order-123',
      }));

      mockSocket.emit('message', JSON.stringify({
        type: MessageType.SUBSCRIBE,
        orderId: 'order-456',
      }));

      const stats = wsManager.getStats();
      expect(stats.totalSubscriptions).toBe(2);
    });
  });

  describe('Reset', () => {
    test('should reset all state', () => {
      const socket = new MockWebSocket();
      wsManager.registerClient(socket as any);

      wsManager.reset();

      const stats = wsManager.getStats();
      expect(stats.activeConnections).toBe(0);
      expect(stats.totalConnections).toBe(0);
      expect(stats.totalSubscriptions).toBe(0);
      expect(stats.totalMessages).toBe(0);
    });

    test('should disconnect all clients on reset', () => {
      const socket1 = new MockWebSocket();
      const socket2 = new MockWebSocket();

      const clientId1 = wsManager.registerClient(socket1 as any);
      const clientId2 = wsManager.registerClient(socket2 as any);

      wsManager.reset();

      expect(wsManager.getClient(clientId1)).toBeUndefined();
      expect(wsManager.getClient(clientId2)).toBeUndefined();
    });
  });

  describe('Get All Clients', () => {
    test('should return all connected clients', () => {
      const socket1 = new MockWebSocket();
      const socket2 = new MockWebSocket();

      wsManager.registerClient(socket1 as any);
      wsManager.registerClient(socket2 as any);

      const clients = wsManager.getAllClients();
      expect(clients.length).toBe(2);
    });

    test('should return empty array when no clients', () => {
      const clients = wsManager.getAllClients();
      expect(clients.length).toBe(0);
    });
  });

  describe('Disconnect Client', () => {
    test('should disconnect specific client', () => {
      const socket = new MockWebSocket();
      const clientId = wsManager.registerClient(socket as any);

      const result = wsManager.disconnectClient(clientId);

      expect(result).toBe(true);
      expect(wsManager.getClient(clientId)).toBeUndefined();
    });

    test('should return false for non-existent client', () => {
      const result = wsManager.disconnectClient('non-existent');
      expect(result).toBe(false);
    });
  });
});

describe('WebSocketHandlers', () => {
  let wsManager: WebSocketManager;
  let executionEngine: ExecutionEngine;
  let handlers: WebSocketHandlers;
  let mockRouter: MockDexRouter;

  beforeEach(() => {
    mockRouter = new MockDexRouter();
    wsManager = new WebSocketManager(DEFAULT_WEBSOCKET_CONFIG);
    executionEngine = new ExecutionEngine(mockRouter as any);
    handlers = createWebSocketHandlers(wsManager, executionEngine);
  });

  describe('Handler Creation', () => {
    test('should create handlers successfully', () => {
      expect(handlers).toBeDefined();
      expect(handlers).toBeInstanceOf(WebSocketHandlers);
    });

    test('should setup execution event listeners', async () => {
      const socket = new MockWebSocket();
      const clientId = wsManager.registerClient(socket as any);
      const mockSocket = socket as any;

      mockSocket.emit('message', JSON.stringify({
        type: MessageType.SUBSCRIBE,
        orderId: 'order-123',
      }));

      // Simulate execution event
      executionEngine.emit('execution_event', {
        type: 'state_change',
        orderId: 'order-123',
        state: 'ROUTING',
        timestamp: new Date(),
      });

      // Wait a bit for async event processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      const stats = wsManager.getStats();
      expect(stats.totalMessages).toBeGreaterThan(0);
    });
  });

  describe('Notification Methods', () => {
    test('should get order subscribers count', () => {
      const socket = new MockWebSocket();
      wsManager.registerClient(socket as any);
      const mockSocket = socket as any;

      mockSocket.emit('message', JSON.stringify({
        type: MessageType.SUBSCRIBE,
        orderId: 'order-123',
      }));

      const count = handlers.getOrderSubscribers('order-123');
      expect(count).toBe(1);
    });

    test('should get connected clients count', () => {
      const socket1 = new MockWebSocket();
      const socket2 = new MockWebSocket();

      wsManager.registerClient(socket1 as any);
      wsManager.registerClient(socket2 as any);

      const count = handlers.getConnectedClientsCount();
      expect(count).toBe(2);
    });

    test('should send order status', () => {
      const socket = new MockWebSocket();
      const clientId = wsManager.registerClient(socket as any);
      const mockSocket = socket as any;

      mockSocket.emit('message', JSON.stringify({
        type: MessageType.SUBSCRIBE,
        orderId: 'order-123',
      }));

      handlers.sendOrderStatus('order-123', OrderStatus.CONFIRMED);

      const messages = (mockSocket as any).sentMessages;
      const statusMessages = messages.filter((m: string) => {
        try {
          const parsed = JSON.parse(m);
          return parsed.type === MessageType.STATUS_UPDATE;
        } catch {
          return false;
        }
      });

      expect(statusMessages.length).toBeGreaterThan(0);
    });
  });

  describe('Broadcasting Methods', () => {
    test('should broadcast to all clients', () => {
      const socket1 = new MockWebSocket();
      const socket2 = new MockWebSocket();

      wsManager.registerClient(socket1 as any);
      wsManager.registerClient(socket2 as any);

      handlers.broadcastToAll(MessageType.HEARTBEAT, {});

      const messages1 = (socket1 as any).sentMessages;
      const messages2 = (socket2 as any).sentMessages;

      expect(messages1.length).toBeGreaterThan(0);
      expect(messages2.length).toBeGreaterThan(0);
    });
  });
});
