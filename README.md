# express-security-middleware

[![CI](https://github.com/klimenkod406/express-security-middleware/actions/workflows/ci.yml/badge.svg)](https://github.com/klimenkod406/express-security-middleware/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Two drop-in Express middlewares that close the two most common holes in a
small API: **unlimited request rates** and **unchecked file uploads**.

No internal dependencies. `express-rate-limit` is the only runtime requirement.

```text
                 ┌──────────────────────────────────────────┐
  /api/*         │ api limiter        100 req / 15 min      │
  /api/login  ──▶│ + auth limiter       5 req / 15 min      │──▶ 429 when spent
  /api/auth-check│ + heartbeat limiter 10 req / 1 min       │
  /upload/*   ──▶│ + upload limiter    50 req / 1 hour      │
                 └──────────────────────────────────────────┘

  uploaded file ──▶ FileValidator ──▶ size ✓ extension ✓ MIME ✓ name ✓
```

Open-source reference implementation extracted from my commercial work on a
B2B media platform (proprietary business logic removed).

## Install

```bash
npm install express-security-middleware
```

## Rate limiting

```js
const express = require('express');
const { applyRateLimiter } = require('express-security-middleware');

const app = express();
applyRateLimiter(app);
```

That registers four limiters, each on the routes it belongs to:

| Path | Budget | Why |
|---|---|---|
| `/api` | 100 / 15 min | general API traffic |
| `/api/login`, `/api/auth-check` | 5 / 15 min | blunts brute force |
| `/upload` | 50 / 1 hour | uploads are expensive |
| `/api/device/heartbeat` | 10 / 1 min | heartbeats are frequent by design |

Registration order matters: `/api` is mounted first, so the strict auth
limiter sits *in front of* the general one and login attempts are counted
against both budgets.

### Isolated counters

Each limiter is created by a factory, so two applications never share a
request counter:

```js
const { createApiLimiter, createAuthLimiter } = require('express-security-middleware');

app.use('/api', createApiLimiter());
app.use('/api/login', createAuthLimiter());
```

`applyRateLimiter` builds a fresh set by default and returns them, so you can
inspect or override later:

```js
const limiters = applyRateLimiter(app);
console.log(limiters.api); // the middleware that was mounted
```

### Response headers

`standardHeaders: true` emits the
[draft-ietf-httpapi-ratelimit-headers](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/)
format — one header per value:

```text
ratelimit-limit: 100
ratelimit-remaining: 99
ratelimit-reset: 900
ratelimit-policy: 100;w=900
```

When the budget is spent the response is `429` with a JSON body:

```json
{ "success": false, "message": "Too many requests, please try again later" }
```

## File validation

```js
const { FileValidator } = require('express-security-middleware');

const validator = new FileValidator();

const result = validator.validate({
  originalname: 'holiday.jpg',
  mimetype: 'image/jpeg',
  size: 1024 * 1024,
});

result.valid;  // true
result.errors; // []
```

Every check must pass:

- **Size** — at most 100 MB by default.
- **Extension** — must be on the allowlist (`.jpg`, `.png`, `.mp4`, …).
- **Forbidden extension** — a blocklist of executables (`.exe`, `.bat`, `.sh`,
  `.php`, `.ps1`, …) is checked *separately*, so a permissive allowlist can
  never re-admit one.
- **MIME type** — must match an allowed image or video type.
- **Filename** — no empty names, no names over 255 characters, no characters
  that are illegal or special on common filesystems, and no path traversal.

### Batches

```js
const result = validator.validateMultiple(files);

result.valid;   // false if any file failed
result.results; // per-file { index, filename, valid, errors }
result.errors;  // one human-readable line per failed file
```

### Writing to disk

`sanitizeFilename` produces a safe on-disk name: the extension is kept, every
other character is replaced, the stem is capped at 100 characters, and a
timestamp plus random suffix is prepended so two uploads of the same name
never collide.

```js
validator.sanitizeFilename('test file.jpg');
// '1762345678901_a1b2c3_test_file.jpg'
```

### Overriding the rules

```js
const validator = new FileValidator({
  maxFileSize: 50 * 1024 * 1024,
  allowedExtensions: ['.jpg', '.png'],
});
```

## Design notes

- **No internal dependencies.** Both files import only Node built-ins plus
  `express-rate-limit`.
- **Isolated state by construction.** The factory functions exist because
  module-level singletons silently share a counter between two applications
  — and make tests order-dependent.
- **A blocklist next to the allowlist.** Extension checks alone are not
  enough; a client controls the name it sends.
- **Filename checks are separate from extension checks.** `isValidFilename`
  is what stops `../etc/passwd`, independently of what the extension is.
- **Errors are collected, not thrown.** `validate` returns every problem it
  found rather than stopping at the first, so the client gets a complete
  list in one round trip.

## Testing

```bash
npm test
npm test -- --coverage
```

51 tests across three suites:

- **unit** — budget values, limiter factories, route registration and
  ordering, and every branch of the file validator including the
  `formatFileSize` boundaries.
- **integration** — real HTTP requests through an Express app, asserting that
  each budget actually returns `429` once exhausted, that the counters are
  independent, and that the rate limit headers are exposed.

Coverage is 96% of statements with 100% of functions.

## License

MIT
