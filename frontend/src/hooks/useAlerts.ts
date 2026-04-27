import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCollection } from './useCollection';
import type { SystemAlert } from '../types';

export function useAlerts() {
  const { ngoId } = useAuth();
  const { data, loading, error } = useCollection<SystemAlert>(
    'system_alerts',
    ngoId,
    'created_at',
    'desc'
  );

  const unacknowledged = useMemo(
    () => data.filter((a) => !a.acknowledged),
    [data]
  );

  return { data: unacknowledged, loading, error };
}
