import { db } from '../config/firebase';
import { Need } from '../types/need';
import { Volunteer } from '../types/volunteer';
import { Debrief } from '../types/debrief';
import { sendWhatsAppMessage } from '../functions/whatsapp-webhook';
import { extractionService } from './extraction';
import * as admin from 'firebase-admin';

// ---------------------------------------------------------------------------
// Negative-response detection
// ---------------------------------------------------------------------------

const NEGATIVE_PATTERNS = /^(nothing|no|none|nope|nah|n\/a|not really|didn'?t see anything)$/i;

function isNegativeResponse(message: string): boolean {
  return NEGATIVE_PATTERNS.test(message.trim());
}

// ---------------------------------------------------------------------------
// initiateDebrief
// ---------------------------------------------------------------------------

async function initiateDebrief(need: Need, volunteer: Volunteer): Promise<string> {
  const debriefRef = db.collection('debriefs').doc();
  const now = admin.firestore.Timestamp.now();

  const debrief: Debrief = {
    id: debriefRef.id,
    need_id: need.id,
    volunteer_id: volunteer.id,
    ngo_id: need.ngo_id,
    status: 'active',
    questions_asked: 0,
    new_need_ids: [],
    messages: [
      {
        role: 'system',
        content:
          'Great work completing the task! Did you notice any other community needs nearby while you were there?',
        timestamp: now as unknown as Debrief['messages'][0]['timestamp'],
      },
    ],
    created_at: now as unknown as Debrief['created_at'],
  };

  await debriefRef.set(debrief);

  // Send WhatsApp message to volunteer
  await sendWhatsAppMessage(
    `whatsapp:${volunteer.phone}`,
    'Great work completing the task! Did you notice any other community needs nearby while you were there?',
  );

  // Update volunteer conversation state to debrief_active
  await db.collection('conversations').doc(volunteer.phone).set(
    {
      phone: volunteer.phone,
      state: 'debrief_active',
      debrief_session_id: debriefRef.id,
      updated_at: now,
    },
    { merge: true },
  );

  return debriefRef.id;
}


// ---------------------------------------------------------------------------
// closeSession
// ---------------------------------------------------------------------------

async function closeSession(
  sessionId: string,
  status: 'completed' | 'no_new_needs',
): Promise<void> {
  const now = admin.firestore.Timestamp.now();

  await db.collection('debriefs').doc(sessionId).update({
    status,
    completed_at: now,
  });

  // Load session to get volunteer phone
  const snap = await db.collection('debriefs').doc(sessionId).get();
  if (!snap.exists) return;
  const session = snap.data() as Debrief;

  // Find volunteer phone from volunteers collection
  const volSnap = await db.collection('volunteers').doc(session.volunteer_id).get();
  if (volSnap.exists) {
    const volunteer = volSnap.data() as Volunteer;
    // Reset conversation state to idle
    await db.collection('conversations').doc(volunteer.phone).set(
      {
        phone: volunteer.phone,
        state: 'idle',
        debrief_session_id: admin.firestore.FieldValue.delete(),
        updated_at: now,
      },
      { merge: true },
    );
  }
}

// ---------------------------------------------------------------------------
// processResponse
// ---------------------------------------------------------------------------

async function processResponse(sessionId: string, message: string): Promise<void> {
  const sessionRef = db.collection('debriefs').doc(sessionId);
  const snap = await sessionRef.get();

  if (!snap.exists) return;
  const session = snap.data() as Debrief;

  // If session is not active or already hit question limit, close it
  if (session.status !== 'active' || session.questions_asked >= 3) {
    await closeSession(sessionId, 'completed');
    return;
  }

  const now = admin.firestore.Timestamp.now();

  // Record volunteer message
  const volunteerMessage = {
    role: 'volunteer' as const,
    content: message,
    timestamp: now as unknown as Debrief['messages'][0]['timestamp'],
  };

  // Check for negative response
  if (isNegativeResponse(message)) {
    await sessionRef.update({
      messages: admin.firestore.FieldValue.arrayUnion(volunteerMessage),
    });

    // Send acknowledgement
    const volSnap = await db.collection('volunteers').doc(session.volunteer_id).get();
    if (volSnap.exists) {
      const volunteer = volSnap.data() as Volunteer;
      await sendWhatsAppMessage(
        `whatsapp:${volunteer.phone}`,
        'Thank you for the update! Your debrief is complete.',
      );
    }

    await closeSession(sessionId, 'no_new_needs');
    return;
  }

  // Extract structured Need fields from the response
  const extraction = await extractionService.extractFromText(message);

  // Create new Need document with source: 'debrief'
  const needRef = db.collection('needs').doc();
  const newNeed: Partial<Need> = {
    id: needRef.id,
    source: 'debrief',
    need_type: extraction.need_type,
    location: extraction.location,
    severity: extraction.severity ?? 3,
    affected_count: extraction.affected_count ?? 1,
    vulnerability_flags: extraction.vulnerability_flags || [],
    urgency_score: 0, // Will be computed by urgency engine trigger
    status: 'new',
    ngo_id: session.ngo_id,
    raw_input: message,
    language: extraction.language || 'en',
    debrief_source_need_id: session.need_id,
    created_at: now as unknown as Need['created_at'],
    updated_at: now as unknown as Need['updated_at'],
    audit_trail_id: needRef.id,
  };

  await needRef.set(newNeed);

  const newQuestionsAsked = session.questions_asked + 1;

  // Update session
  const systemMessage = {
    role: 'system' as const,
    content:
      newQuestionsAsked < 3
        ? 'Anything else you noticed?'
        : 'Thank you for the detailed debrief!',
    timestamp: now as unknown as Debrief['messages'][0]['timestamp'],
  };

  await sessionRef.update({
    questions_asked: newQuestionsAsked,
    new_need_ids: admin.firestore.FieldValue.arrayUnion(needRef.id),
    messages: admin.firestore.FieldValue.arrayUnion(volunteerMessage, systemMessage),
  });

  // Send follow-up or closing message
  const volSnap = await db.collection('volunteers').doc(session.volunteer_id).get();
  if (volSnap.exists) {
    const volunteer = volSnap.data() as Volunteer;
    if (newQuestionsAsked < 3) {
      await sendWhatsAppMessage(`whatsapp:${volunteer.phone}`, 'Anything else you noticed?');
    } else {
      await sendWhatsAppMessage(
        `whatsapp:${volunteer.phone}`,
        'Thank you for the detailed debrief!',
      );
      await closeSession(sessionId, 'completed');
    }
  }
}

// ---------------------------------------------------------------------------
// Exported service object
// ---------------------------------------------------------------------------

export const debriefService = {
  initiateDebrief,
  processResponse,
  closeSession,
};
