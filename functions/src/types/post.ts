import { Timestamp } from './common';

export interface BlogDraft {
  id: string;
  title: string;
  content: string; // Markdown
  source_need_ids: string[];
  ngo_id: string;
  status: 'draft' | 'approved' | 'published';
}

export interface Post {
  id: string;
  ngo_id: string;
  title: string;
  content: string; // Markdown
  source_need_ids: string[];
  status: 'draft' | 'approved' | 'published';
  published_url?: string;
  created_at: Timestamp;
  published_at?: Timestamp;
}
