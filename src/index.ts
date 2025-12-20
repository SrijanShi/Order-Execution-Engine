import dotenv from 'dotenv';
import { DexRouter } from './router/dex-router';
import { ExecutionEngine } from './execution/engine';
import { WebSocketManager } from './websocket/manager';
import { ApiServer } from './api/server';
import { logger } from './utils/logger';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3000', 10);

/**
 * Initialize and start the DEX Order Engine
 */
async function startServer(): Promise<void> {
  try {
    logger.info('🚀 Starting DEX Order Engine...');

    // Initialize core components
    const dexRouter = new DexRouter();
    const executionEngine = new ExecutionEngine(dexRouter);
    const wsManager = new WebSocketManager();

    // Create and start API server
    const apiServer = new ApiServer(executionEngine, wsManager, PORT);
    await apiServer.initialize();
    await apiServer.start();

    logger.info('✅ DEX Order Engine started successfully');
    logger.info('📝 REST API: http://localhost:' + PORT + '/api');
    logger.info('📝 WebSocket: ws://localhost:' + PORT + '/ws');
    logger.info('📝 Health Check: http://localhost:' + PORT + '/api/health');

    // Graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('⏹️  Shutting down gracefully...');
      await apiServer.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('⏹️  Shutting down gracefully...');
      await apiServer.stop();
      process.exit(0);
    });
  } catch (error: any) {
    logger.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
}

// Start the server if this is the main module
if (require.main === module) {
  startServer();
}

export { startServer };
