import { OrderStatus, OrderType, Metadata, DexType } from './common';

export interface SubmitOrderRequest {
  // Required fields
  tokenIn: string;           
  tokenOut: string;          
  amount: number;            
  
  slippage?: number;         
  orderType?: OrderType;     
  userId?: string;
  referenceId?: string;      
}


export interface Order {
  // Identifiers
  orderId: string;           
  userId?: string;
  referenceId?: string;
  
  // Order details
  type: OrderType;
  tokenIn: string;
  tokenOut: string;
  amount: number;
  slippage: number;
  
  // Status tracking
  status: OrderStatus;
  currentAttempt: number;    
  
  executedDex?: DexType;
  expectedPrice?: number;
  executedPrice?: number;
  txHash?: string;

  error?: {
    code: string;
    message: string;
    timestamp: Date;
  };
  
  metadata: Metadata;
}


export interface SubmitOrderResponse {
  orderId: string;
  status: OrderStatus;
  message: string;
  estimatedTime?: string; 
}

export interface OrderStatusUpdate {
  orderId: string;
  status: OrderStatus;
  
  executedDex?: DexType;
  executedPrice?: number;
  txHash?: string;
  expectedPrice?: number;
  
  // Error information
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  
  // Metadata
  timestamp: Date;
  progress?: number; 
}


export interface OrderDetails extends Order {
  elapsedTime?: number;      
  estimatedRemaining?: number; 
  retryCount: number;
}


export interface OrderHistoryResponse {
  total: number;
  orders: OrderDetails[];
  page: number;
  limit: number;
  hasMore: boolean;
}


export interface OrderExecutionResult {
  orderId: string;
  success: boolean;
  status: OrderStatus;
  dex: DexType;
  executedPrice: number;
  txHash?: string;
  error?: {
    code: string;
    message: string;
  };
  executedAt: Date;
  totalDuration: number; 
}


export interface QueuedOrder extends Order {
  queuedAt: Date;
  priority: 'high' | 'normal' | 'low';
  retries: Array<{
    attempt: number;
    timestamp: Date;
    error?: string;
  }>;
}