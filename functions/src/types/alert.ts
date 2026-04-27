import { Timestamp } from './common';

export interface SystemAlert {
  id: string;
  ngo_id: string;
  type: 'early_warning' | 'inventory_low' | 'dispatch_delay' | 'service_degraded';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  metadata: Record<string, any>;
  acknowledged: boolean;
  created_at: Timestamp;
}
