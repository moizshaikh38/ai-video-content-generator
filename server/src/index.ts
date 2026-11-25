import {startDurableWorkerAnnouncements} from './services/durableWorkerHandshake.js';
import {processNextAutomaticOneExport} from './services/automaticOneExportService.js';
import {processNextCoreSelectionContinuation} from './services/coreSelectionContinuationService.js';
import {coreSelectionContinuationEnabled} from './services/runtimePolicy.js';
import {processNextClipSelectionJob} from './services/clipSelectionDispatchService.js';
import {clipSelectionDispatchEnabled} from './services/runtimePolicy.js';
import {processNextCoreProcessingJob} from './services/coreProcessingDispatchService.js';
import {SubtitleStudioService} from './services/subtitleStudioService.js';
import {startAutopilotContinuationWorker,stopAutopilotContinuationWorker} from './services/autopilotContinuationWorker.js';
import {DatabaseBootstrapAttempt} from './services/databaseBootstrapAttempt.js';
import {databaseBootstrapAdmission} from './middleware/databaseBootstrapAdmission.js';
import {setDatabaseBootstrapState} from './services/databaseBootstrapState.js';
import {startRenderQueueWake} from './services/queue/renderQueueWake.js';
import {coreProcessingDispatchEnabled,subtitleBurnDispatchEnabled,runsBackgroundWorkers,acceptsApiRequests,validateRuntimePolicy,renderSweepInterval,runsPublishingWorker,runsMultimodalWorker} from './services/runtimePolicy.js';
import {workLifecycle,createShutdown,workAdmission,createTrackedPoller} from './services/queue/workLifecycle.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config, validateEnvironment } from './config/index.js';
import { logger } from './utils/logger.js';
import apiRouter from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { generalLimiter } from './middleware/rateLimiter.js';
import { bootstrapMongo } from './db/bootstrapMongo.js';
import { closeMongo, isMongoConfigured, getMongoDb } from './db/mongoClient.js';
import { UsageService } from './services/usageService.js';
import { CreditWalletService } from './services/creditWalletService.js';
import { socialService } from './services/socialService.js';
import { startPublishingWorker, stopPublishingWorker } from './services/publishing/publishingWorker.js';
import { ClipRenderService } from './services/clipRenderService.js';
import { UrlIngestionService } from './services/urlIngestionService.js';
import { VideoAnalysisWorker } from './services/multimodal/videoAnalysisWorker.js';
import { checkHealth, checkReadiness } from './controllers/healthController.js';
import { asyncHandler } from './middleware/errorHandler.js';

// Validate environment variables on startup (fails fast in production)
validateEnvironment();
validateRuntimePolicy();

const app = express();

// Trust reverse proxy ONLY when explicitly deployed behind one (TRUST_PROXY=on).
// Unconditional trust lets direct clients spoof X-Forwarded-For and evade
// IP-based rate limits.
if (config.trustProxy) {
  app.set('trust proxy', 1);
}

// Root health & readiness probes (Step 14: /health and /ready)
app.get('/health', asyncHandler(checkHealth));
app.get('/ready', asyncHandler(checkReadiness));

// Every admitted HTTP request stays tracked until its response closes. Nested
// background services register their own lifetime before returning HTTP 202.
app.use(workAdmission);

// Security headers (H1)
app.use(
  helmet({
    contentSecurityPolicy: config.isProduction ? undefined : false,
    crossOriginEmbedderPolicy: false,
  })
);

// Request correlation ID (M3)
app.use(requestIdMiddleware);

// CORS configuration (L3 & Step 6 CORS Hardening)
// Dev convenience: exact loopback hosts only — a substring check would admit
// attacker-controlled hosts like https://evil-localhost.attacker.com (audit L-2).
const LOOPBACK_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server, curl, mobile, and same-origin requests (no Origin header)
      if (!origin) return callback(null, true);
      if (config.corsAllowedOrigins.includes(origin)) return callback(null, true);
      if (!config.isProduction && LOOPBACK_ORIGIN_PATTERN.test(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);

// Rate limiting (H2)
app.use('/api', generalLimiter);

// Webhooks require the raw request body Buffer for cryptographic signature verification
app.use('/api/billing/webhooks/paddle', express.raw({ type: 'application/json' }));
app.use('/api/billing/webhooks/razorpay', express.raw({ type: 'application/json' }));

// Request body size limits (H3) + prototype-pollution guard: strip dangerous
// keys from every parsed JSON body before any service touches them.
const pollutionSafeReviver = (key: string, value: unknown) => {
  if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
    return undefined;
  }
  return value;
};

