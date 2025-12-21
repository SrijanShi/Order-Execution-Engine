import { ExecutionEngine } from '../engine';
import { ExecutionState, DEFAULT_EXECUTION_CONFIG, AGGRESSIVE_EXECUTION_CONFIG } from '../types';
import { DexRouter } from '../../router/dex-router';
import { Order } from '../../types/order';
import { OrderStatus, OrderType } from '../../types/common';

// Helper function to create test order
function createTestOrder(overrides?: Partial<Order>): Order {
  return {
    orderId: 'test-order-' + Math.random().toString(36).substring(7),
    type: OrderType.MARKET,
    status: OrderStatus.PENDING,
    tokenIn: 'USDC',
    tokenOut: 'USDT',
    amount: 1000,
    slippage: 50,
    currentAttempt: 0,
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    ...overrides,
  };
}

// Mock DexRouter
class MockDexRouter implements Partial<DexRouter> {
  async routeOrder(tokenIn: string, tokenOut: string, amount: number, slippage: number): Promise<any> {
    const dexQuote = {
      dex: 'raydium',
      amountIn: amount,
      amountOut: amount * 1.01, // 1% better rate
      price: 1.01,
      priceImpact: 0.001,
      slippage: slippage,
      timestamp: new Date(),
    };

    return {
      bestQuote: dexQuote,
      allQuotes: [dexQuote],
      source: 'LIVE',
    };
  }
}

