import { Timestamp } from './common';

export interface QueuedMessage {
  id: string;
  type: 'pending_extraction' | 'pending_send';
  payload: any;
  ngo_id: string;
  retry_count: number;
  max_retries: number;
  next_retry_at: Timestamp;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  created_at: Timestamp;
}
