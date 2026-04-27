import { Timestamp } from './common';

export interface ConsentToken {
  id: string;
  phone: string;
  ngo_id: string;
  granted_at: Timestamp;
  revoked_at?: Timestamp;
  status: 'active' | 'revoked';
}

export interface Consent {
  id: string;
  phone: string;
  ngo_id: string;
  status: 'active' | 'revoked';
  granted_at: Timestamp;
  revoked_at?: Timestamp;
}
