/**
 * Upload validation: size, MIME type, extension and filename safety.
 *
 * Extension checks alone are not enough — a client controls the name it
 * sends. This validator cross-checks the declared MIME type against an
 * allowlist, rejects a blocklist of executable extensions, and refuses
 * filenames that try to escape the upload directory.
 *
 * No internal dependencies.
 */

const path = require('path');

/**
 * Validation rules.
 */
const VALIDATION_CONFIG = {
  /** Maximum accepted file size: 100 MB. */
  maxFileSize: 100 * 1024 * 1024,

  /** Allowed MIME types for images. */
  allowedImageMimes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],

  /** Allowed MIME types for video. */
  allowedVideoMimes: [
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska',
    'video/x-flv',
  ],

  /** Allowed file extensions. */
  allowedExtensions: [
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.webp',
    '.mp4',
    '.webm',
    '.mov',
    '.avi',
    '.mkv',
    '.flv',
  ],

  /** Extensions that are never accepted, even if somehow allowlisted. */
  forbiddenExtensions: [
    '.exe',
    '.bat',
    '.cmd',
    '.sh',
    '.php',
    '.html',
    '.htm',
    '.js',
    '.vbs',
    '.ps1',
  ],
};

/**
 * Validates uploaded files against a fixed rule set.
 */
class FileValidator {
  /**
   * @param {object} [config] Overrides merged over {@link VALIDATION_CONFIG}.
   */
  constructor(config = {}) {
    this.config = { ...VALIDATION_CONFIG, ...config };
  }

  /**
   * Validate a single uploaded file.
   *
   * @param {{originalname: string, size: number, mimetype?: string}} file
   *   A file object as produced by multer.
   * @returns {{valid: boolean, errors: string[]}}
   */
  validate(file) {
    const errors = [];

    if (!file) {
      return {
        valid: false,
        errors: ['No file provided'],
      };
    }

    if (file.size > this.config.maxFileSize) {
      errors.push(
        `File size exceeds maximum (${this.formatFileSize(
          file.size
        )} > ${this.formatFileSize(this.config.maxFileSize)})`
      );
    }

    const ext = path.extname(file.originalname).toLowerCase();
    if (!this.config.allowedExtensions.includes(ext)) {
      errors.push(`Disallowed file extension: ${ext}`);
    }

    if (this.config.forbiddenExtensions.includes(ext)) {
      errors.push(`Forbidden file extension: ${ext}`);
    }

    if (file.mimetype) {
      const isAllowedMime =
        this.config.allowedImageMimes.includes(file.mimetype) ||
        this.config.allowedVideoMimes.includes(file.mimetype);

      if (!isAllowedMime) {
        errors.push(`Disallowed MIME type: ${file.mimetype}`);
      }
    }

    if (!this.isValidFilename(file.originalname)) {
      errors.push('Unsafe file name');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate a batch of uploaded files, reporting per-file results.
   *
   * @param {Array<{originalname: string, size: number, mimetype?: string}>} files
   * @returns {{valid: boolean, results: object[], errors: string[]}}
   */
  validateMultiple(files) {
    if (!Array.isArray(files) || files.length === 0) {
      return {
        valid: false,
        results: [],
        errors: ['No files provided'],
      };
    }

    const results = [];
    const allErrors = [];

    files.forEach((file, index) => {
      const result = this.validate(file);
      results.push({
        index,
        filename: file.originalname,
        ...result,
      });

      if (!result.valid) {
        allErrors.push(
          `File ${index + 1} (${file.originalname}): ${result.errors.join(', ')}`
        );
      }
    });

    return {
      valid: allErrors.length === 0,
      results,
      errors: allErrors,
    };
  }

  /**
   * Check that a filename is safe to write to disk.
   *
   * Rejects empty names, names longer than 255 characters, names containing
   * characters that are illegal or special on common filesystems, and any
   * name that tries to traverse out of the target directory.
   *
   * @param {string} filename
   * @returns {boolean}
   */
  isValidFilename(filename) {
    if (!filename || filename.length === 0) {
      return false;
    }

    if (filename.length > 255) {
      return false;
    }

    const dangerousChars = /[<>:"|?*\\/]/;
    if (dangerousChars.test(filename)) {
      return false;
    }

    if (filename.includes('..') || filename.includes('/')) {
      return false;
    }

    return true;
  }

  /**
   * Produce a safe on-disk name for an uploaded file.
   *
   * Keeps the extension, replaces every other character, caps the stem
   * length and prefixes a timestamp plus random suffix so that two uploads
   * of the same name never collide.
   *
   * @param {string} filename
   * @returns {string}
   */
  sanitizeFilename(filename) {
    const ext = path.extname(filename).toLowerCase();

    let sanitizedName = path
      .basename(filename, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 100);

    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);

    return `${timestamp}_${random}_${sanitizedName}${ext}`;
  }

  /**
   * Render a byte count in human-readable form.
   *
   * @param {number} bytes
   * @returns {string}
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return (
      Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
    );
  }

  /**
   * Classify a file by its extension.
   *
   * @param {string} filename
   * @returns {'image'|'video'|'unknown'}
   */
  getFileType(filename) {
    const ext = path.extname(filename).toLowerCase();

    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const videoExts = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.flv'];

    if (imageExts.includes(ext)) return 'image';
    if (videoExts.includes(ext)) return 'video';

    return 'unknown';
  }
}

module.exports = {
  FileValidator,
  VALIDATION_CONFIG,
};
