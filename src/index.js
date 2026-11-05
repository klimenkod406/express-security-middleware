/**
 * express-security-middleware
 *
 * Tiered rate limiting and upload validation for Express applications.
 */

const {
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
} = require('./rateLimiter');

const { FileValidator, VALIDATION_CONFIG } = require('./fileValidator');

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
  FileValidator,
  VALIDATION_CONFIG,
};

