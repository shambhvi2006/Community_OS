/**
 * Blog Generation Service — stub implementations.
 * Real Gemini narrative generation is a future enhancement.
 */
import { db } from '../config/firebase';
import * as admin from 'firebase-admin';

export interface BlogDraft {
  id: string;
  title: string;
  content: string;
  source_need_ids: string[];
  ngo_id: string;
  status: 'draft' | 'approved' | 'published';
}

// Regex patterns for PII stripping
const PHONE_PATTERN = /(\+?\d{1,4}[-.\s]?)?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g;
const ADDRESS_PATTERN = /\d{1,5}\s[\w\s]{1,50}(?:street|st|avenue|ave|road|rd|lane|ln|drive|dr|blvd|boulevard)\b/gi;

export const blogGenerationService = {
  /**
   * Generate a narrative blog post from resolved needs using Gemini.
   * Stub: returns a placeholder draft.
   */
  async generateStory(needIds: string[], ngoId: string): Promise<BlogDraft> {
    // In production, this would call Gemini 1.5 Flash to generate a narrative
    const ref = db.collection('posts').doc();
    const draft: BlogDraft = {
      id: ref.id,
      title: `Impact Story — ${new Date().toLocaleDateString()}`,
      content: `This is a placeholder story generated from ${needIds.length} resolved needs. Gemini integration will produce a compelling narrative about community impact.`,
      source_need_ids: needIds,
      ngo_id: ngoId,
      status: 'draft',
    };

    await ref.set({
      ...draft,
      created_at: admin.firestore.Timestamp.now(),
    });

    return draft;
  },

  /**
   * Strip PII patterns (phone numbers, addresses) from content.
   */
  anonymizeContent(content: string): string {
    let result = content;
    result = result.replace(PHONE_PATTERN, '[phone redacted]');
    result = result.replace(ADDRESS_PATTERN, '[address redacted]');
    return result;
  },

  /**
   * Update a post's status to published.
   */
  async publishStory(storyId: string): Promise<void> {
    await db.doc(`posts/${storyId}`).update({
      status: 'published',
      published_at: admin.firestore.Timestamp.now(),
    });
  },
};
