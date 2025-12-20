import { db } from '../persistence/database';

/**
 * STEP 10: Database Integration Tests
 * Tests database operations and query execution
 */
describe('Database - Persistence Layer', () => {
  beforeAll(async () => {
    await db.initialize();
  });

  afterAll(async () => {
    await db.close();
  });

  test('should initialize database', async () => {
    expect(db).toBeDefined();
  });

  test('should execute simple query', async () => {
    const result = await db.query('SELECT 1 as num');
    expect(result).toBeDefined();
    expect(result.rows).toBeDefined();
    expect(Array.isArray(result.rows)).toBe(true);
  });

  test('should return query results', async () => {
    const result = await db.query('SELECT NOW() as time');
    expect(result.rows.length).toBeGreaterThan(0);
  });

  test('should handle multiple sequential queries', async () => {
    const r1 = await db.query('SELECT 1');
    const r2 = await db.query('SELECT 2');
    expect(r1.rows).toBeDefined();
    expect(r2.rows).toBeDefined();
  });

  test('should handle concurrent queries', async () => {
    const queries = [
      db.query('SELECT 1'),
      db.query('SELECT 2'),
      db.query('SELECT 3'),
    ];
    const results = await Promise.all(queries);
    expect(results.length).toBe(3);
    results.forEach((r) => {
      expect(r.rows).toBeDefined();
    });
  });

  test('should return empty result set when no rows', async () => {
    const result = await db.query('SELECT 1 WHERE FALSE');
    expect(result.rows.length).toBe(0);
  });

  test('should maintain consistency across queries', async () => {
    const query = 'SELECT 42 as answer';
    const r1 = await db.query(query);
    const r2 = await db.query(query);
    expect(r1.rows.length).toBe(r2.rows.length);
  });

  test('should perform health check', async () => {
    const isHealthy = await db.healthCheck();
    expect(typeof isHealthy).toBe('boolean');
  });

  test('should recover from query errors', async () => {
    try {
      // Invalid SQL
      await db.query('INVALID SQL');
    } catch (e) {
      // Error expected
    }
    // Should still work
    const result = await db.query('SELECT 1');
    expect(result.rows).toBeDefined();
  });

  test('should handle transaction operations', async () => {
    expect(() => {
      // Transaction methods should be callable
      expect(typeof db.transaction).toBe('function');
    }).not.toThrow();
  });
});
