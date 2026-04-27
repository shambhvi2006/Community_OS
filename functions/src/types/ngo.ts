import { Timestamp } from './common';

export interface NGO {
  id: string;
  name: string;
  region: string;
  settings: {
    overflow_enabled: boolean;
    overflow_partners: string[]; // ngo_ids with bilateral consent
    inventory_thresholds: Record<string, number>; // resource_type → min quantity
  };
  created_at: Timestamp;
  updated_at: Timestamp;
}
