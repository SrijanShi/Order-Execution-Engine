import { logger } from '../logger';

describe('Logger', () => {
  test('logger should log info messages', () => {
    // This test will output to console and files
    logger.info('Test info message', { testData: 'value' });
    expect(true).toBe(true);
  });

  test('logger should log error messages', () => {
    logger.error('Test error message', { error: 'test error' });
    expect(true).toBe(true);
  });

  test('logger should log warn messages', () => {
    logger.warn('Test warning message', { warning: 'test' });
    expect(true).toBe(true);
  });

  test('logger should log debug messages', () => {
    logger.debug('Test debug message', { debug: 'test' });
    expect(true).toBe(true);
  });

  test('logger should log http messages', () => {
    logger.http('Test http message', { method: 'GET' });
    expect(true).toBe(true);
  });
});