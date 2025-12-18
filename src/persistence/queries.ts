import { v4 as uuidv4 } from 'uuid';
import { db } from './database';
import {
  Order,
  SubmitOrderRequest,
  OrderExecutionResult,
  OrderDetails,
  QueuedOrder,
} from '../types/order';
import { OrderStatus, DexType, OrderType } from '../types/common';
import { logger } from '../utils/logger';

/**
 * Order-related database queries
 * Handles all CRUD operations for orders
 */
export class OrderQueries {
  /**
   * Create a new order
   */
  static async createOrder(
    request: SubmitOrderRequest,
    userId?: string
  ): Promise<Order> {
    const orderId = uuidv4();

    const query = `
      INSERT INTO orders (
        order_id, user_id, reference_id, 
        type, status, 
        token_in, token_out, amount, slippage,
        current_attempt
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *;
    `;

    const values = [
      orderId,
      userId || null,
      request.referenceId || null,
      request.orderType || OrderType.MARKET,
      OrderStatus.PENDING,
      request.tokenIn,
      request.tokenOut,
      request.amount,
      request.slippage || 0.01,
      1, // initial attempt
    ];

    try {
      const result = await db.query<any>(query, values);
      const order = this.mapRowToOrder(result.rows[0]);

      logger.info('✅ Order created', {
        orderId: order.orderId,
        userId,
        amount: request.amount,
      });

      return order;
    } catch (error) {
      logger.error('Failed to create order', {
        error: error instanceof Error ? error.message : String(error),
        request,
      });
      throw error;
    }
  }

