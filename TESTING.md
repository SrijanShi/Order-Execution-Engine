# Testing Guide

Comprehensive guide to running, writing, and understanding tests for the DEX Order Engine.

## Test Statistics

- **Total Tests:** 348
- **Test Suites:** 20
- **Coverage:** Core functionality, integration points
- **Framework:** Jest
- **Average Runtime:** ~20 seconds

## Quick Start

### Run All Tests
```bash
npm test
```

### Run Specific Test Suite
```bash
npm test -- dex.router
npm test -- execution
npm test -- websocket
npm test -- queue
npm test -- database
npm test -- retry
```

### Run with Options
```bash
# Verbose output
npm test -- --verbose

# Watch mode (re-run on file changes)
npm test -- --watch

# Coverage report
npm test -- --coverage

# Show open handles (for debugging)
npm test -- --detectOpenHandles

# Single thread (slower but more stable)
npm test -- --runInBand
```

## Test Structure

### Test Files by Component

| Component | Test File | Tests | Purpose |
|-----------|-----------|-------|---------|
| DEX Router | dex.router.integration.test.ts | 5 | Routing logic and price comparison |
| Queue | queue.integration.test.ts | 8 | Queue processing and state management |
| WebSocket | websocket.integration.test.ts | 9 | Connection and message handling |
| Execution | execution.integration.test.ts | 10 | Order execution state machine |
| Database | database.integration.test.ts | 10 | Persistence and query operations |
| API Server | server.test.ts | 27 | REST API endpoints |
| Cache | cache/*.test.ts | 33 | Redis caching strategies |
| Retry Logic | retry.test.ts | 35+ | Exponential backoff and retries |
| Error Handling | error-handling.test.ts | 39 | Error classification and handling |
| Utils | utils/*.test.ts | 12 | Logging, utilities |

### Test Categories

**Unit Tests:**
- Individual function/method testing
- Isolated from external dependencies
- Fast execution (<100ms each)

**Integration Tests:**
- Component interaction testing
- Multiple components working together
- Database and Redis included
- Slower but more realistic (100-500ms each)

**E2E Tests:**
- Complete flow testing (Coming soon)
- Full order lifecycle
- External API simulation

## Writing Tests

### Test Template

```typescript
import { ComponentName } from '../path/to/component';

describe('Component Name - Test Category', () => {
  let component: ComponentName;
  
  beforeAll(() => {
    component = new ComponentName();
  });
  
  afterAll(async () => {
    // Cleanup
  });
  
  test('should do something specific', () => {
    const result = component.method();
    expect(result).toBeDefined();
  });
  
  test('should handle error case', () => {
    expect(() => {
      component.errorMethod();
    }).toThrow();
  });
});
```

### Best Practices

1. **Clear Test Names:**
   ```typescript
   // ✅ Good
   test('should return best quote when multiple quotes available', () => {
   
   // ❌ Bad
   test('test quotes', () => {
   ```

2. **Arrange-Act-Assert Pattern:**
   ```typescript
   test('should execute order successfully', () => {
     // Arrange
     const order = createTestOrder();
     
     // Act
     const result = await engine.executeOrder(order);
     
     // Assert
     expect(result.status).toBe('CONFIRMED');
   });
   ```

3. **Use Descriptive Assertions:**
   ```typescript
   // ✅ Good
   expect(stats.successRate).toBeGreaterThanOrEqual(95);
   
   // ❌ Bad
   expect(stats.successRate > 95).toBe(true);
   ```

4. **Group Related Tests:**
   ```typescript
   describe('Price Impact Calculation', () => {
     test('should calculate for small amounts', () => {});
     test('should calculate for large amounts', () => {});
     test('should handle zero impact', () => {});
   });
   ```

## Running Tests in Different Scenarios

### Development

```bash
# Watch mode for active development
npm test -- --watch

# Run only tests matching pattern
npm test -- --testNamePattern="router"

# Run only failed tests
npm test -- --onlyChanged
```

### CI/CD Pipeline

```bash
# Full test with coverage
npm test -- --coverage --ci --bail

# Generate reports
npm test -- --coverage --collectCoverageFrom="src/**/*.ts"
```

### Debugging Tests

```bash
# Run with debugging output
npm test -- --verbose

# Inspect with Node debugger
node --inspect-brk ./node_modules/.bin/jest --runInBand

