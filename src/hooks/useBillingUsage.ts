import { useState, useEffect, useCallback } from 'react';
import { BillingService, BillingUsage } from '../services/billingService';
import { useAuth } from '../context/AuthContext';

export function useBillingUsage() {
  const { user } = useAuth();
  const [usage, setUsage] = useState<BillingUsage | null>(() => BillingService.getCachedUsage());
  const [isLoading, setIsLoading] = useState(() => !BillingService.getCachedUsage());
  const [error, setError] = useState<string | null>(null);

  const fetchUsage = useCallback(async () => {
    if (!user) {
      setUsage(null);
      return;
    }
    if (!BillingService.getCachedUsage()) {
      setIsLoading(true);
    }
    setError(null);
    try {
      const data = await BillingService.getUsage();
      setUsage(data);
    } catch (err: any) {
      if (!BillingService.getCachedUsage()) {
        setError(err.message || 'Failed to load usage data.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchUsage();

    const handleUpdate = () => fetchUsage();
    window.addEventListener('vireo_project_updated', handleUpdate);
    window.addEventListener('vireo_usage_updated', handleUpdate);

    return () => {
      window.removeEventListener('vireo_project_updated', handleUpdate);
      window.removeEventListener('vireo_usage_updated', handleUpdate);
    };
  }, [fetchUsage]);

  return {
    usage,
    isLoading,
    error,
    refreshUsage: fetchUsage,
  };
}
