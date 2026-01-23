/**
 * Error logging utility for production monitoring
 */

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ErrorLog {
  message: string;
  severity: ErrorSeverity;
  timestamp: Date;
  stack?: string;
  context?: Record<string, unknown>;
  userId?: number;
}

class ErrorLogger {
  private logs: ErrorLog[] = [];
  private maxLogs = 100;

  log(error: Error | string, severity: ErrorSeverity = 'medium', context?: Record<string, unknown>) {
    const errorLog: ErrorLog = {
      message: typeof error === 'string' ? error : error.message,
      severity,
      timestamp: new Date(),
      stack: typeof error === 'object' ? error.stack : undefined,
      context,
    };

    this.logs.push(errorLog);

    // Keep only recent logs
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Log to console in development
    if (import.meta.env.DEV) {
      console.error('[ErrorLogger]', errorLog);
    }

    // In production, send to monitoring service
    if (import.meta.env.PROD && severity === 'critical') {
      this.sendToMonitoring(errorLog);
    }
  }

  private async sendToMonitoring(errorLog: ErrorLog) {
    try {
      // Send to monitoring endpoint
      await fetch('/api/errors/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorLog),
      });
    } catch (err) {
      // Silently fail - don't want error logging to break the app
      console.error('Failed to send error to monitoring:', err);
    }
  }

  getLogs(): ErrorLog[] {
    return [...this.logs];
  }

  clearLogs() {
    this.logs = [];
  }
}

export const errorLogger = new ErrorLogger();

// Global error handler
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    errorLogger.log(event.error || event.message, 'high', {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    errorLogger.log(
      event.reason instanceof Error ? event.reason : String(event.reason),
      'high',
      { type: 'unhandledRejection' }
    );
  });
}