# Run single test file
npm test -- dex.router.integration.test.ts
```

## Test Coverage

### Current Coverage Goals

- **Statements:** 80%+
- **Branches:** 75%+
- **Functions:** 80%+
- **Lines:** 80%+

### Generate Coverage Report

```bash
npm test -- --coverage
```

Report location: `coverage/lcov-report/index.html`

## Integration Tests Details

### DEX Router Tests (5 tests)

**What it tests:**
- Routing order to best DEX
- Price comparison logic
- Different token pairs
- Quote structure validation
- Consistent result generation

**Setup:**
```typescript
const router = new DexRouter();
const result = await router.routeOrder('SOL', 'USDC', 1.5, 0.5);
```

**Key Assertions:**
- `result.allQuotes` is array
- `result.bestQuote` exists when quotes available
- `result.source` is defined
- Quote prices > 0

### Queue Processing Tests (8 tests)

**What it tests:**
- Queue initialization
- Order statistics tracking
- Pending/processing/successful order states
- Event listener functionality
- Concurrent processing

**Setup:**
```typescript
const queue = new OrderQueue(router);
await queue.initialize();
const state = queue.getQueueState();
```

**Key Assertions:**
- Queue state is defined
- State methods exist and work
- Event listeners register properly

### WebSocket Tests (9 tests)

**What it tests:**
- Client connection management
- Subscription/unsubscription
- Broadcasting updates
- Connection counting
- Statistics collection

**Setup:**
```typescript
const manager = new WebSocketManager();
manager.registerClient('client-1', mockSocket);
```

**Key Assertions:**
- Client registration works
- Broadcasting doesn't throw
- Statistics track correctly

### Execution Engine Tests (10 tests)

**What it tests:**
- Engine initialization
- Statistics tracking
- State distribution
- Event emitter functionality
- Consistent metrics

**Setup:**
```typescript
const engine = new ExecutionEngine(router, config);
const stats = engine.getStats();
```

**Key Assertions:**
- Stats properties exist
- Failure rate is 0-100
- Execution time >= 0

### Database Tests (10 tests)

**What it tests:**
- Query execution
- Result handling
- Concurrent queries
- Empty result sets
- Error recovery
- Transaction support

**Setup:**
```typescript
await db.initialize();
const result = await db.query('SELECT 1');
```

**Key Assertions:**
- Queries execute successfully
- Results contain rows
- Concurrent queries all complete
- Connection recovers from errors

## Troubleshooting Tests

### Tests Timing Out

```
Timeout - Async callback was not invoked within the 5000 ms timeout specified
```

**Solution:**
```bash
# Increase timeout for specific test
test('slow test', async () => {
  // test code
}, 10000); // 10 second timeout

# Or globally in jest.config.js
testTimeout: 10000
```

### Memory Leaks

```
A worker process has failed to exit gracefully
```

**Solution:**
- Add proper cleanup in `afterAll` hooks
- Close database connections
- Clear timers with `.unref()`
- Use `--runInBand` for sequential execution

### Flaky Tests

Intermittent failures indicate race conditions or timing issues:

```typescript
// ✅ Fix: Add retry or timeout
test('should eventually succeed', async () => {
  await waitFor(() => {
    expect(value).toBe(expected);
  }, { timeout: 1000 });
});
```

### Database Connection Errors

```
Error: Cannot connect to database
```

**Solution:**
```bash
# Start services first
docker-compose up -d postgres redis

# Wait for health checks
docker-compose ps

# Then run tests
npm test
```

## Continuous Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      
      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
    - uses: actions/checkout@v2
    - uses: actions/setup-node@v2
      with:
        node-version: 18
    
    - run: npm install
    - run: npm run build
    - run: npm test -- --coverage
    
    - uses: codecov/codecov-action@v2
      with:
        files: ./coverage/lcov.info
```

## Performance Testing

### Load Testing

```bash
# Test with high concurrency (coming soon)
npm run test:load

# Stress test
npm run test:stress
```

### Profile Tests

```bash
# Find slow tests
npm test -- --listTests | xargs -I {} time npm test {}
```

## Test Maintenance

### Regular Updates

- Update test fixtures as code changes
- Add tests for new features
- Remove tests for deprecated features
- Refactor test helpers when duplicated

### Test Review

Before committing:
- [ ] All tests pass locally
- [ ] Coverage not decreased
- [ ] Tests are meaningful
- [ ] No skipped tests (`.skip`)
- [ ] No pending tests (`.todo`)

## Advanced Testing

### Mock External Services

```typescript
jest.mock('../router/dex-router', () => ({
  DexRouter: jest.fn().mockImplementation(() => ({
    routeOrder: jest.fn().mockResolvedValue({
      bestQuote: { price: 100, amountOut: 1 },
      allQuotes: [],
      source: 'FALLBACK'
    })
  }))
}));
```

### Test Fixtures

```typescript
const createTestOrder = (): Order => ({
  orderId: 'test-order',
  tokenIn: 'SOL',
  tokenOut: 'USDC',
  amountIn: 1.5,
  slippage: 0.5,
  type: 'MARKET',
  status: 'PENDING',
  currentAttempt: 0,
  metadata: {}
});
```

### Async Testing

```typescript
test('should handle async operations', async () => {
  const result = await asyncOperation();
  expect(result).toBeDefined();
});

test('should catch async errors', async () => {
  await expect(failingAsyncOp()).rejects.toThrow();
});
```

## Resources

- [Jest Documentation](https://jestjs.io/)
- [Testing Library](https://testing-library.com/)
- [Node.js Testing](https://nodejs.org/en/knowledge/testing/)

## Next Steps

- Add E2E tests with full order lifecycle
- Performance benchmarking suite
- Stress testing framework
- Load testing scenarios
- Integration tests with real DEXs (testnet)

---

For more information:
- [API Documentation](API.md)
- [Architecture Guide](ARCHITECTURE.md)
- [Configuration](CONFIG.md)
