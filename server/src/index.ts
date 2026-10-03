import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config, validateEnvironment } from './config/index.js';
import { logger } from './utils/logger.js';
import apiRouter from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { generalLimiter } from './middleware/rateLimiter.js';

// Validate environment variables on startup (fails fast in production)
validateEnvironment();

const app = express();

// Security headers (H1)
app.use(
  helmet({
    contentSecurityPolicy: config.isProduction ? undefined : false,
    crossOriginEmbedderPolicy: false,
  })
);

// Request correlation ID (M3)
app.use(requestIdMiddleware);

// CORS configuration (L3)
app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
  })
);

// Rate limiting (H2)
app.use('/api', generalLimiter);

// Request body size limits (H3)
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// API Routes
app.use('/api', apiRouter);

// 404 & Global Error Handlers (M2)
app.use(notFoundHandler);
app.use(errorHandler);

// Start server if not running inside test runner
let server: ReturnType<typeof app.listen> | null = null;

if (process.env.NODE_ENV !== 'test') {
  server = app.listen(config.port, () => {
    logger.info(`Server running in ${config.nodeEnv} mode on http://localhost:${config.port}`);
    logger.info(`Health check available at http://localhost:${config.port}/api/health`);
  });

  // Graceful shutdown handling (H8)
  const handleShutdown = (signal: string) => {
    logger.info(`Received ${signal}. Initiating graceful shutdown...`);
    if (server) {
      server.close((err) => {
        if (err) {
          logger.error('Error during server shutdown', err);
          process.exit(1);
        }
        logger.info('HTTP server closed successfully.');
        process.exit(0);
      });

      // Force exit after 10 seconds if connections refuse to close
      setTimeout(() => {
        logger.error('Forced shutdown: timeout waiting for open connections to close.');
        process.exit(1);
      }, 10000).unref();
    } else {
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

export default app;
