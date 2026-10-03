import { HealthStatus } from '../types/index.js';

export const getHealthStatus = (): HealthStatus => {
  return {
    status: 'ok',
  };
};
