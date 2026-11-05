const {
  apiLimiter,
  authLimiter,
  uploadLimiter,
  heartbeatLimiter,
  applyRateLimiter,
  RATE_LIMIT_CONFIG,
} = require('../src/rateLimiter');

describe('rateLimiter', () => {
  describe('configuration', () => {
    test('api budget', () => {
      expect(RATE_LIMIT_CONFIG.api.windowMs).toBe(15 * 60 * 1000);
      expect(RATE_LIMIT_CONFIG.api.max).toBe(100);
    });

    test('auth budget is tighter than api', () => {
      expect(RATE_LIMIT_CONFIG.auth.windowMs).toBe(15 * 60 * 1000);
      expect(RATE_LIMIT_CONFIG.auth.max).toBe(5);
      expect(RATE_LIMIT_CONFIG.auth.max).toBeLessThan(RATE_LIMIT_CONFIG.api.max);
    });

    test('upload budget', () => {
      expect(RATE_LIMIT_CONFIG.upload.windowMs).toBe(60 * 60 * 1000);
      expect(RATE_LIMIT_CONFIG.upload.max).toBe(50);
    });

    test('heartbeat budget is the shortest window', () => {
      expect(RATE_LIMIT_CONFIG.heartbeat.windowMs).toBe(60 * 1000);
      expect(RATE_LIMIT_CONFIG.heartbeat.max).toBe(10);
      expect(RATE_LIMIT_CONFIG.heartbeat.windowMs).toBeLessThan(
        RATE_LIMIT_CONFIG.api.windowMs
      );
    });

    test('every budget carries an error message', () => {
      for (const key of Object.keys(RATE_LIMIT_CONFIG)) {
        const budget = RATE_LIMIT_CONFIG[key];
        expect(budget.message.success).toBe(false);
        expect(typeof budget.message.message).toBe('string');
        expect(budget.message.message.length).toBeGreaterThan(0);
      }
    });
  });

  describe('middleware factories', () => {
    test('all four limiters are functions', () => {
      for (const limiter of [
        apiLimiter,
        authLimiter,
        uploadLimiter,
        heartbeatLimiter,
      ]) {
        expect(typeof limiter).toBe('function');
      }
    });

    test('applyRateLimiter is a function', () => {
      expect(typeof applyRateLimiter).toBe('function');
    });
  });

  describe('applyRateLimiter()', () => {
    let mockApp;

    beforeEach(() => {
      mockApp = { use: jest.fn() };
    });

    test('registers every limiter on its path', () => {
      applyRateLimiter(mockApp);

      expect(mockApp.use).toHaveBeenCalledWith('/api', expect.any(Function));
      expect(mockApp.use).toHaveBeenCalledWith('/api/login', expect.any(Function));
      expect(mockApp.use).toHaveBeenCalledWith(
        '/api/auth-check',
        expect.any(Function)
      );
      expect(mockApp.use).toHaveBeenCalledWith('/upload', expect.any(Function));
      expect(mockApp.use).toHaveBeenCalledWith(
        '/api/device/heartbeat',
        expect.any(Function)
      );
    });

    test('registers the general api limiter before the strict auth one', () => {
      applyRateLimiter(mockApp);

      const paths = mockApp.use.mock.calls.map((call) => call[0]);
      expect(paths.indexOf('/api')).toBeLessThan(paths.indexOf('/api/login'));
    });
  });
});
