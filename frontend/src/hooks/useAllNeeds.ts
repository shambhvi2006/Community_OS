import { useAuth } from '../contexts/AuthContext';
import { useCollection } from './useCollection';
import type { Need } from '../types';

export function useAllNeeds() {
  const { ngoId } = useAuth();
  return useCollection<Need>('needs', ngoId, 'created_at', 'desc');
}
