import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCollection } from './useCollection';
import type { Need } from '../types';

const OPEN_STATUSES: Need['status'][] = [
  'new',
  'triaged',
  'assigned',
  'in_progress',
];

export function useNeeds() {
  const { ngoId } = useAuth();
  const { data, loading, error } = useCollection<Need>(
    'needs',
    ngoId,
    'urgency_score',
    'desc'
  );

  const openNeeds = useMemo(
    () => data.filter((n) => OPEN_STATUSES.includes(n.status)),
    [data]
  );

  return { data: openNeeds, loading, error };
}
