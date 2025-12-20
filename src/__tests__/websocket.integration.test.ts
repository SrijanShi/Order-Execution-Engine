import { WebSocketManager } from '../websocket/manager';
import { MessageType } from '../websocket/types';
import WebSocket from 'ws';

/**
 * STEP 10: WebSocket Integration Tests
 * Tests WebSocket connection and message handling
 */
describe('WebSocket - Real-time Communication', () => {
  let manager: WebSocketManager;

  beforeEach(() => {
    manager = new WebSocketManager();
  });

  afterEach(() => {
    manager.reset();
  });

  test('should initialize WebSocket manager', () => {
    expect(manager).toBeDefined();
  });

  test('should get statistics', () => {
    const stats = manager.getStats();
    expect(stats).toBeDefined();
    expect(stats.totalConnections).toBe(0);
    expect(stats.activeConnections).toBe(0);
  });

  test('should get all clients', () => {
    const clients = manager.getAllClients();
    expect(Array.isArray(clients)).toBe(true);
    expect(clients.length).toBe(0);
  });

  test('should get order subscribers', () => {
    const subscribers = manager.getOrderSubscribers('test-order');
    expect(Array.isArray(subscribers)).toBe(true);
    expect(subscribers.length).toBe(0);
  });

  test('should get subscription count', () => {
    const count = manager.getSubscriptionCount('test-order');
    expect(typeof count).toBe('number');
    expect(count).toBe(0);
  });

  test('should reset manager state', () => {
    manager.reset();
    expect(manager.getStats().totalConnections).toBe(0);
  });

  test('should support event listeners', (done) => {
    manager.on('websocket_event', () => {
      // Event listener triggered
    });
    expect(manager.listenerCount('websocket_event')).toBeGreaterThan(0);
    done();
  });

  test('should broadcast to all clients', () => {
    expect(() => {
      manager.broadcastToAll({
        type: MessageType.STATUS_UPDATE,
        orderId: 'test',
        payload: { status: 'CONFIRMED' },
        timestamp: new Date(),
      });
    }).not.toThrow();
  });

  test('should handle concurrent operations', async () => {
    const operations = [];
    for (let i = 0; i < 3; i++) {
      operations.push(
        Promise.resolve().then(() => {
          expect(manager.getStats()).toBeDefined();
        })
      );
    }
    await Promise.all(operations);
  });

  test('should maintain consistent state across operations', () => {
    const stats1 = manager.getStats();
    const stats2 = manager.getStats();
    expect(stats1.totalConnections).toBe(stats2.totalConnections);
  });
});