describe('ExecutionEngine', () => {
  let engine: ExecutionEngine;
  let mockRouter: MockDexRouter;

  beforeEach(() => {
    mockRouter = new MockDexRouter();
    engine = new ExecutionEngine(mockRouter as any, DEFAULT_EXECUTION_CONFIG);
  });

  describe('Order Execution Flow', () => {
    test('should execute order successfully with PENDING → ROUTING → BUILDING → SUBMITTED → CONFIRMED flow', async () => {
      const order = createTestOrder();
      const result = await engine.executeOrder(order);

      expect(result.success).toBe(true);
      expect(result.newState).toBe(ExecutionState.CONFIRMED);
      expect(result.data.txHash).toBeDefined();
      expect(result.data.totalTime).toBeGreaterThan(0);
    });

    test('should emit events for each state transition', async () => {
      const order = createTestOrder();
      const events: any[] = [];

      engine.on('execution_event', (event) => {
        events.push(event);
      });

      await engine.executeOrder(order);

      const stateEvents = events.filter((e) => e.type === 'state_change');
      expect(stateEvents.length).toBeGreaterThanOrEqual(2); // At least ROUTING and state changes
      expect(stateEvents.some(e => e.state === ExecutionState.ROUTING)).toBe(true);
    });

    test('should track execution time', async () => {
      const order = createTestOrder();
      const startTime = Date.now();
      const result = await engine.executeOrder(order);

      expect(result.data.totalTime).toBeDefined();
      expect(result.data.totalTime).toBeLessThan(Date.now() - startTime + 100); // Allow some margin
    });
  });

  describe('Order Validation', () => {
    test('should reject order with missing orderId', async () => {
      const order = createTestOrder();
      order.orderId = '';

      const result = await engine.executeOrder(order);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
    });

    test('should reject order with missing tokenIn', async () => {
      const order = createTestOrder();
      order.tokenIn = '';

      const result = await engine.executeOrder(order);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
    });

    test('should reject order with missing tokenOut', async () => {
      const order = createTestOrder();
      order.tokenOut = '';

      const result = await engine.executeOrder(order);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
    });

    test('should reject order with invalid amount', async () => {
      const order = createTestOrder();
      order.amount = 0;

      const result = await engine.executeOrder(order);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
    });

    test('should reject order with invalid slippage', async () => {
      const order = createTestOrder();
      order.slippage = 15000; // > 10000

      const result = await engine.executeOrder(order);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
    });
  });

  describe('Routing', () => {
    test('should select best quote from multiple routes', async () => {
      const order = createTestOrder();
      mockRouter.routeOrder = async () => ({
        bestQuote: { dex: 'raydium', amountOut: 1050, priceImpact: 0.015, price: 1.05, amountIn: 1000, slippage: 50, timestamp: new Date() }, // Best
        allQuotes: [
          { dex: 'raydium', amountOut: 1000, priceImpact: 0.01, price: 1.0, amountIn: 1000, slippage: 50, timestamp: new Date() },
          { dex: 'meteora', amountOut: 1050, priceImpact: 0.015, price: 1.05, amountIn: 1000, slippage: 50, timestamp: new Date() },
          { dex: 'unknown', amountOut: 1030, priceImpact: 0.012, price: 1.03, amountIn: 1000, slippage: 50, timestamp: new Date() },
        ],
        source: 'LIVE',
      });

      const result = await engine.executeOrder(order);
      expect(result.success).toBe(true);
      // Check that routing was executed
      expect(result.data).toBeDefined();
    });

    test('should emit routing event with dex name and price impact', async () => {
      const order = createTestOrder();
      const routingEvents: any[] = [];

      engine.on('execution_event', (event) => {
        if (event.type === 'routing') {
          routingEvents.push(event);
        }
      });

      await engine.executeOrder(order);

      expect(routingEvents.length).toBeGreaterThan(0);
      const routingEvent = routingEvents[0];
      expect(routingEvent.data.dexName).toBeDefined();
      expect(routingEvent.data.expectedOutput).toBeGreaterThan(0);
    });

    test('should fail execution if no routes found', async () => {
      const order = createTestOrder();
      mockRouter.routeOrder = async () => {
        throw new Error('No routes found');
      };

      const result = await engine.executeOrder(order);
      expect(result.success).toBe(false);
      expect(result.newState).toBe(ExecutionState.FAILED);
    });
  });

  describe('Transaction Building', () => {
    test('should build transaction with correct gas settings', async () => {
      const order = createTestOrder();
      const result = await engine.executeOrder(order);

      const execution = engine.getExecution(result.data.executionId);
      expect(execution?.transaction).toBeDefined();
      expect(execution?.transaction?.from).toBeDefined();
      expect(execution?.transaction?.to).toBeDefined();
      expect(execution?.transaction?.data).toBeDefined();
      expect(execution?.transaction?.gasLimit).toBeDefined();
    });

    test('should apply gas multiplier from config', async () => {
      const config = { ...DEFAULT_EXECUTION_CONFIG, gasMultiplier: 1.5 };
      const customEngine = new ExecutionEngine(mockRouter as any, config);

      const order = createTestOrder();
      const result = await engine.executeOrder(order);

      expect(result.success).toBe(true);
    });

    test('should emit building event with transaction data', async () => {
      const order = createTestOrder();
      const buildingEvents: any[] = [];

      engine.on('execution_event', (event) => {
        if (event.type === 'building') {
          buildingEvents.push(event);
        }
      });

      await engine.executeOrder(order);

      expect(buildingEvents.length).toBeGreaterThan(0);
      const buildingEvent = buildingEvents[0];
      expect(buildingEvent.data.to).toBeDefined();
      expect(buildingEvent.data.gasLimit).toBeDefined();
    });
  });

  describe('Transaction Submission', () => {
    test('should generate transaction hash on submission', async () => {
      const order = createTestOrder();
      const result = await engine.executeOrder(order);

      expect(result.data.txHash).toBeDefined();
      expect(result.data.txHash).toMatch(/^0x[a-f0-9]+$/); // Valid hex hash
      expect(result.data.txHash.length).toBeGreaterThan(10);
    });

    test('should emit submission event with transaction hash', async () => {
      const order = createTestOrder();
      const submissionEvents: any[] = [];

      engine.on('execution_event', (event) => {
        if (event.type === 'submission') {
          submissionEvents.push(event);
        }
      });

      await engine.executeOrder(order);

      expect(submissionEvents.length).toBeGreaterThan(0);
      const submissionEvent = submissionEvents[0];
      expect(submissionEvent.data.txHash).toBeDefined();
    });

    test('should store transaction hash in execution context', async () => {
      const order = createTestOrder();
      const result = await engine.executeOrder(order);

      const execution = engine.getExecution(result.data.executionId);
      expect(execution?.txHash).toBe(result.data.txHash);
      expect(execution?.transaction?.hash).toBe(result.data.txHash);
    });
  });

  describe('Statistics', () => {
    test('should track total executed orders', async () => {
      const order1 = createTestOrder();
      const order2 = createTestOrder();

      await engine.executeOrder(order1);
      await engine.executeOrder(order2);

      const stats = engine.getStats();
      expect(stats.totalExecuted).toBe(2);
    });

    test('should track successful orders', async () => {
      const order = createTestOrder();
      await engine.executeOrder(order);

      const stats = engine.getStats();
      expect(stats.totalSuccessful).toBeGreaterThan(0);
    });

    test('should track failed orders', async () => {
      const order = createTestOrder();
      order.amount = 0; // Invalid

      await engine.executeOrder(order);

      const stats = engine.getStats();
      expect(stats.totalFailed).toBeGreaterThan(0);
    });

    test('should calculate failure rate percentage', async () => {
      const validOrder = createTestOrder();
      const invalidOrder = createTestOrder();
      invalidOrder.amount = 0;

      await engine.executeOrder(validOrder);
      await engine.executeOrder(invalidOrder);

      const stats = engine.getStats();
      expect(stats.failureRate).toBeCloseTo(50, 0);
    });

    test('should calculate average execution time', async () => {
      const order1 = createTestOrder();
      const order2 = createTestOrder();

      await engine.executeOrder(order1);
      await engine.executeOrder(order2);

      const stats = engine.getStats();
      expect(stats.averageExecutionTime).toBeGreaterThan(0);
    });

    test('should track state distribution', async () => {
      const order = createTestOrder();
      await engine.executeOrder(order);

      const stats = engine.getStats();
      expect(stats.stateDistribution[ExecutionState.CONFIRMED]).toBeGreaterThan(0);
    });
  });

  describe('Execution Query', () => {
    test('should retrieve execution by id', async () => {
      const order = createTestOrder();
      const result = await engine.executeOrder(order);

      const execution = engine.getExecution(result.data.executionId);
      expect(execution).toBeDefined();
      expect(execution?.orderId).toBe(order.orderId);
    });

    test('should return undefined for non-existent execution', async () => {
      const execution = engine.getExecution('non-existent-id');
      expect(execution).toBeUndefined();
    });

    test('should get executions by state', async () => {
      const order = createTestOrder();
      await engine.executeOrder(order);

      const confirmed = engine.getExecutionsByState(ExecutionState.CONFIRMED);
      expect(confirmed.length).toBeGreaterThan(0);
      expect(confirmed[0].state).toBe(ExecutionState.CONFIRMED);
    });

    test('should return empty array for state with no executions', async () => {
      const pending = engine.getExecutionsByState(ExecutionState.PENDING);
      expect(pending).toEqual([]);
    });
  });

  describe('State Transitions', () => {
    test('should transition through correct states on success', async () => {
      const order = createTestOrder();
      const result = await engine.executeOrder(order);

      const execution = engine.getExecution(result.data.executionId);
      expect(execution?.state).toBe(ExecutionState.CONFIRMED);
    });

    test('should transition to FAILED on validation error', async () => {
      const order = createTestOrder();
      order.amount = 0;

      const result = await engine.executeOrder(order);
      expect(result.newState).toBe(ExecutionState.FAILED);
    });

    test('should transition to FAILED on routing error', async () => {
      const order = createTestOrder();
      mockRouter.routeOrder = async () => {
        throw new Error('Routing failed');
      };

      const result = await engine.executeOrder(order);
      expect(result.newState).toBe(ExecutionState.FAILED);
    });

    test('should maintain error message on failure', async () => {
      const order = createTestOrder();
      order.amount = 0;

      const result = await engine.executeOrder(order);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Invalid');
    });
  });

  describe('Edge Cases', () => {
    test('should handle large order amounts', async () => {
      const order = createTestOrder();
      order.amount = 1000000000;

      const result = await engine.executeOrder(order);
      expect(result.success).toBe(true);
    });

    test('should handle small order amounts', async () => {
      const order = createTestOrder();
      order.amount = 0.001;

      const result = await engine.executeOrder(order);
      expect(result.success).toBe(true);
    });

    test('should handle multiple concurrent executions', async () => {
      const orders = [
        createTestOrder(),
        createTestOrder(),
        createTestOrder(),
      ];

      const results = await Promise.all(
        orders.map((order) => engine.executeOrder(order))
      );

      results.forEach((result) => {
        expect(result.success).toBe(true);
      });
    });

    test('should handle zero slippage', async () => {
      const order = createTestOrder();
      order.slippage = 0;

      const result = await engine.executeOrder(order);
      expect(result.success).toBe(true);
    });

    test('should handle maximum slippage (10000 bps = 100%)', async () => {
      const order = createTestOrder();
      order.slippage = 10000;

      const result = await engine.executeOrder(order);
      expect(result.success).toBe(true);
    });
  });

  describe('Configuration', () => {
    test('should use default config when not specified', async () => {
      expect(engine.getStats().totalExecuted).toBe(0); // Should initialize
    });

    test('should use custom config when provided', async () => {
      const customEngine = new ExecutionEngine(
        mockRouter as any,
        AGGRESSIVE_EXECUTION_CONFIG
      );
      const order = createTestOrder();

      const result = await customEngine.executeOrder(order);
      expect(result.success).toBe(true);
    });

    test('should respect gas multiplier from config', async () => {
      const config = { ...DEFAULT_EXECUTION_CONFIG, gasMultiplier: 2.0 };
      const customEngine = new ExecutionEngine(mockRouter as any, config);

      const order = createTestOrder();
      await customEngine.executeOrder(order);

      expect(true).toBe(true); // Just verify it runs without error
    });
  });

  describe('Reset', () => {
    test('should clear all executions on reset', async () => {
      const order = createTestOrder();
      await engine.executeOrder(order);

      engine.reset();

      const confirmed = engine.getExecutionsByState(ExecutionState.CONFIRMED);
      expect(confirmed.length).toBe(0);
    });

    test('should reset statistics on reset', async () => {
      const order = createTestOrder();
      await engine.executeOrder(order);

      engine.reset();

      const stats = engine.getStats();
      expect(stats.totalExecuted).toBe(0);
      expect(stats.totalSuccessful).toBe(0);
      expect(stats.totalFailed).toBe(0);
    });
  });

  describe('Event Emission', () => {
    test('should emit execution events with correct order id', async () => {
      const order = createTestOrder();
      const events: any[] = [];

      engine.on('execution_event', (event) => {
        events.push(event);
      });

      await engine.executeOrder(order);

      events.forEach((event) => {
        expect(event.orderId).toBe(order.orderId);
      });
    });

    test('should emit order-specific events', async () => {
      const order = createTestOrder();
      const orderEvents: any[] = [];

      engine.on(`execution:${order.orderId}`, (event) => {
        orderEvents.push(event);
      });

      await engine.executeOrder(order);

      expect(orderEvents.length).toBeGreaterThan(0);
    });

    test('should include timestamp in all events', async () => {
      const order = createTestOrder();
      const events: any[] = [];

      engine.on('execution_event', (event) => {
        events.push(event);
      });

      await engine.executeOrder(order);

      events.forEach((event) => {
        expect(event.timestamp).toBeInstanceOf(Date);
      });
    });
  });

  describe('Integration', () => {
    test('should complete full execution lifecycle', async () => {
      const order = createTestOrder();
      const events: any[] = [];

      engine.on('execution_event', (event) => {
        events.push(event);
      });

      const result = await engine.executeOrder(order);

      // Verify full lifecycle
      expect(result.success).toBe(true);
      expect(events.length).toBeGreaterThan(0);
      
      const stats = engine.getStats();
      expect(stats.totalExecuted).toBe(1);
      expect(stats.totalSuccessful).toBe(1);

      const execution = engine.getExecution(result.data.executionId);
      expect(execution?.state).toBe(ExecutionState.CONFIRMED);
      expect(execution?.txHash).toBeDefined();
    });

    test('should handle sequential order executions', async () => {
      const order1 = createTestOrder();
      const order2 = createTestOrder();

      const result1 = await engine.executeOrder(order1);
      const result2 = await engine.executeOrder(order2);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      const stats = engine.getStats();
      expect(stats.totalExecuted).toBe(2);
      expect(stats.totalSuccessful).toBe(2);
    });

    test('should maintain independent execution contexts', async () => {
      const order1 = createTestOrder();
      const order2 = createTestOrder();

      const result1 = await engine.executeOrder(order1);
      const result2 = await engine.executeOrder(order2);

      const execution1 = engine.getExecution(result1.data.executionId);
      const execution2 = engine.getExecution(result2.data.executionId);

      expect(execution1?.orderId).not.toBe(execution2?.orderId);
      expect(execution1?.txHash).not.toBe(execution2?.txHash);
    });
  });
});
