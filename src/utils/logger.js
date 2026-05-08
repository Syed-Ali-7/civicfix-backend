/**
 * Simple Logger Utility
 * Provides colored console logging with levels
 * Can be easily disabled in production
 */

const isDevelopment = process.env.NODE_ENV !== 'production';

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

class Logger {
  /**
   * Error logs - Always shown
   */
  error(message, data = null) {
    console.error(`${colors.red}❌ [ERROR]${colors.reset}`, message);
    if (data) console.error(data);
  }

  /**
   * Warning logs - Always shown
   */
  warn(message, data = null) {
    console.warn(`${colors.yellow}⚠️  [WARN]${colors.reset}`, message);
    if (data) console.warn(data);
  }

  /**
   * Info logs - Always shown
   */
  info(message, data = null) {
    console.log(`${colors.cyan}ℹ️  [INFO]${colors.reset}`, message);
    if (data) console.log(data);
  }

  /**
   * Success logs - Always shown
   */
  success(message, data = null) {
    console.log(`${colors.green}✅ [SUCCESS]${colors.reset}`, message);
    if (data) console.log(data);
  }

  /**
   * Debug logs - Only in development
   */
  debug(message, data = null) {
    if (isDevelopment) {
      console.log(`${colors.magenta}🔍 [DEBUG]${colors.reset}`, message);
      if (data) console.log(data);
    }
  }

  /**
   * API request logs - Only in development
   */
  request(method, path, data = null) {
    if (isDevelopment) {
      console.log(
        `${colors.blue}📥 [REQUEST]${colors.reset} ${method.toUpperCase()} ${path}`
      );
      if (data) console.log(data);
    }
  }

  /**
   * API response logs - Only in development
   */
  response(status, path, data = null) {
    if (isDevelopment) {
      const statusColor = status >= 400 ? colors.red : colors.green;
      console.log(
        `${statusColor}📤 [RESPONSE]${colors.reset} ${status} ${path}`
      );
      if (data) console.log(data);
    }
  }

  /**
   * Separator for visual clarity
   */
  separator() {
    if (isDevelopment) {
      console.log('━'.repeat(60));
    }
  }
}

module.exports = new Logger();
