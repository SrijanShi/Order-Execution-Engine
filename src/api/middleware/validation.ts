import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../utils/logger';

/**
 * Validation error details
 */
export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Order execution request payload
 */
export interface ExecuteOrderRequest {
  tokenIn: string;
  tokenOut: string;
  amount: number;
  slippage: number;
}

/**
 * Health check response
 */
export interface HealthCheckResponse {
  status: string;
  queueLength: number;
  activeOrders: number;
  timestamp: Date;
}

/**
 * Validate order execution request
 */
export function validateExecuteOrderRequest(payload: any): { valid: boolean; errors?: ValidationError[] } {
  const errors: ValidationError[] = [];

  // Validate tokenIn
  if (!payload.tokenIn || typeof payload.tokenIn !== 'string' || payload.tokenIn.trim() === '') {
    errors.push({
      field: 'tokenIn',
      message: 'tokenIn is required and must be a non-empty string',
    });
  }

  // Validate tokenOut
  if (!payload.tokenOut || typeof payload.tokenOut !== 'string' || payload.tokenOut.trim() === '') {
    errors.push({
      field: 'tokenOut',
      message: 'tokenOut is required and must be a non-empty string',
    });
  }

  // Validate amount
  if (typeof payload.amount !== 'number' || payload.amount <= 0) {
    errors.push({
      field: 'amount',
      message: 'amount is required and must be a positive number',
    });
  }

  // Validate slippage
  if (typeof payload.slippage !== 'number' || payload.slippage < 0 || payload.slippage > 1) {
    errors.push({
      field: 'slippage',
      message: 'slippage is required and must be a number between 0 and 1',
    });
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Validate order ID format
 */
export function validateOrderId(orderId: string): boolean {
  // UUID v4 format validation
  const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidV4Regex.test(orderId) || /^[0-9a-f-]{36}$/i.test(orderId);
}

/**
 * Middleware for validating Content-Type
 */
export async function validateContentType(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (request.method === 'POST' || request.method === 'PUT') {
    const contentType = request.headers['content-type'];
    if (!contentType || !contentType.includes('application/json')) {
      reply.status(400).send({
        error: 'Invalid Content-Type',
        message: 'Content-Type must be application/json',
        timestamp: new Date(),
      });
    }
  }
}

/**
 * Middleware for error handling
 */
export async function errorHandler(error: any, request: FastifyRequest, reply: FastifyReply): Promise<void> {
  logger.error(`Error: ${error.message}`, {
    path: request.url,
    method: request.method,
    statusCode: error.statusCode || 500,
  });

  reply.status(error.statusCode || 500).send({
    error: error.message || 'Internal Server Error',
    timestamp: new Date(),
  });
}

/**
 * Middleware for CORS headers
 */
export async function corsMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  reply.header('Access-Control-Allow-Origin', '*');
  reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/**
 * Middleware for request logging
 */
export async function requestLoggingMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const startTime = Date.now();
  const onResponseHandler = () => {
    const duration = Date.now() - startTime;
    logger.info(`${request.method} ${request.url} ${reply.statusCode} ${duration}ms`);
  };
  reply.raw.on('finish', onResponseHandler);
}
