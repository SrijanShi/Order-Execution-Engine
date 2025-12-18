-- Initial database schema for DEX Order Engine

-- ============================================
-- ORDERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id VARCHAR(36) UNIQUE NOT NULL,
  user_id VARCHAR(255),
  reference_id VARCHAR(255),
  
  -- Order type and status
  type VARCHAR(50) NOT NULL CHECK (type IN ('market', 'limit', 'sniper')),
  status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'routing', 'building', 'submitted', 'confirmed', 'failed')),
  
  -- Token pair and amount
  token_in VARCHAR(255) NOT NULL,
  token_out VARCHAR(255) NOT NULL,
  amount DECIMAL(20, 8) NOT NULL,
  slippage DECIMAL(5, 4) NOT NULL,
  
  -- Execution details
  executed_dex VARCHAR(50),
  expected_price DECIMAL(20, 8),
  executed_price DECIMAL(20, 8),
  tx_hash VARCHAR(255),
  
  -- Retry tracking
  current_attempt INT DEFAULT 1,
  
  -- Error information
  error_code VARCHAR(100),
  error_message TEXT,
  error_timestamp TIMESTAMP,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes on orders table for performance
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at);

-- ============================================
-- EXECUTIONS TABLE (Audit Trail)
-- ============================================
CREATE TABLE IF NOT EXISTS executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id VARCHAR(36) UNIQUE NOT NULL,
  order_id VARCHAR(36) NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  
  -- DEX and execution details
  dex_used VARCHAR(50) NOT NULL,
  execution_price DECIMAL(20, 8),
  tx_hash VARCHAR(255),
  status VARCHAR(50) NOT NULL,
  
  -- Fee information
  fee DECIMAL(20, 8),
  fee_bps INT,
  
  -- Error tracking
  error_code VARCHAR(100),
  error_message TEXT,
  
  -- Performance tracking
  duration_ms INT,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes on executions table for performance
CREATE INDEX IF NOT EXISTS idx_executions_order_id ON executions(order_id);
CREATE INDEX IF NOT EXISTS idx_executions_dex_used ON executions(dex_used);
CREATE INDEX IF NOT EXISTS idx_executions_created_at ON executions(created_at);
CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);
CREATE INDEX IF NOT EXISTS idx_executions_dex_created ON executions(dex_used, created_at);

-- ============================================
-- PRICE HISTORY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint VARCHAR(255) NOT NULL,
  dex VARCHAR(50) NOT NULL,
  price DECIMAL(20, 8) NOT NULL,
  liquidity DECIMAL(20, 8),
  price_impact DECIMAL(5, 4),
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes on price history table for performance
CREATE INDEX IF NOT EXISTS idx_price_history_token_mint ON price_history(token_mint);
CREATE INDEX IF NOT EXISTS idx_price_history_dex ON price_history(dex);
CREATE INDEX IF NOT EXISTS idx_price_history_recorded_at ON price_history(recorded_at);
CREATE INDEX IF NOT EXISTS idx_price_history_token_dex ON price_history(token_mint, dex);
CREATE INDEX IF NOT EXISTS idx_price_history_token_created ON price_history(token_mint, recorded_at);