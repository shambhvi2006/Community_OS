/**
 * Overflow Service — cross-NGO need sharing.
 * Stub implementations that write to Firestore.
 */
import { db } from '../config/firebase';
import * as admin from 'firebase-admin';

export interface OverflowSharedFields {
  need_type: string;
  general_area: string;
  severity: number;
  required_skills: string[];
}

export const overflowService = {
  /**
   * Create an overflow request sharing minimal need data with partner NGOs.
   */
  async requestOverflow(needId: string, sourceNgoId: string): Promise<string> {
    // Fetch the need to extract shared fields
    const needSnap = await db.doc(`needs/${needId}`).get();
    if (!needSnap.exists) {
      throw new Error(`Need ${needId} not found`);
    }
    const needData = needSnap.data()!;

    const shared: OverflowSharedFields = {
      need_type: needData.need_type ?? '',
      general_area: needData.location?.description ?? 'Unknown area',
      severity: needData.severity ?? 0,
      required_skills: needData.required_skills ?? [],
    };

    const ref = db.collection('overflow_requests').doc();
    await ref.set({
      id: ref.id,
      need_id: needId,
      source_ngo_id: sourceNgoId,
      shared_fields: shared,
      status: 'pending',
      created_at: admin.firestore.Timestamp.now(),
    });

    return ref.id;
  },

  /**
   * Accept an overflow request — copies the need to the accepting NGO's partition.
   */
  async acceptOverflow(needId: string, acceptingNgoId: string): Promise<void> {
    const needSnap = await db.doc(`needs/${needId}`).get();
    if (!needSnap.exists) {
      throw new Error(`Need ${needId} not found`);
    }

    const needData = needSnap.data()!;
    const newRef = db.collection('needs').doc();
    await newRef.set({
      ...needData,
      id: newRef.id,
      ngo_id: acceptingNgoId,
      overflow_source_need_id: needId,
      status: 'new',
      created_at: admin.firestore.Timestamp.now(),
      updated_at: admin.firestore.Timestamp.now(),
    });

    // Update overflow request status
    const overflowSnap = await db
      .collection('overflow_requests')
      .where('need_id', '==', needId)
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    if (!overflowSnap.empty) {
      await overflowSnap.docs[0].ref.update({
        status: 'accepted',
        accepting_ngo_id: acceptingNgoId,
        accepted_at: admin.firestore.Timestamp.now(),
      });
    }
  },

  /**
   * Resolve an overflow request — notifies originating NGO.
   */
  async resolveOverflow(needId: string): Promise<void> {
    const overflowSnap = await db
      .collection('overflow_requests')
      .where('need_id', '==', needId)
      .limit(1)
      .get();

    if (!overflowSnap.empty) {
      const overflowDoc = overflowSnap.docs[0];
      await overflowDoc.ref.update({
        status: 'resolved',
        resolved_at: admin.firestore.Timestamp.now(),
      });

      // Create a system alert for the originating NGO
      const data = overflowDoc.data();
      await db.collection('system_alerts').doc().set({
        ngo_id: data.source_ngo_id,
        type: 'early_warning',
        severity: 'info',
        message: `Overflow need ${needId} has been resolved by partner NGO`,
        metadata: { need_id: needId },
        acknowledged: false,
        created_at: admin.firestore.Timestamp.now(),
      });
    }
  },
};
