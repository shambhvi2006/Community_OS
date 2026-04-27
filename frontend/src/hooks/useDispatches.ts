import { useAuth } from '../contexts/AuthContext';
import { useCollection } from './useCollection';
import type { Dispatch } from '../types';

export function useDispatches() {
  const { ngoId } = useAuth();
  return useCollection<Dispatch>('dispatches', ngoId, 'created_at', 'desc');
}
