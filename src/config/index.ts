import * as dotenv from 'dotenv';
import { logger } from '../utils/logger';

// Load environment variables
dotenv.config();

/**
 * Configuration for different environments
 */
export interface AppConfig {
  // Environment
  nodeEnv: 'development' | 'staging' | 'production';
  isDev: boolean;
  isProd: boolean;

  // Server
  port: number;
  host: string;

  // Database
  database: {
    url: string;
    poolSize: number;
    idleTimeoutMs: number;
    connectionTimeoutMs: number;
    maxConnections: number;
  };

  // Redis
  redis: {
    url: string;
    maxRetries: number;
    retryDelayMs: number;
    timeoutMs: number;
  };

  // Order Execution
  execution: {
    maxConcurrentOrders: number;
    orderTimeoutMs: number;
    maxRetries: number;
    routingTimeoutMs: number;
    buildingTimeoutMs: number;
  };

  // Queue
  queue: {
    maxQueueSize: number;
    processingConcurrency: number;
    jobTimeoutMs: number;
  };

  // WebSocket
  websocket: {
    heartbeatIntervalMs: number;
    maxConnectionsPerServer: number;
  };

  // Logging
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    format: 'json' | 'text';
  };

  // Feature flags
  features: {
    enableRateLimiting: boolean;
    enableMetrics: boolean;
    enableHealthCheck: boolean;
  };
}

/**
 * Validate required environment variables
 */
function validateEnvironment(): void {
  const required = [
    'DATABASE_URL',
    'REDIS_URL',
    'PORT',
    'NODE_ENV',
  ];

  const missing = required.filter((env) => !process.env[env]);

  if (missing.length > 0) {
    logger.error(`Missing required environment variables: ${missing.join(', ')}`);
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }
}

/**
 * Load and validate configuration
 */
function loadConfig(): AppConfig {
  validateEnvironment();

  const nodeEnv = (process.env.NODE_ENV || 'development') as
    | 'development'
    | 'staging'
    | 'production';

  const port = parseInt(process.env.PORT || '3000', 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${process.env.PORT}`);
  }

  const dbPoolSize = parseInt(process.env.DB_POOL_SIZE || '10', 10);
  if (isNaN(dbPoolSize) || dbPoolSize < 1) {
    throw new Error(`Invalid DB_POOL_SIZE: ${process.env.DB_POOL_SIZE}`);
  }

  const maxConcurrentOrders = parseInt(
    process.env.MAX_CONCURRENT_ORDERS || '100',
    10
  );
  if (isNaN(maxConcurrentOrders) || maxConcurrentOrders < 1) {
    throw new Error(
      `Invalid MAX_CONCURRENT_ORDERS: ${process.env.MAX_CONCURRENT_ORDERS}`
    );
  }

  const orderTimeoutMs = parseInt(process.env.ORDER_TIMEOUT_MS || '30000', 10);
  if (isNaN(orderTimeoutMs) || orderTimeoutMs < 1000) {
    throw new Error(`Invalid ORDER_TIMEOUT_MS: ${process.env.ORDER_TIMEOUT_MS}`);
  }

  const loggingLevel = (process.env.LOG_LEVEL || 'info') as
    | 'debug'
    | 'info'
    | 'warn'
    | 'error';
  const validLevels = ['debug', 'info', 'warn', 'error'];
  if (!validLevels.includes(loggingLevel)) {
    throw new Error(`Invalid LOG_LEVEL: ${process.env.LOG_LEVEL}`);
  }

  const config: AppConfig = {
    nodeEnv,
    isDev: nodeEnv === 'development',
    isProd: nodeEnv === 'production',

    port,
    host: process.env.HOST || 'localhost',

    database: {
      url: process.env.DATABASE_URL || '',
      poolSize: dbPoolSize,
      idleTimeoutMs: parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000', 10),
      connectionTimeoutMs: parseInt(
        process.env.DB_CONNECTION_TIMEOUT_MS || '2000',
        10
      ),
      maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10),
    },

    redis: {
      url: process.env.REDIS_URL || '',
      maxRetries: parseInt(process.env.REDIS_MAX_RETRIES || '3', 10),
      retryDelayMs: parseInt(process.env.REDIS_RETRY_DELAY_MS || '1000', 10),
      timeoutMs: parseInt(process.env.REDIS_TIMEOUT_MS || '5000', 10),
    },

    execution: {
      maxConcurrentOrders,
      orderTimeoutMs,
      maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
      routingTimeoutMs: parseInt(process.env.ROUTING_TIMEOUT_MS || '2000', 10),
      buildingTimeoutMs: parseInt(process.env.BUILDING_TIMEOUT_MS || '3000', 10),
    },

    queue: {
      maxQueueSize: parseInt(process.env.MAX_QUEUE_SIZE || '10000', 10),
      processingConcurrency: parseInt(process.env.QUEUE_CONCURRENCY || '10', 10),
      jobTimeoutMs: parseInt(process.env.JOB_TIMEOUT_MS || '30000', 10),
    },

    websocket: {
      heartbeatIntervalMs: parseInt(
        process.env.WS_HEARTBEAT_INTERVAL_MS || '30000',
        10
      ),
      maxConnectionsPerServer: parseInt(
        process.env.WS_MAX_CONNECTIONS || '1000',
        10
      ),
    },

    logging: {
      level: loggingLevel,
      format: (process.env.LOG_FORMAT || 'text') as 'json' | 'text',
    },

    features: {
      enableRateLimiting: process.env.ENABLE_RATE_LIMITING === 'true',
      enableMetrics: process.env.ENABLE_METRICS === 'true',
      enableHealthCheck: process.env.ENABLE_HEALTH_CHECK !== 'false',
    },
  };

  return config;
}

/**
 * Load configuration
 */
export const config = loadConfig();

/**
 * Log configuration (redact sensitive values)
 */
export function logConfig(): void {
  const safeConfig = {
    nodeEnv: config.nodeEnv,
    port: config.port,
    host: config.host,
    database: {
      poolSize: config.database.poolSize,
      maxConnections: config.database.maxConnections,
    },
    redis: {
      maxRetries: config.redis.maxRetries,
    },
    execution: {
      maxConcurrentOrders: config.execution.maxConcurrentOrders,
      orderTimeoutMs: config.execution.orderTimeoutMs,
    },
    logging: config.logging,
    features: config.features,
  };

  logger.info('📋 Configuration loaded', safeConfig);
}

export default config;
