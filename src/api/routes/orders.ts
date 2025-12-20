import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger';
import { ExecutionEngine } from '../../execution/engine';
import { WebSocketManager } from '../../websocket/manager';
import { WebSocketHandlers } from '../../websocket/handlers';
import { validateExecuteOrderRequest, validateOrderId } from '../middleware/validation';
import { Order } from '../../types/order';
import { OrderStatus, OrderType } from '../../types/common';

/**
 * Order API routes
 */
export async function registerOrderRoutes(
  app: FastifyInstance,
  executionEngine: ExecutionEngine,
  wsManager: WebSocketManager,
  wsHandlers: WebSocketHandlers,
): Promise<void> {
  /**
   * POST /api/orders/execute - Submit order for execution
   * Request body: { tokenIn, tokenOut, amount, slippage }
   * Response: { orderId, status: "pending" }
   */
  app.post<{ Body: any }>('/api/orders/execute', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as any;
      const validation = validateExecuteOrderRequest(body);

      if (!validation.valid) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: validation.errors,
          timestamp: new Date(),
        });
      }

      const { tokenIn, tokenOut, amount, slippage } = body;
      const orderId = uuidv4();

      // Create order
      const order: Order = {
        orderId,
        type: OrderType.MARKET,
        tokenIn,
        tokenOut,
        amount,
        slippage,
        status: OrderStatus.PENDING,
        currentAttempt: 0,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      // Execute order asynchronously
      executionEngine.executeOrder(order).catch((error) => {
        logger.error(`Order execution failed for ${orderId}: ${error.message}`);
      });

      // Notify WebSocket subscribers
      wsManager.broadcastStatusUpdate({
        orderId,
        status: OrderStatus.PENDING,
        timestamp: new Date(),
      });

      logger.info(`Order submitted: ${orderId}`);

      return reply.status(201).send({
        orderId,
        status: OrderStatus.PENDING,
        timestamp: new Date(),
      });
    } catch (error: any) {
      logger.error(`POST /api/orders/execute error: ${error.message}`);
      return reply.status(500).send({
        error: 'Failed to submit order',
        message: error.message,
        timestamp: new Date(),
      });
    }
  });

  /**
   * GET /api/orders/:orderId - Get specific order status
   * Response: { orderId, status, executionPrice, txHash, ... }
   */
  app.get<{ Params: { orderId: string } }>('/api/orders/:orderId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as any;
      const { orderId } = params;

      if (!validateOrderId(orderId)) {
        return reply.status(400).send({
          error: 'Invalid order ID format',
          orderId,
          timestamp: new Date(),
        });
      }

      const execution = executionEngine.getExecution(orderId);

      if (!execution) {
        return reply.status(404).send({
          error: 'Order not found',
          orderId,
          timestamp: new Date(),
        });
      }

      logger.info(`Retrieved order: ${orderId}`);

      return reply.status(200).send({
        orderId: execution.order.orderId,
        status: execution.state,
        executionPrice: execution.quote?.amountOut,
        txHash: execution.txHash,
        timestamp: new Date(),
      });
    } catch (error: any) {
      logger.error(`GET /api/orders/:orderId error: ${error.message}`);
      return reply.status(500).send({
        error: 'Failed to retrieve order',
        message: error.message,
        timestamp: new Date(),
      });
    }
  });

  /**
   * GET /api/orders - Get all orders for current user
   * Response: [{ orderId, status, ... }]
   */
  app.get<{ Querystring: { status?: string; limit?: string } }>('/api/orders', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as any;
      const { status, limit = '50' } = query;
      const limitNum = Math.min(parseInt(limit as string) || 50, 100);

      // Get all executions
      const stats = executionEngine.getStats();

      // Filter by status if provided
      let orders: any[] = [];

      if (status) {
        const executions = executionEngine.getExecutionsByState(status as any);
        orders = executions.slice(0, limitNum).map((exec) => ({
          orderId: exec.order.orderId,
          status: exec.state,
          executionPrice: exec.quote?.amountOut,
          txHash: exec.txHash,
        }));
      } else {
        // Return all orders (in real app, would be paginated and user-specific)
        orders = [];
        if (stats.stateDistribution) {
          for (const [state, count] of Object.entries(stats.stateDistribution)) {
            if (count > 0) {
              const executions = executionEngine.getExecutionsByState(state as any);
              orders.push(
                ...executions.slice(0, limitNum).map((exec) => ({
                  orderId: exec.order.orderId,
                  status: exec.state,
                  executionPrice: exec.quote?.amountOut,
                  txHash: exec.txHash,
                })),
              );
            }
          }
        }
      }

      logger.info(`Retrieved ${orders.length} orders`);

      return reply.status(200).send({
        orders,
        total: orders.length,
        timestamp: new Date(),
      });
    } catch (error: any) {
      logger.error(`GET /api/orders error: ${error.message}`);
      return reply.status(500).send({
        error: 'Failed to retrieve orders',
        message: error.message,
        timestamp: new Date(),
      });
    }
  });

  /**
   * POST /api/health - Health check
   * Response: { status: "ok", queueLength, activeOrders }
   */
  app.post<{ Body: any }>('/api/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = executionEngine.getStats();
      const wsStats = wsManager.getStats();

      const response = {
        status: 'ok',
        service: 'dex-order-engine',
        version: '1.0.0',
        executionEngine: {
          totalExecuted: stats.totalExecuted,
          totalSuccessful: stats.totalSuccessful,
          totalFailed: stats.totalFailed,
          failureRate: stats.failureRate ? (stats.failureRate * 100).toFixed(2) + '%' : 'N/A',
        },
        websocket: {
          activeConnections: wsStats.activeConnections,
          totalConnections: wsStats.totalConnections,
          totalSubscriptions: wsStats.totalSubscriptions,
          totalMessages: wsStats.totalMessages,
        },
        uptime: process.uptime(),
        timestamp: new Date(),
      };

      logger.info('Health check performed');

      return reply.status(200).send(response);
    } catch (error: any) {
      logger.error(`POST /api/health error: ${error.message}`);
      return reply.status(500).send({
        status: 'error',
        error: error.message,
        timestamp: new Date(),
      });
    }
  });

  /**
   * GET /api/health - Health check (GET variant)
   */
  app.get('/api/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = executionEngine.getStats();
      const wsStats = wsManager.getStats();

      return reply.status(200).send({
        status: 'ok',
        service: 'dex-order-engine',
        executionEngine: {
          totalExecuted: stats.totalExecuted,
          failureRate: stats.failureRate ? (stats.failureRate * 100).toFixed(2) + '%' : 'N/A',
        },
        websocket: {
          activeConnections: wsStats.activeConnections,
          totalMessages: wsStats.totalMessages,
        },
        timestamp: new Date(),
      });
    } catch (error: any) {
      logger.error(`GET /api/health error: ${error.message}`);
      return reply.status(500).send({
        status: 'error',
        error: error.message,
        timestamp: new Date(),
      });
    }
  });

  logger.info('Order routes registered successfully');
}
