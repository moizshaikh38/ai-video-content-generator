import {isDatabaseBootstrapReady} from './databaseBootstrapState.js';
import {workLifecycle} from './queue/workLifecycle.js';
import { HealthStatus } from '../types/index.js';
import { config } from '../config/index.js';
import { isServerSupabaseConfigured } from '../utils/supabase.js';
import { isMongoConfigured, isMongoHealthy } from '../db/mongoClient.js';

export interface DetailedHealthStatus extends HealthStatus {
  timestamp: string;
  version: string;
  uptimeSeconds: number;
  environment: string;
  services: {
    supabaseConfigured: boolean;
    mongoConfigured?: boolean;
    mongoConnected?: boolean;
    storageConfigured?: boolean;
    openRouterConfigured: boolean;
  };
}

export const getHealthStatus = (): DetailedHealthStatus => {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
    uptimeSeconds: Math.floor(process.uptime()),
    environment: config.nodeEnv,
    services: {
      supabaseConfigured: isServerSupabaseConfigured,
      mongoConfigured: isMongoConfigured,
      storageConfigured: Boolean(config.r2AccountId && config.r2AccessKeyId && config.r2SecretAccessKey),
      openRouterConfigured: Boolean(config.openrouterApiKey),
    },
  };
};

export async function getDetailedHealthStatus(): Promise<DetailedHealthStatus> {
  const health = getHealthStatus();
  const connected = await isMongoHealthy();
  return { ...health, status: connected ? 'ok' : 'error', services: { ...health.services, mongoConnected: connected } };
}

export interface ReadinessStatus {
  status: 'ready' | 'not_ready';
  draining?:boolean;
  timestamp: string;
  checks: {
    mongodb: boolean;
    databaseBootstrap: boolean;
    supabase: boolean;
    storage: boolean;
    aiProvider: boolean;
  };
  /** Configuration visibility only. Enabled does not prove Mongo transaction support,
   * worker rollout compatibility or a successful export. It does not gate /ready. */
  renderAdmission: {
    enabled: boolean;
  };
  /** Render-job queue depth (informational; never affects readiness). */
  renderQueue?: {
    queued: number;
    processing: number;
    activeRendersInProcess: number;
    concurrencyCap: number;
  } | null;
  /** Smart-reframe runtime capability (informational; false degrades renders to center crop). */
  reframeRuntime?: {
    available: boolean;
    pythonPath: string;
  } | null;
}

/**
 * Best-effort render queue snapshot for observability. Counts are advisory:
 * a deep queue must not flip readiness — it is drained by the background sweep.
 */
async function getRenderQueueStats(): Promise<ReadinessStatus['renderQueue']> {
  if (!isMongoConfigured) return null;
  try {
    const { getMongoDb } = await import('../db/mongoClient.js');
    const { renderOccupancy, maxConcurrentRenders } = await import('./clipRenderService.js');
    const db = await getMongoDb();
    const col = db.collection('render_jobs');
    const [queued, processing] = await Promise.all([
      col.countDocuments({ status: 'queued' },{maxTimeMS:500,timeoutMS:500}),
      col.countDocuments({ status: 'processing' },{maxTimeMS:500,timeoutMS:500}),
    ]);
    return {
      queued,
      processing,
      activeRendersInProcess: renderOccupancy(),
      concurrencyCap: maxConcurrentRenders(),
    };
  } catch {
    return null;
  }
}

export async function getReadinessStatus(): Promise<ReadinessStatus> {
  if(workLifecycle.isDraining())return{status:'not_ready',draining:true,timestamp:new Date().toISOString(),checks:{mongodb:false,databaseBootstrap:false,supabase:false,storage:false,aiProvider:false},renderAdmission:{enabled:process.env.VIREO_RENDER_ADMISSION_V1==='1'}};
  // Advisory queue/CV checks must not turn a cheap supervisor probe into a
  // 20-second Python import or an unbounded database wait. Late probes are read
  // only; the shared Mongo connection/runtime check may still settle afterward.
  const [mongoConnected,renderQueue,reframeRuntime]=await Promise.all([
    readinessProbe(isMongoHealthy,2_000,false),
    readinessProbe(getRenderQueueStats,500,null),
    readinessProbe(getReframeRuntimeStats,500,null),
  ]);
  const supabaseOk = isServerSupabaseConfigured;
  const storageOk = Boolean(config.r2AccountId && config.r2AccessKeyId && config.r2SecretAccessKey);
  const aiOk = Boolean(config.openrouterApiKey || config.groqApiKey);

  const bootstrapReady = isDatabaseBootstrapReady();
  const isReady = !workLifecycle.isDraining() && bootstrapReady && mongoConnected && supabaseOk && storageOk && aiOk;

  // Probes may await while shutdown begins. Never return a pre-await ready result.
  const draining = workLifecycle.isDraining();
  return {
    status: !draining && isReady ? 'ready' : 'not_ready',
    ...(draining ? { draining: true } : {}),
    timestamp: new Date().toISOString(),
    checks: {
      mongodb: mongoConnected,
      databaseBootstrap: bootstrapReady,
      supabase: supabaseOk,
      storage: storageOk,
      aiProvider: aiOk,
    },
    renderAdmission: { enabled: process.env.VIREO_RENDER_ADMISSION_V1 === '1' },
    renderQueue,
    reframeRuntime,
  };
}

/** A deadline bounds the HTTP wait, not cancellation of shared background reads. */
export async function readinessProbe<T>(probe:()=>Promise<T>,timeoutMs:number,fallback:T):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([
   Promise.resolve().then(probe).catch(()=>fallback),
   new Promise<T>(resolve=>{timer=setTimeout(()=>resolve(fallback),timeoutMs);}),
 ]);}finally{if(timer)clearTimeout(timer);}
}

async function getReframeRuntimeStats(): Promise<ReadinessStatus['reframeRuntime']> {
  try {
    const { SmartReframeService } = await import('./smartReframeService.js');
    const runtime = await SmartReframeService.checkReframeRuntime();
    return { available: runtime.available, pythonPath: runtime.pythonPath };
  } catch {
    return null;
  }
}
