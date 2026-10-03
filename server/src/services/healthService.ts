import { HealthStatus } from '../types/index.js';
import { config } from '../config/index.js';
import { isServerSupabaseConfigured } from '../utils/supabase.js';

export interface DetailedHealthStatus extends HealthStatus {
  timestamp: string;
  version: string;
  uptimeSeconds: number;
  environment: string;
  services: {
    supabaseConfigured: boolean;
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
      openRouterConfigured: Boolean(config.openrouterApiKey),
    },
  };
};
