import { Timestamp } from './common';
import { Need } from './need';

export interface WhatsAppInboundMessage {
  From: string;
  Body: string;
  NumMedia: string;
  MediaUrl0?: string;
  MediaContentType0?: string;
}

export interface ConversationContext {
  phone: string;
  ngo_id: string;
  state: 'idle' | 'awaiting_consent' | 'collecting_need' | 'awaiting_confirmation' |
         'editing_fields' | 'dispatched' | 'debrief_active';
  pending_need?: Partial<Need>;
  extraction_confidence?: Record<string, number>;
  debrief_question_count?: number;
  language: 'en' | 'hi' | 'pa';
}

export interface Conversation {
  phone: string;
  ngo_id: string;
  state: 'idle' | 'awaiting_consent' | 'collecting_need' | 'awaiting_confirmation' |
         'editing_fields' | 'dispatched' | 'debrief_active';
  pending_need?: Partial<Need>;
  extraction_confidence?: Record<string, number>;
  debrief_session_id?: string;
  language: 'en' | 'hi' | 'pa';
  updated_at: Timestamp;
}
