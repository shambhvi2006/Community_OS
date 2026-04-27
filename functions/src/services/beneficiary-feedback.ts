import { db } from '../config/firebase';
import { Need } from '../types/need';
import { Dispatch } from '../types/dispatch';
import { auditTrailService } from './audit-trail';
import { reliabilityScoreService } from './reliability-score';
import { sendWhatsAppMessage } from '../functions/whatsapp-webhook';
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';

// ---------------------------------------------------------------------------
// requestFeedback
// ---------------------------------------------------------------------------

export async function requestFeedback(need: Need, dispatch: Dispatch): Promise<void> {
  if (!need.reporter_phone) {
    logger.info('No reporter phone — skipping beneficiary feedback', { needId: need.id });
    return;
  }

  const message =
    `Did volunteer help arrive for your reported need (${need.need_type})? Reply YES or NO.`;

  await sendWhatsAppMessage(`whatsapp:${need.reporter_phone}`, message);

  // Schedule 24-hour timeout to mark as unverified if no response
  const FEEDBACK_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours
  setTimeout(async () => {
    try {
      const snap = await db.collection('dispatches').doc(dispatch.id).get();
      if (!snap.exists) return;
      const current = snap.data() as Dispatch;
      // Only mark unverified if no feedback has been recorded yet
      if (!current.beneficiary_feedback) {
        await markUnverified(need.id);
      }
    } catch (err) {
      logger.error('Beneficiary feedback timeout error', { needId: need.id, error: err });
    }
  }, FEEDBACK_TIMEOUT_MS);

  await auditTrailService.append(need.id, {
    actor_id: 'system',
    actor_role: 'system',
    action_type: 'beneficiary_feedback_requested',
    previous_value: null,
    new_value: { reporter_phone: need.reporter_phone },
    source: 'system',
  });
}

// ---------------------------------------------------------------------------
// handleFeedback
// ---------------------------------------------------------------------------

export async function handleFeedback(
  phone: string,
  response: string,
  needId: string,
): Promise<void> {
  const normalised = response.trim().toUpperCase();
  const isPositive = normalised === 'YES';

  // Find the completed dispatch for this need
  const dispatchSnap = await db
    .collection('dispatches')
    .where('need_id', '==', needId)
    .where('status', '==', 'completed')
    .limit(1)
    .get();

  if (dispatchSnap.empty) {
    logger.warn('No completed dispatch found for beneficiary feedback', { needId, phone });
    return;
  }

  const dispatchDoc = dispatchSnap.docs[0];
  const dispatch = { ...dispatchDoc.data(), id: dispatchDoc.id } as Dispatch;
  const now = admin.firestore.Timestamp.now();

  if (isPositive) {
    // Update dispatch with positive feedback
    await db.collection('dispatches').doc(dispatch.id).update({
      beneficiary_feedback: 'yes',
    });

    await auditTrailService.append(needId, {
      actor_id: phone,
      actor_role: 'system',
      action_type: 'beneficiary_feedback_positive',
      previous_value: { beneficiary_feedback: null },
      new_value: { beneficiary_feedback: 'yes' },
      source: 'whatsapp',
    });

    // Increase volunteer reliability score (5.0 = max positive rating)
    await reliabilityScoreService.updateOnFeedback(dispatch.volunteer_id, 5.0);
  } else {
    // Update dispatch with negative feedback
    await db.collection('dispatches').doc(dispatch.id).update({
      beneficiary_feedback: 'no',
    });

    // Flag need for coordinator review via system alert
    const alertRef = db.collection('system_alerts').doc();
    await alertRef.set({
      id: alertRef.id,
      ngo_id: dispatch.ngo_id,
      type: 'dispatch_delay',
      severity: 'warning',
      message: `Beneficiary reported help was not received for need ${needId}`,
      metadata: {
        need_id: needId,
        dispatch_id: dispatch.id,
        volunteer_id: dispatch.volunteer_id,
        reporter_phone: phone,
      },
      acknowledged: false,
      created_at: now,
    });

    await auditTrailService.append(needId, {
      actor_id: phone,
      actor_role: 'system',
      action_type: 'beneficiary_feedback_negative',
      previous_value: { beneficiary_feedback: null },
      new_value: { beneficiary_feedback: 'no' },
      source: 'whatsapp',
    });

    // Decrease volunteer reliability score (1.0 = low rating)
    await reliabilityScoreService.updateOnFeedback(dispatch.volunteer_id, 1.0);
  }
}

// ---------------------------------------------------------------------------
// markUnverified
// ---------------------------------------------------------------------------

export async function markUnverified(needId: string): Promise<void> {
  // Find the completed dispatch for this need
  const dispatchSnap = await db
    .collection('dispatches')
    .where('need_id', '==', needId)
    .where('status', '==', 'completed')
    .limit(1)
    .get();

  if (dispatchSnap.empty) {
    logger.warn('No completed dispatch found for markUnverified', { needId });
    return;
  }

  const dispatchDoc = dispatchSnap.docs[0];

  await db.collection('dispatches').doc(dispatchDoc.id).update({
    beneficiary_feedback: 'no_response',
  });

  await auditTrailService.append(needId, {
    actor_id: 'system',
    actor_role: 'system',
    action_type: 'beneficiary_feedback_timeout',
    previous_value: { beneficiary_feedback: null },
    new_value: { beneficiary_feedback: 'no_response' },
    source: 'system',
  });
}

// ---------------------------------------------------------------------------
// Exported service object
// ---------------------------------------------------------------------------

export const beneficiaryFeedbackService = {
  requestFeedback,
  handleFeedback,
  markUnverified,
};