app.use(express.json({ limit: '1mb', reviver: pollutionSafeReviver }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// API Routes
if(acceptsApiRequests())app.use('/api', databaseBootstrapAdmission, apiRouter);
else app.use('/api',(_req,res)=>{res.status(503).json({status:'error',code:'WORKER_ONLY',message:'This service only runs background workers.'});});

// 404 & Global Error Handlers (M2)
app.use(notFoundHandler);
app.use(errorHandler);

// Start server if not running inside test runner
let server: ReturnType<typeof app.listen> | null = null;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;
let oauthCleanupTimer: ReturnType<typeof setInterval> | null = null;
let stopRenderWake:(()=>void)|undefined;
let renderSweepTimer: ReturnType<typeof setInterval> | null = null;
let stopDurableWorkerAnnouncements:(()=>void)|undefined;
let coreSelectionContinuationTimer:ReturnType<typeof setInterval>|null=null;
let clipSelectionTimer:ReturnType<typeof setInterval>|null=null;
let coreProcessingTimer:ReturnType<typeof setInterval>|null=null;
let subtitleBurnTimer: ReturnType<typeof setInterval> | null = null;
let multimodalSweepTimer: ReturnType<typeof setInterval> | null = null;
let dbRecoveryTimer: ReturnType<typeof setTimeout> | null = null;

if (process.env.NODE_ENV !== 'test') {
  // 1. Immediately bind HTTP port so Render and cloud port scanners detect open port in < 1 second
  server = app.listen(config.port, '0.0.0.0', () => {
    logger.info(`Server running in ${config.nodeEnv} mode on http://0.0.0.0:${config.port}`);
    logger.info(`Health check available at http://0.0.0.0:${config.port}/health`);
  });

  // 2. Initialize database & background workers asynchronously
  const bootstrapAttempt = new DatabaseBootstrapAttempt(() =>
    workLifecycle.run('database-bootstrap', () => bootstrapMongo())
  );
  const initDatabase = async () => {
    if (!isMongoConfigured) {
      setDatabaseBootstrapState('unconfigured');
      logger.info('MongoDB is not configured; running in unconfigured/stateless mode.');
      return;
    }

    let mongoReady = false;
    const maxRetries = config.isProduction ? 2 : 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      if(workLifecycle.isDraining())return;
      try {
        // A wait deadline is not cancellation. Reuse pending schema work on
        // retry; only a genuinely rejected attempt can start another writer.
        await bootstrapAttempt.wait(15_000);
        setDatabaseBootstrapState('ready');
        mongoReady = true;
        logger.info('Database bootstrap completed successfully.');
        break;
      } catch (err) {
        setDatabaseBootstrapState('failed');
        const errMsg = err instanceof Error ? err.message : String(err);
        if (attempt < maxRetries) {
          logger.warn(`Database connection attempt ${attempt}/${maxRetries} failed (${errMsg}). Retrying in 2s...`);
          await new Promise((resolve) => setTimeout(resolve, 2000));
        } else {
          logger.error('Database bootstrap failed after retries. Scheduling background recovery (requests requiring DB will return 503 until recovered).', { error: errMsg });
        }
      }
    }

    if (!mongoReady && !workLifecycle.isDraining()) {
      dbRecoveryTimer = setTimeout(() => {
        dbRecoveryTimer = null;
        if (!workLifecycle.isDraining()) {
          void workLifecycle.run('database-recovery', initDatabase).catch((error) => {
            logger.warn('Background database recovery attempt failed', { error: error instanceof Error ? error.message : String(error) });
          });
        }
      }, 15_000);
      dbRecoveryTimer.unref();
      return;
    }

    if (mongoReady && runsBackgroundWorkers() && !workLifecycle.isDraining()) {
      const cleanupWork = () => UsageService.cleanupOrphanedReservations(30)
        .then((count) => { if (count > 0) logger.info(`Released ${count} orphaned usage reservations.`); })
        .catch((error) => logger.warn('Usage reservation cleanup failed', { error: error instanceof Error ? error.message : String(error) }))
        .then(() => CreditWalletService.cleanupOrphanedReservations())
        .then((count) => { if (count && count > 0) logger.info(`Recovered ${count} orphaned credit reservations.`); })
        .catch((error) => logger.warn('Credit reservation recovery failed', { error: error instanceof Error ? error.message : String(error) }))
        .then(() => UrlIngestionService.pruneSourceCache())
        .then((pruned) => { if (pruned > 0) logger.info(`Pruned ${pruned} stale source-cache entries.`); })
        .catch((error) => logger.warn('Source cache prune failed', { error: error instanceof Error ? error.message : String(error) }));
      const cleanup=()=>{if(workLifecycle.isDraining())return;void workLifecycle.run('reservation-cache-cleanup',cleanupWork).catch(error=>logger.warn('Cleanup cycle failed',{error:String(error)}));};
      cleanup();
      cleanupTimer = setInterval(cleanup, 10 * 60_000);
      cleanupTimer.unref();

      // Periodic OAuth state cleanup (Step 18)
      const oauthCleanupWork = () => socialService.cleanupExpiredOAuthStates()
        .then((count) => { if (count > 0) logger.info(`Cleaned up ${count} expired/consumed OAuth state(s).`); })
        .catch((error) => logger.warn('OAuth state cleanup failed', { error: error instanceof Error ? error.message : String(error) }));
      const oauthCleanup=()=>{if(workLifecycle.isDraining())return;void workLifecycle.run('oauth-cleanup',oauthCleanupWork).catch(error=>logger.warn('OAuth cleanup cycle failed',{error:String(error)}));};
      oauthCleanup();
      oauthCleanupTimer = setInterval(oauthCleanup, 15 * 60_000);
      oauthCleanupTimer.unref();

      // Start Phase 10 persistent publishing worker
      if(runsPublishingWorker())startPublishingWorker();
      startAutopilotContinuationWorker();

      // Render job sweep: retries transient render failures, recovers stale leases
      // left by crashes/restarts, and drains jobs deferred by the inline concurrency cap.
      // Each tick claims at most a few jobs; renders themselves serialize behind the
      // per-process concurrency cap in clipRenderService.
      const RENDER_SWEEP_INTERVAL_MS = renderSweepInterval();
      const RENDER_SWEEP_MAX_JOBS_PER_TICK = 3;
      let renderSweepRunning = false;
      const runRenderSweep = async (trigger: string) => {
        if (workLifecycle.isDraining() || renderSweepRunning) return;
        renderSweepRunning = true;
        try {
          for (let i = 0; i < RENDER_SWEEP_MAX_JOBS_PER_TICK && !workLifecycle.isDraining(); i++) {
            const processed = await ClipRenderService.processDueRenderJobs();
            if (processed > 0) {
              logger.info(`[RenderSweep] Processed render job ${i + 1}/${RENDER_SWEEP_MAX_JOBS_PER_TICK} (${trigger})`);
            }
            if (processed === 0) break;
          }
        } catch (err) {
          logger.warn('[RenderSweep] Sweep iteration failed', {
            error: err instanceof Error ? err.message : String(err),
          });
        } finally {
          renderSweepRunning = false;
        }
      };
      // Immediate recovery pass for jobs stranded by a previous crash/restart.
      const drainRenderQueue=()=>workLifecycle.run('render-sweep',()=>runRenderSweep('queue-wakeup'));
      const wakeError=(error:unknown)=>logger.warn('Render queue notifications unavailable; periodic recovery remains active.',{error:String(error)});
      let requestRenderWake:()=>void;
      try{const wake=startRenderQueueWake(await getMongoDb(),drainRenderQueue,wakeError);stopRenderWake=wake.stop;requestRenderWake=wake.request;}
      catch(error){wakeError(error);requestRenderWake=()=>{void drainRenderQueue().catch(wakeError);};}
      const trackedRenderSweep=(_trigger:string)=>{if(!workLifecycle.isDraining())requestRenderWake();};
      trackedRenderSweep('startup-recovery');
      renderSweepTimer = setInterval(() => trackedRenderSweep('interval'), RENDER_SWEEP_INTERVAL_MS);
      renderSweepTimer.unref();

      stopDurableWorkerAnnouncements=startDurableWorkerAnnouncements(await getMongoDb(),error=>logger.warn('Durable worker announcement failed',{error:String(error)}));
      if(coreSelectionContinuationEnabled()){
        coreSelectionContinuationTimer=createTrackedPoller('core-selection-continuation',async()=>{await processNextAutomaticOneExport();await processNextCoreSelectionContinuation();},5000);
      }
      if(clipSelectionDispatchEnabled()){
        clipSelectionTimer=createTrackedPoller('clip-selection-queue',()=>processNextClipSelectionJob(),5000);
      }
      if(coreProcessingDispatchEnabled()){
        coreProcessingTimer=createTrackedPoller('core-processing-queue',()=>processNextCoreProcessingJob(),5000);
      }

      // Durable subtitle burns use a separate opt-in queue. One local drain at
      // a time; atomic claims handle other worker processes. No stale reclaim.
      let subtitleBurnRunning=false;
      const drainSubtitleBurn=()=>{
        if(subtitleBurnRunning||workLifecycle.isDraining())return;
        subtitleBurnRunning=true;
        void workLifecycle.run('subtitle-burn-queue',()=>SubtitleStudioService.processNextBurnJob())
          .catch(error=>logger.warn('Subtitle burn queue drain failed',{error:String(error)}))
          .finally(()=>{subtitleBurnRunning=false;});
      };
      if(subtitleBurnDispatchEnabled()){drainSubtitleBurn();
      subtitleBurnTimer=setInterval(drainSubtitleBurn,5000);subtitleBurnTimer.unref();}

      // Multimodal timeline sweep: same stuck-job class as renders (audit C-1).
      // claimNextJob atomically claims queued jobs and processing jobs whose
      // 5-minute lease expired, so multi-replica deployments stay safe.
      if(runsMultimodalWorker()){
      const MULTIMODAL_SWEEP_INTERVAL_MS = 45_000;
      const MULTIMODAL_SWEEP_MAX_PER_TICK = 2;
      let multimodalSweepRunning = false;
      const runMultimodalSweep = async () => {
        if (workLifecycle.isDraining() || multimodalSweepRunning) return;
        multimodalSweepRunning = true;
        try {
          for (let i = 0; i < MULTIMODAL_SWEEP_MAX_PER_TICK && !workLifecycle.isDraining(); i++) {
            const processed = await VideoAnalysisWorker.processNext();
            if (processed) {
              logger.info(`[MultimodalSweep] Processed analysis job ${i + 1}/${MULTIMODAL_SWEEP_MAX_PER_TICK}`);
            }
            if (!processed) break;
          }
        } catch (err) {
          logger.warn('[MultimodalSweep] Sweep iteration failed', {
            error: err instanceof Error ? err.message : String(err),
          });
        } finally {
          multimodalSweepRunning = false;
        }
      };
      const trackedMultimodalSweep=()=>{if(workLifecycle.isDraining())return;void workLifecycle.run('multimodal-sweep',runMultimodalSweep).catch(error=>logger.warn('Multimodal sweep failed',{error:String(error)}));};
      multimodalSweepTimer = setInterval(trackedMultimodalSweep, MULTIMODAL_SWEEP_INTERVAL_MS);
      multimodalSweepTimer.unref();
      }
    }
  };

  workLifecycle.run('database-initialization',initDatabase).catch((error) => {
    logger.error('Background database initialization error', { error: error instanceof Error ? error.message : String(error) });
  });

  // One shared deadline covers HTTP close, admitted background work and DB close.
  // Timeout never closes Mongo under active work or claims a graceful exit.
  const shutdown=createShutdown({lifecycle:workLifecycle,timeoutMs:10_000,
    stopPollers:()=>{
      stopDurableWorkerAnnouncements?.();
      stopPublishingWorker();
      stopAutopilotContinuationWorker();
      stopRenderWake?.();
      if (dbRecoveryTimer) { clearTimeout(dbRecoveryTimer); dbRecoveryTimer = null; }
      for(const timer of[cleanupTimer,oauthCleanupTimer,renderSweepTimer,multimodalSweepTimer,subtitleBurnTimer,coreProcessingTimer,clipSelectionTimer,coreSelectionContinuationTimer])if(timer)clearInterval(timer);
    },
    closeHttp:()=>new Promise<void>((resolve,reject)=>{if(!server){resolve();return;}server.close(error=>error?reject(error):resolve());server.closeIdleConnections();}),
    closeDatabase:()=>closeMongo(),
    onTimeout:active=>logger.error('Shutdown deadline expired; unfinished work is not marked successful.',{active}),
  });
  const handleShutdown=(signal:string)=>{
    logger.info(`Received ${signal}. Stopping admission and draining tracked work.`);
    void shutdown().then(drained=>process.exit(drained?0:1)).catch(error=>{logger.error('Shutdown failed',{error:String(error)});process.exit(1);});
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

export default app;
