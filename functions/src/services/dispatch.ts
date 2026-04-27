import { db } from '../config/firebase';
import { Dispatch, VolunteerCommand } from '../types/dispatch';
import { Need } from '../types/need';
import { Volunteer } from '../types/volunteer';
import { auditTrailService } from './audit-trail';
import { reliabilityScoreService } from './reliability-score';
import { sendWhatsAppMessage } from '../functions/whatsapp-webhook';
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function urgencyLabel(score: number): string {
  if (score > 8) return 'CRITICAL';
  if (score > 4) return 'HIGH';
  return 'NORMAL';
}

function estimatedTime(need: Need): string {
  if (need.severity >= 8) return '30 minutes';
  if (need.severity >= 5) return '1 hour';
  return '2 hours';
}

// ---------------------------------------------------------------------------
// sendDispatch
// ---------------------------------------------------------------------------

export async function sendDispatch(
  dispatch: Dispatch,
  need: Need,
  volunteer: Volunteer,
): Promise<void> {
  const message = [
    `🚨 New Task Assignment`,
    `Type: ${need.need_type}`,
    `Location: ${need.location.description}`,
    `Urgency: ${urgencyLabel(need.urgency_score)}`,
    `Estimated time: ${estimatedTime(need)}`,
    '',
    'Reply YES to accept or NO to decline.',
  ].join('\n');

  await sendWhatsAppMessage(`whatsapp:${volunteer.phone}`, message);

  // Update dispatch status to 'sent'
  const now = admin.firestore.Timestamp.now();
  await db.collection('dispatches').doc(dispatch.id).update({
    status: 'sent',
    sent_at: now,
  });

  // Schedule escalation timeout (setTimeout simulation — real Cloud Tasks is a future enhancement)
  const ESCALATION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
  setTimeout(async () => {
    try {
      const snap = await db.collection('dispatches').doc(dispatch.id).get();
      if (!snap.exists) return;
      const current = snap.data() as Dispatch;
      // Only escalate if still in 'sent' status (no response received)
      if (current.status === 'sent') {
        await escalate({ ...current, id: dispatch.id });
      }
    } catch (err) {
      logger.error('Escalation timeout error', { dispatchId: dispatch.id, error: err });
    }
  }, ESCALATION_TIMEOUT_MS);

  // Audit trail
  await auditTrailService.append(need.id, {
    actor_id: 'system',
    actor_role: 'system',
    action_type: 'dispatch_sent',
    previous_value: { status: dispatch.status },
    new_value: { status: 'sent', volunteer_id: volunteer.id },
    source: 'system',
  });
}


// ---------------------------------------------------------------------------
// handleResponse
// ---------------------------------------------------------------------------

export async function handleResponse(
  phone: string,
  command: VolunteerCommand,
  dispatch: Dispatch,
): Promise<void> {
  const now = admin.firestore.Timestamp.now();
  const dispatchRef = db.collection('dispatches').doc(dispatch.id);
  const needRef = db.collection('needs').doc(dispatch.need_id);

  switch (command) {
    case 'YES': {
      // Update Need status to 'assigned'
      await needRef.update({
        status: 'assigned',
        assigned_volunteer_id: dispatch.volunteer_id,
        updated_at: now,
      });

      // Update dispatch status to 'accepted'
      await dispatchRef.update({
        status: 'accepted',
        responded_at: now,
      });

      // Send confirmation to volunteer
      await sendWhatsAppMessage(
        `whatsapp:${phone}`,
        'You have accepted the task. Thank you! Reply DONE when completed or HELP if you need assistance.',
      );

      // Notify coordinator (logged for dashboard visibility)
      logger.info('Dispatch accepted — coordinator notified', {
        dispatchId: dispatch.id,
        needId: dispatch.need_id,
        ngoId: dispatch.ngo_id,
      });

      // Audit trail
      await auditTrailService.append(dispatch.need_id, {
        actor_id: dispatch.volunteer_id,
        actor_role: 'volunteer',
        action_type: 'dispatch_accepted',
        previous_value: { status: 'sent' },
        new_value: { status: 'accepted', assigned_volunteer_id: dispatch.volunteer_id },
        source: 'whatsapp',
      });
      break;
    }

    case 'NO': {
      // Update dispatch status to 'declined'
      await dispatchRef.update({
        status: 'declined',
        responded_at: now,
      });

      // Update reliability score
      await reliabilityScoreService.updateOnDecline(dispatch.volunteer_id);

      // Try to auto-dispatch to next volunteer
      await autoDispatchNext(dispatch);

      // Audit trail
      await auditTrailService.append(dispatch.need_id, {
        actor_id: dispatch.volunteer_id,
        actor_role: 'volunteer',
        action_type: 'dispatch_declined',
        previous_value: { status: 'sent' },
        new_value: { status: 'declined' },
        source: 'whatsapp',
      });
      break;
    }

    case 'DONE': {
      // Update Need status to 'completed'
      await needRef.update({
        status: 'completed',
        updated_at: now,
      });

      // Update dispatch status to 'completed'
      await dispatchRef.update({
        status: 'completed',
        responded_at: now,
        completed_at: now,
      });

      // Compute response time and update reliability score
      if (dispatch.sent_at) {
        const sentSeconds = dispatch.sent_at.seconds;
        const nowSeconds = Math.floor(Date.now() / 1000);
        const responseTimeMinutes = (nowSeconds - sentSeconds) / 60;
        await reliabilityScoreService.updateOnCompletion(
          dispatch.volunteer_id,
          responseTimeMinutes,
        );
      }

      // Audit trail
      await auditTrailService.append(dispatch.need_id, {
        actor_id: dispatch.volunteer_id,
        actor_role: 'volunteer',
        action_type: 'need_completed',
        previous_value: { status: 'assigned' },
        new_value: { status: 'completed' },
        source: 'whatsapp',
      });
      break;
    }

    case 'HELP': {
      // Send alert to coordinator via WhatsApp
      const needSnap = await needRef.get();
      const need = needSnap.data() as Need;

      // Create system alert in Firestore
      const alertRef = db.collection('system_alerts').doc();
      await alertRef.set({
        id: alertRef.id,
        ngo_id: dispatch.ngo_id,
        type: 'dispatch_delay',
        severity: 'critical',
        message: `Volunteer ${dispatch.volunteer_id} requested HELP for need ${dispatch.need_id} (${need?.need_type ?? 'unknown'})`,
        metadata: {
          dispatch_id: dispatch.id,
          need_id: dispatch.need_id,
          volunteer_id: dispatch.volunteer_id,
          volunteer_phone: phone,
        },
        acknowledged: false,
        created_at: now,
      });

      await sendWhatsAppMessage(
        `whatsapp:${phone}`,
        'Your help request has been sent to the coordinator. They will contact you shortly.',
      );

      // Audit trail
      await auditTrailService.append(dispatch.need_id, {
        actor_id: dispatch.volunteer_id,
        actor_role: 'volunteer',
        action_type: 'help_requested',
        previous_value: null,
        new_value: { alert_id: alertRef.id },
        source: 'whatsapp',
      });
      break;
    }

    case 'AVAILABLE':
    case 'BUSY': {
      const newStatus = command === 'AVAILABLE' ? 'available' : 'busy';
      await db.collection('volunteers').doc(dispatch.volunteer_id).update({
        status: newStatus,
        updated_at: now,
      });

      await sendWhatsAppMessage(
        `whatsapp:${phone}`,
        `Your status has been updated to ${newStatus.toUpperCase()}.`,
      );
      break;
    }
  }
}


