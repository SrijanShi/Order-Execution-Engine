import winston from 'winston';
import path from 'path';

/**
 * Winston Logger Configuration
 * Provides structured logging with multiple transports
 */

const logDir = path.join(process.cwd(), 'logs');

// Define custom log levels
const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
  },
  colors: {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'white',
  },
};

// Create the logger
export const logger = winston.createLogger({
  levels: customLevels.levels,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.metadata(),
    winston.format.printf(({ level, message, timestamp, metadata, stack }) => {
      const meta = metadata && Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : '';
      return `${timestamp} [${level.toUpperCase()}]: ${message} ${meta} ${stack || ''}`.trim();
    })
  ),
  transports: [
    // Console transport for all environments
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize({ colors: customLevels.colors }),
        winston.format.printf(({ level, message, timestamp, metadata }) => {
          const icon = getLogIcon(level);
          const meta = metadata && Object.keys(metadata).length > 0 
            ? `\n  ${JSON.stringify(metadata, null, 2)}` 
            : '';
          return `${icon} [${timestamp}] [${level}] ${message}${meta}`;
        })
      ),
    }),

    // Error file transport
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.json()
      ),
    }),

    // Combined file transport
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.json()
      ),
    }),
  ],
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logDir, 'exceptions.log'),
      format: winston.format.json(),
    }),
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logDir, 'rejections.log'),
      format: winston.format.json(),
    }),
  ],
});

/**
 * Get emoji icon for log level
 */
function getLogIcon(level: string): string {
  const icons: Record<string, string> = {
    error: '❌',
    warn: '⚠️',
    info: 'ℹ️',
    http: '🌐',
    debug: '🔍',
  };
  return icons[level] || '📝';
}

/**
 * Handle uncaught exceptions
 */
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', { error: error.message, stack: error.stack });
  process.exit(1);
});

/**
 * Handle unhandled promise rejections
 */
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason });
});

/**
 * Export logger methods for convenient usage
 */
export default logger;