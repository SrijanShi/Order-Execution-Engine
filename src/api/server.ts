import Fastify, { FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { logger } from '../utils/logger';
import { ExecutionEngine } from '../execution/engine';
import { WebSocketManager } from '../websocket/manager';
import { WebSocketHandlers, createWebSocketHandlers } from '../websocket/handlers';
import { registerOrderRoutes } from './routes/orders';
import { corsMiddleware, requestLoggingMiddleware } from './middleware/validation';

/**
 * Fastify API server configuration and setup
 */
export class ApiServer {
  private app: FastifyInstance | null = null;
  private executionEngine: ExecutionEngine;
  private wsManager: WebSocketManager;
  private wsHandlers: WebSocketHandlers;
  private port: number;

  constructor(executionEngine: ExecutionEngine, wsManager: WebSocketManager, port: number = 3000) {
    this.executionEngine = executionEngine;
    this.wsManager = wsManager;
    this.wsHandlers = createWebSocketHandlers(wsManager, executionEngine);
    this.port = port;
  }

  /**
   * Initialize Fastify server with plugins and middleware
   */
  async initialize(): Promise<FastifyInstance> {
    try {
      this.app = Fastify({
        logger: false, // We're using our custom logger
        requestTimeout: 30000,
      });

      // Register WebSocket support
      await this.app.register(fastifyWebsocket);

      // Register middleware
      this.app.addHook('onRequest', corsMiddleware);
      this.app.addHook('onRequest', requestLoggingMiddleware);

      // Setup WebSocket endpoint
      this.app.get('/ws', { websocket: true }, (socket, request) => {
        logger.info(`WebSocket connection established from ${request.url}`);
        const clientId = this.wsManager.registerClient(socket as any);
        logger.info(`Client registered with ID: ${clientId}`);
      });

      // Register API routes
      await registerOrderRoutes(this.app, this.executionEngine, this.wsManager, this.wsHandlers);

      // 404 handler
      this.app.setNotFoundHandler((request, reply) => {
        reply.status(404).send({
          error: 'Not Found',
          path: request.url,
          method: request.method,
          timestamp: new Date(),
        });
      });

      logger.info('Fastify server initialized successfully');
      return this.app;
    } catch (error: any) {
      logger.error(`Failed to initialize Fastify server: ${error.message}`);
      throw error;
    }
  }

  /**
   * Start the API server
   */
  async start(): Promise<void> {
    try {
      if (!this.app) {
        await this.initialize();
      }

      await this.app!.listen({ port: this.port, host: '0.0.0.0' });
      logger.info(`✅ Fastify server listening on http://localhost:${this.port}`);
      logger.info('📝 WebSocket: ws://localhost:' + this.port + '/ws');
      logger.info('📝 API: http://localhost:' + this.port + '/api');
    } catch (error: any) {
      logger.error(`Failed to start server: ${error.message}`);
      throw error;
    }
  }

  /**
   * Stop the API server
   */
  async stop(): Promise<void> {
    try {
      if (this.app) {
        await this.app.close();
        logger.info('Fastify server stopped');
      }
    } catch (error: any) {
      logger.error(`Failed to stop server: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get the Fastify instance
   */
  getApp(): FastifyInstance | null {
    return this.app;
  }

  /**
   * Get the execution engine instance
   */
  getExecutionEngine(): ExecutionEngine {
    return this.executionEngine;
  }

  /**
   * Get the WebSocket manager instance
   */
  getWebSocketManager(): WebSocketManager {
    return this.wsManager;
  }

  /**
   * Get the WebSocket handlers instance
   */
  getWebSocketHandlers(): WebSocketHandlers {
    return this.wsHandlers;
  }
}