// ---------------------------------------------------------------------------
// escalate
// ---------------------------------------------------------------------------

export async function escalate(dispatch: Dispatch): Promise<void> {
  const now = admin.firestore.Timestamp.now();
  const dispatchRef = db.collection('dispatches').doc(dispatch.id);

  // Update dispatch status to 'escalated'
  await dispatchRef.update({
    status: 'escalated',
    escalation_count: (dispatch.escalation_count || 0) + 1,
  });

  // Notify coordinator via system alert
  const alertRef = db.collection('system_alerts').doc();
  await alertRef.set({
    id: alertRef.id,
    ngo_id: dispatch.ngo_id,
    type: 'dispatch_delay',
    severity: 'warning',
    message: `Dispatch ${dispatch.id} escalated — volunteer ${dispatch.volunteer_id} did not respond within 15 minutes`,
    metadata: {
      dispatch_id: dispatch.id,
      need_id: dispatch.need_id,
      volunteer_id: dispatch.volunteer_id,
      escalation_count: (dispatch.escalation_count || 0) + 1,
    },
    acknowledged: false,
    created_at: now,
  });

  // Audit trail
  await auditTrailService.append(dispatch.need_id, {
    actor_id: 'system',
    actor_role: 'system',
    action_type: 'dispatch_escalated',
    previous_value: { status: dispatch.status, escalation_count: dispatch.escalation_count },
    new_value: { status: 'escalated', escalation_count: (dispatch.escalation_count || 0) + 1 },
    source: 'system',
  });
}

// ---------------------------------------------------------------------------
// Auto-dispatch to next volunteer
// ---------------------------------------------------------------------------

async function autoDispatchNext(declinedDispatch: Dispatch): Promise<void> {
  try {
    // Find other pending/sent dispatches for the same need that haven't been declined
    const snapshot = await db
      .collection('dispatches')
      .where('need_id', '==', declinedDispatch.need_id)
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    if (snapshot.empty) {
      logger.info('No more pending dispatches for auto-dispatch', {
        needId: declinedDispatch.need_id,
      });
      return;
    }

    const nextDispatchDoc = snapshot.docs[0];
    const nextDispatch = { ...nextDispatchDoc.data(), id: nextDispatchDoc.id } as Dispatch;

    // Load the need and volunteer
    const needSnap = await db.collection('needs').doc(nextDispatch.need_id).get();
    const volunteerSnap = await db.collection('volunteers').doc(nextDispatch.volunteer_id).get();

    if (!needSnap.exists || !volunteerSnap.exists) {
      logger.warn('Need or volunteer not found for auto-dispatch', {
        needId: nextDispatch.need_id,
        volunteerId: nextDispatch.volunteer_id,
      });
      return;
    }

    const need = needSnap.data() as Need;
    const volunteer = volunteerSnap.data() as Volunteer;

    await sendDispatch(nextDispatch, need, volunteer);
  } catch (err) {
    logger.error('Auto-dispatch failed', {
      needId: declinedDispatch.need_id,
      error: err,
    });
  }
}

// ---------------------------------------------------------------------------
// Exported service object
// ---------------------------------------------------------------------------

export const dispatchService = {
  sendDispatch,
  handleResponse,
  escalate,
};
