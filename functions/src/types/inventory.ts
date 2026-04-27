import { Timestamp, GeoLocation } from './common';

export interface InventoryItem {
  id: string;
  resource_type: string;
  quantity: number;
  location: GeoLocation;
  ngo_id: string;
  expiry_date?: Timestamp;
  status: 'available' | 'depleted' | 'expired';
  created_at: Timestamp;
  updated_at: Timestamp;
}