  /**
   * Get order by ID
   */
  static async getOrderById(orderId: string): Promise<Order | null> {
    const query = `
      SELECT * FROM orders 
      WHERE order_id = $1;
    `;

    try {
      const result = await db.query<any>(query, [orderId]);

      if (result.rows.length === 0) {
        logger.warn('Order not found', { orderId });
        return null;
      }

      const order = this.mapRowToOrder(result.rows[0]);
      logger.debug('✅ Order retrieved', { orderId });

      return order;
    } catch (error) {
      logger.error('Failed to get order', {
        orderId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Update order status with optional additional fields
   */
  static async updateOrderStatus(
    orderId: string,
    status: OrderStatus,
    updates?: Partial<Order>
  ): Promise<Order> {
    let query = `
      UPDATE orders 
      SET status = $2,
          updated_at = CURRENT_TIMESTAMP
    `;

    const values: any[] = [orderId, status];
    let paramCount = 2;

    // Add optional fields dynamically
    if (updates?.executedDex) {
      paramCount++;
      query += `, executed_dex = $${paramCount}`;
      values.push(updates.executedDex);
    }

    if (updates?.expectedPrice !== undefined) {
      paramCount++;
      query += `, expected_price = $${paramCount}`;
      values.push(updates.expectedPrice);
    }

    if (updates?.executedPrice !== undefined) {
      paramCount++;
      query += `, executed_price = $${paramCount}`;
      values.push(updates.executedPrice);
    }

    if (updates?.txHash) {
      paramCount++;
      query += `, tx_hash = $${paramCount}`;
      values.push(updates.txHash);
    }

    query += ` WHERE order_id = $1 RETURNING *;`;

    try {
      const result = await db.query<any>(query, values);
      const order = this.mapRowToOrder(result.rows[0]);

      logger.info('✅ Order status updated', {
        orderId,
        status,
        updates: Object.keys(updates || {}),
      });

      return order;
    } catch (error) {
      logger.error('Failed to update order status', {
        orderId,
        status,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Update order with error information
   */
  static async updateOrderError(
    orderId: string,
    errorCode: string,
    errorMessage: string,
    currentAttempt: number
  ): Promise<Order> {
    const shouldFail = currentAttempt >= 3;
    const newStatus = shouldFail ? OrderStatus.FAILED : OrderStatus.PENDING;

    const query = `
      UPDATE orders 
      SET 
        status = $2,
        error_code = $3,
        error_message = $4,
        error_timestamp = CURRENT_TIMESTAMP,
        current_attempt = $5,
        updated_at = CURRENT_TIMESTAMP
      WHERE order_id = $1
      RETURNING *;
    `;

    const values = [orderId, newStatus, errorCode, errorMessage, currentAttempt];

    try {
      const result = await db.query<any>(query, values);
      const order = this.mapRowToOrder(result.rows[0]);

      logger.error('❌ Order error recorded', {
        orderId,
        errorCode,
        errorMessage,
        attempt: currentAttempt,
        newStatus,
      });

      return order;
    } catch (error) {
      logger.error('Failed to update order error', {
        orderId,
        errorCode,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get orders by user with pagination
   */
  static async getOrdersByUser(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<{ orders: OrderDetails[]; total: number }> {
    const countQuery = `
      SELECT COUNT(*) as total FROM orders WHERE user_id = $1;
    `;

    try {
      const countResult = await db.query<any>(countQuery, [userId]);
      const total = parseInt(countResult.rows[0].total, 10);

      const query = `
        SELECT * FROM orders 
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3;
      `;

      const result = await db.query<any>(query, [userId, limit, offset]);

      const orders = result.rows.map((row) => this.mapRowToOrderDetails(row));

      logger.info('✅ Orders retrieved for user', {
        userId,
        count: orders.length,
        total,
      });

      return { orders, total };
    } catch (error) {
      logger.error('Failed to get orders by user', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get all pending/active orders
   */
  static async getPendingOrders(limit: number = 100): Promise<Order[]> {
    const query = `
      SELECT * FROM orders 
      WHERE status IN ('pending', 'routing', 'building', 'submitted')
      ORDER BY created_at ASC
      LIMIT $1;
    `;

    try {
      const result = await db.query<any>(query, [limit]);
      const orders = result.rows.map((row) => this.mapRowToOrder(row));

      logger.info('✅ Pending orders retrieved', {
        count: orders.length,
      });

      return orders;
    } catch (error) {
      logger.error('Failed to get pending orders', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get recent orders from last N hours
   */
  static async getRecentOrders(
    hours: number = 24,
    limit: number = 100
  ): Promise<Order[]> {
    const query = `
      SELECT * FROM orders 
      WHERE created_at > NOW() - INTERVAL '${hours} hours'
      ORDER BY created_at DESC
      LIMIT $1;
    `;

    try {
      const result = await db.query<any>(query, [limit]);
      const orders = result.rows.map((row) => this.mapRowToOrder(row));

      logger.info('✅ Recent orders retrieved', {
        hours,
        count: orders.length,
      });

      return orders;
    } catch (error) {
      logger.error('Failed to get recent orders', {
        hours,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get orders by status
   */
  static async getOrdersByStatus(
    status: OrderStatus,
    limit: number = 100
  ): Promise<Order[]> {
    const query = `
      SELECT * FROM orders 
      WHERE status = $1
      ORDER BY created_at ASC
      LIMIT $2;
    `;

    try {
      const result = await db.query<any>(query, [status, limit]);
      const orders = result.rows.map((row) => this.mapRowToOrder(row));

      logger.info('✅ Orders by status retrieved', {
        status,
        count: orders.length,
      });

      return orders;
    } catch (error) {
      logger.error('Failed to get orders by status', {
        status,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Increment order attempt counter
   */
  static async incrementAttempt(orderId: string): Promise<Order> {
    const query = `
      UPDATE orders 
      SET current_attempt = current_attempt + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE order_id = $1
      RETURNING *;
    `;

    try {
      const result = await db.query<any>(query, [orderId]);
      const order = this.mapRowToOrder(result.rows[0]);

      logger.debug('✅ Order attempt incremented', {
        orderId,
        attempt: order.currentAttempt,
      });

      return order;
    } catch (error) {
      logger.error('Failed to increment order attempt', {
        orderId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Map database row to Order type
   */
  private static mapRowToOrder(row: any): Order {
    return {
      orderId: row.order_id,
      userId: row.user_id,
      referenceId: row.reference_id,
      type: row.type as OrderType,
      status: row.status as OrderStatus,
      tokenIn: row.token_in,
      tokenOut: row.token_out,
      amount: parseFloat(row.amount),
      slippage: parseFloat(row.slippage),
      currentAttempt: row.current_attempt,
      executedDex: row.executed_dex as DexType | undefined,
      expectedPrice: row.expected_price ? parseFloat(row.expected_price) : undefined,
      executedPrice: row.executed_price
        ? parseFloat(row.executed_price)
        : undefined,
      txHash: row.tx_hash,
      error: row.error_code
        ? {
            code: row.error_code,
            message: row.error_message,
            timestamp: row.error_timestamp,
          }
        : undefined,
      metadata: {
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    };
  }

  /**
   * Map database row to OrderDetails type
   */
  private static mapRowToOrderDetails(row: any): OrderDetails {
    const order = this.mapRowToOrder(row);
    const now = Date.now();
    const createdTime = order.metadata.createdAt.getTime();
    const elapsedTime = now - createdTime;

    return {
      ...order,
      elapsedTime,
      estimatedRemaining: order.status === OrderStatus.CONFIRMED ? 0 : 5000,
      retryCount: order.currentAttempt - 1,
    };
  }
}

/**
 * Execution-related database queries
 * Handles execution history and audit trail
 */
export class ExecutionQueries {
  /**
   * Create execution record
   */
  static async createExecution(
    orderId: string,
    result: Omit<OrderExecutionResult, 'orderId'>
  ): Promise<void> {
    const executionId = uuidv4();
    const durationMs = result.totalDuration;

    const query = `
      INSERT INTO executions (
        execution_id, order_id, dex_used, execution_price, 
        tx_hash, status, error_code, error_message, duration_ms
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
    `;

    const values = [
      executionId,
      orderId,
      result.dex,
      result.executedPrice,
      result.txHash || null,
      result.status,
      result.error?.code || null,
      result.error?.message || null,
      durationMs,
    ];

    try {
      await db.query(query, values);
      logger.info('✅ Execution recorded', {
        executionId,
        orderId,
        dex: result.dex,
        duration: durationMs,
      });
    } catch (error) {
      logger.error('Failed to create execution record', {
        orderId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get execution history for an order
   */
  static async getExecutionsByOrderId(orderId: string): Promise<any[]> {
    const query = `
      SELECT * FROM executions 
      WHERE order_id = $1
      ORDER BY created_at DESC;
    `;

    try {
      const result = await db.query<any>(query, [orderId]);

      logger.info('✅ Executions retrieved', {
        orderId,
        count: result.rows.length,
      });

      return result.rows;
    } catch (error) {
      logger.error('Failed to get executions by order', {
        orderId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get execution statistics
   */
  static async getExecutionStats(hours: number = 24): Promise<any> {
    const query = `
      SELECT 
        COUNT(*) as total_executions,
        COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as successful,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        AVG(duration_ms) as avg_duration_ms,
        MIN(duration_ms) as min_duration_ms,
        MAX(duration_ms) as max_duration_ms,
        dex_used,
        COUNT(*) as dex_count
      FROM executions
      WHERE created_at > NOW() - INTERVAL '${hours} hours'
      GROUP BY dex_used;
    `;

    try {
      const result = await db.query<any>(query);

      logger.info('✅ Execution statistics retrieved', {
        hours,
        stats: result.rows,
      });

      return result.rows;
    } catch (error) {
      logger.error('Failed to get execution stats', {
        hours,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

/**
 * Price history queries
 * Handles historical price data for analytics
 */
export class PriceHistoryQueries {
  /**
   * Record price from DEX
   */
  static async recordPrice(
    tokenMint: string,
    dex: DexType,
    price: number,
    liquidity?: number,
    priceImpact?: number
  ): Promise<void> {
    const query = `
      INSERT INTO price_history (token_mint, dex, price, liquidity, price_impact)
      VALUES ($1, $2, $3, $4, $5);
    `;

    const values = [tokenMint, dex, price, liquidity || null, priceImpact || null];

    try {
      await db.query(query, values);
      logger.debug('✅ Price recorded', {
        tokenMint: tokenMint.substring(0, 8),
        dex,
        price,
      });
    } catch (error) {
      logger.error('Failed to record price', {
        tokenMint,
        dex,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get price history for a token
   */
  static async getPriceHistory(
    tokenMint: string,
    hours: number = 24
  ): Promise<any[]> {
    const query = `
      SELECT * FROM price_history 
      WHERE token_mint = $1 
        AND recorded_at > NOW() - INTERVAL '${hours} hours'
      ORDER BY recorded_at DESC;
    `;

    try {
      const result = await db.query<any>(query, [tokenMint]);

      logger.info('✅ Price history retrieved', {
        tokenMint: tokenMint.substring(0, 8),
        hours,
        count: result.rows.length,
      });

      return result.rows;
    } catch (error) {
      logger.error('Failed to get price history', {
        tokenMint,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get average price for a token from a DEX
   */
  static async getAveragePrice(
    tokenMint: string,
    dex: DexType,
    hours: number = 1
  ): Promise<number | null> {
    const query = `
      SELECT AVG(price) as avg_price 
      FROM price_history 
      WHERE token_mint = $1 
        AND dex = $2
        AND recorded_at > NOW() - INTERVAL '${hours} hours';
    `;

    try {
      const result = await db.query<any>(query, [tokenMint, dex]);

      const avgPrice = result.rows[0]?.avg_price
        ? parseFloat(result.rows[0].avg_price)
        : null;

      logger.debug('✅ Average price retrieved', {
        tokenMint: tokenMint.substring(0, 8),
        dex,
        avgPrice,
      });

      return avgPrice;
    } catch (error) {
      logger.error('Failed to get average price', {
        tokenMint,
        dex,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get price comparison between DEXs
   */
  static async getPriceComparison(
    tokenMint: string,
    minutes: number = 5
  ): Promise<any> {
    const query = `
      SELECT 
        dex,
        AVG(price) as avg_price,
        MAX(price) as max_price,
        MIN(price) as min_price,
        COUNT(*) as samples
      FROM price_history 
      WHERE token_mint = $1 
        AND recorded_at > NOW() - INTERVAL '${minutes} minutes'
      GROUP BY dex
      ORDER BY avg_price DESC;
    `;

    try {
      const result = await db.query<any>(query, [tokenMint]);

      logger.info('✅ Price comparison retrieved', {
        tokenMint: tokenMint.substring(0, 8),
        minutes,
        dexs: result.rows.length,
      });

      return result.rows;
    } catch (error) {
      logger.error('Failed to get price comparison', {
        tokenMint,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}