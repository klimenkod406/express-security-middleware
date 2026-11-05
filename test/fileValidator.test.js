const { FileValidator, VALIDATION_CONFIG } = require('../src/fileValidator');

describe('FileValidator', () => {
  let validator;

  beforeEach(() => {
    validator = new FileValidator();
  });

  describe('constructor', () => {
    test('uses the default configuration', () => {
      const defaultValidator = new FileValidator();
      expect(defaultValidator.config.maxFileSize).toBe(104857600);
    });

    test('accepts overrides', () => {
      const custom = new FileValidator({ maxFileSize: 52428800 });
      expect(custom.config.maxFileSize).toBe(52428800);
      // untouched keys keep their defaults
      expect(custom.config.allowedExtensions).toEqual(
        VALIDATION_CONFIG.allowedExtensions
      );
    });
  });

  describe('validate()', () => {
    test('accepts a valid image', () => {
      const result = validator.validate({
        originalname: 'test.jpg',
        mimetype: 'image/jpeg',
        size: 1024 * 1024,
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('accepts a valid video', () => {
      const result = validator.validate({
        originalname: 'video.mp4',
        mimetype: 'video/mp4',
        size: 10 * 1024 * 1024,
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('rejects a missing file', () => {
      const result = validator.validate(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('No file provided');
    });

    test('rejects an oversized file', () => {
      const result = validator.validate({
        originalname: 'large.jpg',
        mimetype: 'image/jpeg',
        size: 200 * 1024 * 1024,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('size'))).toBe(true);
    });

    test('rejects a disallowed extension', () => {
      const result = validator.validate({
        originalname: 'file.exe',
        mimetype: 'application/octet-stream',
        size: 1024,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('extension'))).toBe(true);
    });

    test('rejects a forbidden extension even when allowlisted', () => {
      // A permissive allowlist must not re-admit an executable.
      const permissive = new FileValidator({
        allowedExtensions: ['.php'],
      });
      const result = permissive.validate({
        originalname: 'script.php',
        mimetype: 'text/plain',
        size: 1024,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Forbidden'))).toBe(true);
    });

    test('rejects a disallowed MIME type', () => {
      const result = validator.validate({
        originalname: 'file.txt',
        mimetype: 'text/plain',
        size: 1024,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('MIME'))).toBe(true);
    });

    test('rejects an unsafe filename', () => {
      const result = validator.validate({
        originalname: '../etc/passwd',
        mimetype: 'image/png',
        size: 1024,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('name'))).toBe(true);
    });

    test('accepts a file without a declared MIME type', () => {
      const result = validator.validate({
        originalname: 'photo.png',
        size: 1024,
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('validateMultiple()', () => {
    test('accepts a batch of valid files', () => {
      const result = validator.validateMultiple([
        { originalname: 'test1.jpg', mimetype: 'image/jpeg', size: 1024 },
        { originalname: 'test2.png', mimetype: 'image/png', size: 2048 },
      ]);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.results).toHaveLength(2);
    });

    test('reports which file failed', () => {
      const result = validator.validateMultiple([
        { originalname: 'test.jpg', mimetype: 'image/jpeg', size: 1024 },
        {
          originalname: 'virus.exe',
          mimetype: 'application/octet-stream',
          size: 1024,
        },
      ]);
      expect(result.valid).toBe(false);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].valid).toBe(true);
      expect(result.results[1].valid).toBe(false);
      expect(result.errors[0]).toContain('virus.exe');
    });

    test('rejects an empty batch', () => {
      const result = validator.validateMultiple([]);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('No files provided');
    });

    test('rejects a non-array', () => {
      const result = validator.validateMultiple('not-an-array');
      expect(result.valid).toBe(false);
    });
  });

  describe('isValidFilename()', () => {
    test('accepts ordinary names', () => {
      expect(validator.isValidFilename('test.jpg')).toBe(true);
      expect(validator.isValidFilename('my-file_123.png')).toBe(true);
    });

    test('rejects an empty name', () => {
      expect(validator.isValidFilename('')).toBe(false);
      expect(validator.isValidFilename(null)).toBe(false);
      expect(validator.isValidFilename(undefined)).toBe(false);
    });

    test('rejects a name longer than 255 characters', () => {
      expect(validator.isValidFilename('a'.repeat(256) + '.jpg')).toBe(false);
    });

    test('rejects dangerous characters', () => {
      expect(validator.isValidFilename('file<name>.jpg')).toBe(false);
      expect(validator.isValidFilename('file:name.jpg')).toBe(false);
      expect(validator.isValidFilename('file|name.jpg')).toBe(false);
      expect(validator.isValidFilename('file*name.jpg')).toBe(false);
    });

    test('rejects path traversal', () => {
      expect(validator.isValidFilename('../etc/passwd')).toBe(false);
      expect(validator.isValidFilename('folder/file.jpg')).toBe(false);
      expect(validator.isValidFilename('..')).toBe(false);
    });
  });

  describe('sanitizeFilename()', () => {
    test('replaces unsafe characters and keeps the extension', () => {
      const sanitized = validator.sanitizeFilename('test file.jpg');
      expect(sanitized).toMatch(/^\d+_[a-z0-9]+_test_file\.jpg$/);
    });

    test('strips angle brackets', () => {
      const sanitized = validator.sanitizeFilename('file<name>.jpg');
      expect(sanitized).not.toContain('<');
      expect(sanitized).not.toContain('>');
    });

    test('lowercases the extension', () => {
      expect(validator.sanitizeFilename('test.PNG')).toMatch(/\.png$/);
    });

    test('produces a unique name for the same input', () => {
      const a = validator.sanitizeFilename('same.jpg');
      const b = validator.sanitizeFilename('same.jpg');
      expect(a).not.toBe(b);
    });
  });

  describe('formatFileSize()', () => {
    test('formats zero', () => {
      expect(validator.formatFileSize(0)).toBe('0 Bytes');
    });

    test('formats bytes', () => {
      expect(validator.formatFileSize(512)).toBe('512 Bytes');
    });

    test('formats kilobytes', () => {
      expect(validator.formatFileSize(1024)).toBe('1 KB');
      expect(validator.formatFileSize(2048)).toBe('2 KB');
    });

    test('formats megabytes', () => {
      expect(validator.formatFileSize(1048576)).toBe('1 MB');
      expect(validator.formatFileSize(5242880)).toBe('5 MB');
    });

    test('formats gigabytes', () => {
      expect(validator.formatFileSize(1073741824)).toBe('1 GB');
    });

    test('is not limited to exact powers of 1024', () => {
      // A non-exact multiple must still report a sensible value.
      expect(validator.formatFileSize(1500000)).toBe('1.43 MB');
      expect(validator.formatFileSize(3000)).toBe('2.93 KB');
    });
  });

  describe('getFileType()', () => {
    test('detects images', () => {
      expect(validator.getFileType('test.jpg')).toBe('image');
      expect(validator.getFileType('test.png')).toBe('image');
      expect(validator.getFileType('test.webp')).toBe('image');
    });

    test('detects video', () => {
      expect(validator.getFileType('video.mp4')).toBe('video');
      expect(validator.getFileType('video.webm')).toBe('video');
      expect(validator.getFileType('video.mkv')).toBe('video');
    });

    test('reports unknown types', () => {
      expect(validator.getFileType('file.txt')).toBe('unknown');
      expect(validator.getFileType('file.pdf')).toBe('unknown');
    });
  });
});
