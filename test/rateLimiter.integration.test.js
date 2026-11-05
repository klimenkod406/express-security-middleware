const express = require('express');
const request = require('supertest');

const {
  applyRateLimiter,
  RATE_LIMIT_CONFIG,
} = require('../src/rateLimiter');

/**
 * End-to-end checks: the limiters must actually return 429 once their
 * budget is exhausted, and must let traffic through before that.
 *
 * `express-rate-limit` keys on the client IP. Supertest connects over
 * loopback, so every request in a test shares one key - which is exactly
 * what we want when asserting that a budget is enforced.
 */
describe('rate limiting behaviour', () => {
  let app;

  beforeEach(() => {
    app = express();
    applyRateLimiter(app);
    app.get('/api/thing', (req, res) => res.json({ ok: true }));
    app.get('/api/login', (req, res) => res.json({ ok: true }));
    app.get('/upload', (req, res) => res.json({ ok: true }));
    app.get('/api/device/heartbeat', (req, res) => res.json({ ok: true }));
  });

  test('api traffic is served below the limit', async () => {
    const res = await request(app).get('/api/thing');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('api traffic is rejected with 429 once the budget is spent', async () => {
    const limit = RATE_LIMIT_CONFIG.api.max;

    for (let i = 0; i < limit; i += 1) {
      const res = await request(app).get('/api/thing');
      expect(res.status).toBe(200);
    }

    const blocked = await request(app).get('/api/thing');
    expect(blocked.status).toBe(429);
    expect(blocked.body.success).toBe(false);
    expect(typeof blocked.body.message).toBe('string');
  });

  test('auth routes are limited far more tightly than the general api', async () => {
    const limit = RATE_LIMIT_CONFIG.auth.max;

    for (let i = 0; i < limit; i += 1) {
      const res = await request(app).get('/api/login');
      expect(res.status).toBe(200);
    }

    const blocked = await request(app).get('/api/login');
    expect(blocked.status).toBe(429);
  });

  test('upload route has its own budget', async () => {
    const res = await request(app).get('/upload');
    expect(res.status).toBe(200);
  });

  test('upload budget is enforced independently', async () => {
    for (let i = 0; i < RATE_LIMIT_CONFIG.upload.max; i += 1) {
      const res = await request(app).get('/upload');
      expect(res.status).toBe(200);
    }

    const blocked = await request(app).get('/upload');
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toBe(RATE_LIMIT_CONFIG.upload.message.message);
  });

  test('heartbeat route has its own budget', async () => {
    const res = await request(app).get('/api/device/heartbeat');
    expect(res.status).toBe(200);
  });

  test('heartbeat budget is enforced independently', async () => {
    for (let i = 0; i < RATE_LIMIT_CONFIG.heartbeat.max; i += 1) {
      const res = await request(app).get('/api/device/heartbeat');
      expect(res.status).toBe(200);
    }

    const blocked = await request(app).get('/api/device/heartbeat');
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toBe(
      RATE_LIMIT_CONFIG.heartbeat.message.message
    );
  });

  test('rate limit headers are exposed', async () => {
    const res = await request(app).get('/api/thing');
    expect(res.status).toBe(200);

    // `standardHeaders: true` emits the draft-ietf-httpapi-ratelimit-headers
    // format: one header per value rather than a single combined header.
    expect(res.headers['ratelimit-limit']).toBe(
      String(RATE_LIMIT_CONFIG.api.max)
    );
    expect(res.headers['ratelimit-remaining']).toBe(
      String(RATE_LIMIT_CONFIG.api.max - 1)
    );
    expect(res.headers['ratelimit-reset']).toBeDefined();
    expect(res.headers['ratelimit-policy']).toContain(
      String(RATE_LIMIT_CONFIG.api.max)
    );
  });

  test('a 429 response carries the configured message', async () => {
    for (let i = 0; i < RATE_LIMIT_CONFIG.api.max; i += 1) {
      await request(app).get('/api/thing');
    }

    const blocked = await request(app).get('/api/thing');
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toBe(RATE_LIMIT_CONFIG.api.message.message);
  });
});
