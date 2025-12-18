import dotenv from 'dotenv';
import { Pool, PoolClient, QueryResult } from 'pg';
import { CONFIG } from '../types';
import { logger } from '../utils/logger';

// Load environment variables
dotenv.config();

/**
 * PostgreSQL Connection Pool Manager
 * Handles database connections, initialization, and query execution
 */
class DatabaseManager {
  private pool: Pool;
  private initialized: boolean = false;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      logger.error('DATABASE_URL environment variable is not set');
      throw new Error('DATABASE_URL environment variable is not set');
    }

    logger.info('Initializing database pool', {
      maxConnections: CONFIG.DB_POOL_SIZE,
    });

    this.pool = new Pool({
      connectionString: databaseUrl,
      max: CONFIG.DB_POOL_SIZE,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 2_000,
    });

    // Handle pool errors
    this.pool.on('error', (err) => {
      logger.error('Unexpected error on idle client', {
        error: err.message,
        stack: err.stack,
      });
    });

    // Handle pool events
    this.pool.on('connect', () => {
      logger.debug('New client connected to pool');
    });

    this.pool.on('remove', () => {
      logger.debug('Client removed from pool');
    });

    logger.info('✅ Database pool initialized');
  }

  /**
   * Initialize database: create tables if they don't exist
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.info('Database already initialized');
      return;
    }

    const client = await this.pool.connect();

    try {
      logger.info('🔄 Initializing database schema...');

      // Create orders table
      await client.query(`
        CREATE TABLE IF NOT EXISTS orders (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          order_id VARCHAR(36) UNIQUE NOT NULL,
          user_id VARCHAR(255),
          reference_id VARCHAR(255),
          
          type VARCHAR(50) NOT NULL CHECK (type IN ('market', 'limit', 'sniper')),
          status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'routing', 'building', 'submitted', 'confirmed', 'failed')),
          
          token_in VARCHAR(255) NOT NULL,
          token_out VARCHAR(255) NOT NULL,
          amount DECIMAL(20, 8) NOT NULL,
          slippage DECIMAL(5, 4) NOT NULL,
          
          executed_dex VARCHAR(50),
          expected_price DECIMAL(20, 8),
          executed_price DECIMAL(20, 8),
          tx_hash VARCHAR(255),
          
          current_attempt INT DEFAULT 1,
          
          error_code VARCHAR(100),
          error_message TEXT,
          error_timestamp TIMESTAMP,
          
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      logger.debug('✅ Orders table created/verified');

      // Create index on orders table
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
        CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
        CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
        CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id);
      `);

      logger.debug('✅ Orders table indexes created');

      // Create executions table
      await client.query(`
        CREATE TABLE IF NOT EXISTS executions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          execution_id VARCHAR(36) UNIQUE NOT NULL,
          order_id VARCHAR(36) NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
          
          dex_used VARCHAR(50) NOT NULL,
          execution_price DECIMAL(20, 8),
          tx_hash VARCHAR(255),
          status VARCHAR(50) NOT NULL,
          
          fee DECIMAL(20, 8),
          fee_bps INT,
          
          error_code VARCHAR(100),
          error_message TEXT,
          
          duration_ms INT,
          
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      logger.debug('✅ Executions table created/verified');

      // Create index on executions table
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_executions_order_id ON executions(order_id);
        CREATE INDEX IF NOT EXISTS idx_executions_dex_used ON executions(dex_used);
        CREATE INDEX IF NOT EXISTS idx_executions_created_at ON executions(created_at);
      `);

      logger.debug('✅ Executions table indexes created');

      // Create price history table
      await client.query(`
        CREATE TABLE IF NOT EXISTS price_history (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          token_mint VARCHAR(255) NOT NULL,
          dex VARCHAR(50) NOT NULL,
          price DECIMAL(20, 8) NOT NULL,
          liquidity DECIMAL(20, 8),
          price_impact DECIMAL(5, 4),
          recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      logger.debug('✅ Price history table created/verified');

      // Create index on price history table
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_price_history_token_mint ON price_history(token_mint);
        CREATE INDEX IF NOT EXISTS idx_price_history_dex ON price_history(dex);
        CREATE INDEX IF NOT EXISTS idx_price_history_recorded_at ON price_history(recorded_at);
      `);

      logger.debug('✅ Price history table indexes created');

      logger.info('✅ Database schema initialized successfully');
      this.initialized = true;
    } catch (error) {
      logger.error('Failed to initialize database schema', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Execute a query with optional timeout
   */
  async query<T extends Record<string, any> = Record<string, any>>(
    text: string,
    values?: any[],
    timeout: number = CONFIG.DB_QUERY_TIMEOUT_MS
  ): Promise<QueryResult<T>> {
    const startTime = Date.now();

    try {
      const result = await this.pool.query<T>(text, values);

      const duration = Date.now() - startTime;

      // Log slow queries
      if (duration > 1000) {
        logger.warn('Slow query detected', {
          query: text.substring(0, 100),
          duration,
          rows: result.rowCount,
        });
      }

      return result;
    } catch (error) {
      logger.error('Database query failed', {
        query: text.substring(0, 100),
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Execute multiple queries in a transaction
   * Automatically commits or rolls back based on callback result
   */
  async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      logger.debug('Transaction started');

      const result = await callback(client);

      await client.query('COMMIT');
      logger.debug('Transaction committed successfully');

      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Transaction failed, rolled back', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Close the connection pool
   */
  async close(): Promise<void> {
    try {
      await this.pool.end();
      logger.info('Database connection pool closed');
    } catch (error) {
      logger.error('Error closing database pool', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get pool statistics
   */
  getPoolStats() {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }

  /**
   * Check if database is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.query('SELECT NOW()');
      return result.rows.length > 0;
    } catch (error) {
      logger.error('Database health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}

// Export singleton instance
export const db = new DatabaseManager();