import { ExecutionEngine } from '../execution/engine';
import { DexRouter } from '../router/dex-router';
import { DEFAULT_EXECUTION_CONFIG } from '../execution/types';

/**
 * STEP 10: Execution Engine Integration Tests
 * Tests engine initialization and statistics tracking
 */
describe('Execution Engine - Order Execution', () => {
  let engine: ExecutionEngine;
  let router: DexRouter;

  beforeAll(() => {
    router = new DexRouter();
    engine = new ExecutionEngine(router, DEFAULT_EXECUTION_CONFIG);
  });

  test('should initialize execution engine', () => {
    expect(engine).toBeDefined();
  });

  test('should get initial statistics', () => {
    const stats = engine.getStats();
    expect(stats).toBeDefined();
    expect(stats.totalExecuted).toBeGreaterThanOrEqual(0);
  });

  test('should track executed count', () => {
    const stats = engine.getStats();
    expect(typeof stats.totalExecuted).toBe('number');
  });

  test('should track successful count', () => {
    const stats = engine.getStats();
    expect(typeof stats.totalSuccessful).toBe('number');
  });

  test('should track failed count', () => {
    const stats = engine.getStats();
    expect(typeof stats.totalFailed).toBe('number');
  });

  test('should calculate failure rate', () => {
    const stats = engine.getStats();
    expect(typeof stats.failureRate).toBe('number');
    expect(stats.failureRate).toBeGreaterThanOrEqual(0);
    expect(stats.failureRate).toBeLessThanOrEqual(100);
  });

  test('should track average execution time', () => {
    const stats = engine.getStats();
    expect(typeof stats.averageExecutionTime).toBe('number');
    expect(stats.averageExecutionTime).toBeGreaterThanOrEqual(0);
  });

  test('should track pending count', () => {
    const stats = engine.getStats();
    expect(typeof stats.pendingCount).toBe('number');
  });

  test('should have state distribution', () => {
    const stats = engine.getStats();
    expect(stats.stateDistribution).toBeDefined();
    expect(typeof stats.stateDistribution).toBe('object');
  });

  test('should support event listeners', (done) => {
    engine.on('state_change', () => {
      // Event listener triggered
    });
    expect(engine.listenerCount('state_change')).toBeGreaterThan(0);
    done();
  });

  test('should maintain consistent statistics', () => {
    const stats1 = engine.getStats();
    const stats2 = engine.getStats();
    expect(stats1.totalExecuted).toBe(stats2.totalExecuted);
  });
});
