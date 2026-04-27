import { useAuth } from '../contexts/AuthContext';
import { useCollection } from './useCollection';
import type { InventoryItem } from '../types';

export function useInventory() {
  const { ngoId } = useAuth();
  return useCollection<InventoryItem>('inventory', ngoId);
}
