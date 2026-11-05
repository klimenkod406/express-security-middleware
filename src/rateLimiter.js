/**
 * Tiered rate limiting for Express.
 *
 * A single global limit is the wrong tool for a mixed API: login needs a
 * much tighter budget than a read endpoint, and a device heartbeat that
 * fires every 30 seconds needs a completely different one. This module
 * provides four limiters with distinct budgets and one helper that wires
 * them onto the paths they belong to.
 *
 * Each limiter is produced by a factory so that two applications (or two
 * tests) never share a request counter. The module-level singletons are
 * exported for the common single-app case.
 *
 * No internal dependencies — only `express-rate-limit`.
 */

const rateLimit = require('express-rate-limit');

/**
 * Rate limit budgets, in one place so they can be reviewed at a glance.
 */
const RATE_LIMIT_CONFIG = {
  /** General API traffic. */
  api: {
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: {
      success: false,
      message: 'Too many requests, please try again later',
    },
  },

  /** Authentication attempts — tight, to blunt brute force. */
  auth: {
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: {
      success: false,
      message: 'Too many login attempts, please try again in 15 minutes',
    },
  },

  /** File uploads — expensive on disk and bandwidth. */
  upload: {
    windowMs: 60 * 60 * 1000,
    max: 50,
    message: {
      success: false,
      message: 'Too many uploads, please try again later',
    },
  },

  /** Device heartbeat — high frequency by design. */
  heartbeat: {
    windowMs: 60 * 1000,
    max: 10,
    message: {
      success: false,
      message: 'Heartbeat sent too frequently',
    },
  },
};

/**
 * Build a limiter from a budget entry.
 *
 * @param {object} budget One entry of {@link RATE_LIMIT_CONFIG}.
 * @param {(req: object, res: object) => void} onExceeded Handler invoked when
 *   the budget is exhausted.
 * @param {object} [overrides] Extra options forwarded to `express-rate-limit`.
 * @returns {import('express').RequestHandler}
 */
function createLimiter(budget, onExceeded, overrides = {}) {
  return rateLimit({
    windowMs: budget.windowMs,
    max: budget.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: budget.message,
    handler: onExceeded,
    ...overrides,
  });
}

/**
 * General API limiter: 100 requests per 15 minutes.
 *
 * @param {object} [overrides]
 * @returns {import('express').RequestHandler}
 */
function createApiLimiter(overrides = {}) {
  return createLimiter(
    RATE_LIMIT_CONFIG.api,
    (req, res) => {
      console.log(`[RateLimit] API limit exceeded for ${req.ip}`);
      res.status(429).json(RATE_LIMIT_CONFIG.api.message);
    },
    overrides
  );
}

/**
 * Strict limiter for authentication: 5 attempts per 15 minutes.
 *
 * @param {object} [overrides]
 * @returns {import('express').RequestHandler}
 */
function createAuthLimiter(overrides = {}) {
  return createLimiter(
    RATE_LIMIT_CONFIG.auth,
    (req, res) => {
      console.warn(
        `[RateLimit] Auth limit exceeded for ${req.ip} - possible brute-force attempt`
      );
      res.status(429).json(RATE_LIMIT_CONFIG.auth.message);
    },
    overrides
  );
}

/**
 * Limiter for file uploads: 50 per hour.
 *
 * @param {object} [overrides]
 * @returns {import('express').RequestHandler}
 */
function createUploadLimiter(overrides = {}) {
  return createLimiter(
    RATE_LIMIT_CONFIG.upload,
    (req, res) => {
      console.log(`[RateLimit] Upload limit exceeded for ${req.ip}`);
      res.status(429).json(RATE_LIMIT_CONFIG.upload.message);
    },
    overrides
  );
}

/**
 * Limiter for device heartbeats: 10 per minute.
 *
 * @param {object} [overrides]
 * @returns {import('express').RequestHandler}
 */
function createHeartbeatLimiter(overrides = {}) {
  return createLimiter(
    RATE_LIMIT_CONFIG.heartbeat,
    (req, res) => {
      console.warn(`[RateLimit] Heartbeat limit exceeded for ${req.ip}`);
      res.status(429).json(RATE_LIMIT_CONFIG.heartbeat.message);
    },
    overrides
  );
}

/**
 * Shared instances for the common single-application case.
 *
 * Prefer the `create*Limiter` factories when you need an isolated counter.
 */
const apiLimiter = createApiLimiter();
const authLimiter = createAuthLimiter();
const uploadLimiter = createUploadLimiter();
const heartbeatLimiter = createHeartbeatLimiter();

/**
 * Wire every limiter onto the routes it belongs to.
 *
 * The order matters: `/api` is registered first so that it applies to all
 * API traffic, and the stricter `/api/login` limiter is registered afterwards
 * so that login requests are counted against both budgets.
 *
 * @param {import('express').Application} app
 * @param {object} [options]
 * @param {object} [options.limiters] Pre-built limiters. Defaults to a fresh
 *   set, so each application gets its own counters.
 * @returns {{api: Function, auth: Function, upload: Function, heartbeat: Function}}
 *   The limiters that were wired in.
 */
function applyRateLimiter(app, options = {}) {
  const limiters = options.limiters || {
    api: createApiLimiter(),
    auth: createAuthLimiter(),
    upload: createUploadLimiter(),
    heartbeat: createHeartbeatLimiter(),
  };

  app.use('/api', limiters.api);

  app.use('/api/login', limiters.auth);
  app.use('/api/auth-check', limiters.auth);

  app.use('/upload', limiters.upload);

  app.use('/api/device/heartbeat', limiters.heartbeat);

  console.log('[Security] Rate limiting enabled');

  return limiters;
}

module.exports = {
  apiLimiter,
  authLimiter,
  uploadLimiter,
  heartbeatLimiter,
  createApiLimiter,
  createAuthLimiter,
  createUploadLimiter,
  createHeartbeatLimiter,
  applyRateLimiter,
  RATE_LIMIT_CONFIG,
};
