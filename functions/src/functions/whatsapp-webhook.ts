import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as twilio from 'twilio';
import { db } from '../config/firebase';
import { consentService } from '../services/consent';
import { extractionService } from '../services/extraction';
import { Conversation } from '../types/conversation';
import { Need } from '../types/need';
import * as admin from 'firebase-admin';

// ---------------------------------------------------------------------------
// Configuration helpers
// ---------------------------------------------------------------------------

function getTwilioAuthToken(): string {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) throw new Error('TWILIO_AUTH_TOKEN environment variable is not set');
  return token;
}

function getTwilioAccountSid(): string {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  if (!sid) throw new Error('TWILIO_ACCOUNT_SID environment variable is not set');
  return sid;
}

function getTwilioPhoneNumber(): string {
  const num = process.env.TWILIO_PHONE_NUMBER;
  if (!num) throw new Error('TWILIO_PHONE_NUMBER environment variable is not set');
  return num;
}

function getWebhookUrl(): string {
  const url = process.env.TWILIO_WEBHOOK_URL;
  if (!url) throw new Error('TWILIO_WEBHOOK_URL environment variable is not set');
  return url;
}

// Default NGO ID for WhatsApp-originated messages (configurable)
function getDefaultNgoId(): string {
  return process.env.DEFAULT_NGO_ID || 'default_ngo';
}

// ---------------------------------------------------------------------------
// Twilio REST helper
// ---------------------------------------------------------------------------

export async function sendWhatsAppMessage(to: string, body: string): Promise<void> {
  const client = twilio.default(getTwilioAccountSid(), getTwilioAuthToken());
  await client.messages.create({
    from: `whatsapp:${getTwilioPhoneNumber()}`,
    to,
    body,
  });
}

// ---------------------------------------------------------------------------
// Conversation state helpers
// ---------------------------------------------------------------------------

async function getConversation(phone: string): Promise<Conversation | null> {
  const doc = await db.collection('conversations').doc(phone).get();
  return doc.exists ? (doc.data() as Conversation) : null;
}

async function setConversation(phone: string, data: Partial<Conversation>): Promise<void> {
  await db.collection('conversations').doc(phone).set(
    { ...data, phone, updated_at: admin.firestore.Timestamp.now() },
    { merge: true },
  );
}

// ---------------------------------------------------------------------------
// Idempotency helper
// ---------------------------------------------------------------------------

async function isMessageProcessed(messageSid: string): Promise<boolean> {
  const doc = await db.collection('processed_messages').doc(messageSid).get();
  return doc.exists;
}

async function markMessageProcessed(messageSid: string): Promise<void> {
  await db.collection('processed_messages').doc(messageSid).set({
    processed_at: admin.firestore.Timestamp.now(),
  });
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatNeedSummary(pending: Partial<Need>): string {
  const lines: string[] = ['Here is a summary of the reported need:'];
  if (pending.need_type) lines.push(`1. Type: ${pending.need_type}`);
  if (pending.location) lines.push(`2. Location: ${pending.location.description ?? `${pending.location.lat}, ${pending.location.lng}`}`);
  if (pending.severity != null) lines.push(`3. Severity: ${pending.severity}/10`);
  if (pending.affected_count != null) lines.push(`4. Affected: ${pending.affected_count} people`);
  if (pending.vulnerability_flags?.length) lines.push(`5. Vulnerabilities: ${pending.vulnerability_flags.join(', ')}`);
  lines.push('');
  lines.push('Reply YES to confirm or EDIT to modify.');
  return lines.join('\n');
}

function formatFieldList(pending: Partial<Need>): string {
  const lines: string[] = ['Which field would you like to edit? Reply with the number:'];
  if (pending.need_type) lines.push(`1. Type: ${pending.need_type}`);
  if (pending.location) lines.push(`2. Location: ${pending.location.description ?? `${pending.location.lat}, ${pending.location.lng}`}`);
  if (pending.severity != null) lines.push(`3. Severity: ${pending.severity}/10`);
  if (pending.affected_count != null) lines.push(`4. Affected: ${pending.affected_count} people`);
  if (pending.vulnerability_flags?.length) lines.push(`5. Vulnerabilities: ${pending.vulnerability_flags.join(', ')}`);
  lines.push('');
  lines.push('Reply with the number followed by the new value, e.g. "3 8" to set severity to 8.');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// State handlers
// ---------------------------------------------------------------------------

async function handleIdle(
  phone: string,
  body: string,
  conv: Conversation | null,
  numMedia: number,
  mediaUrl?: string,
  mediaContentType?: string,
): Promise<void> {
  const ngoId = conv?.ngo_id || getDefaultNgoId();
  const language = conv?.language || 'en';

  // Check if user has valid consent
  const hasConsent = await consentService.hasValidConsent(phone, ngoId);
  if (!hasConsent) {
    // Send consent message and transition to awaiting_consent
    const consentMsg = consentService.requestConsent(phone, ngoId, language);
    await sendWhatsAppMessage(`whatsapp:${phone}`, consentMsg);
    await setConversation(phone, {
      ngo_id: ngoId,
      state: 'awaiting_consent',
      language,
    });
    return;
  }

  // User has consent — start collecting need
  await handleCollectingNeed(phone, body, ngoId, language, numMedia, mediaUrl, mediaContentType);
}

async function handleAwaitingConsent(
  phone: string,
  body: string,
  conv: Conversation,
): Promise<void> {
  const normalised = body.trim().toUpperCase();

  if (normalised === 'YES') {
    await consentService.grantConsent(phone, conv.ngo_id);
    await sendWhatsAppMessage(
      `whatsapp:${phone}`,
      'Thank you for your consent. You can now report a community need. Please describe the situation.',
    );
    await setConversation(phone, { state: 'collecting_need' });
  } else if (normalised === 'NO') {
    await sendWhatsAppMessage(
      `whatsapp:${phone}`,
      'We respect your decision. You can report needs anonymously via our hotline or web form. Send a message anytime if you change your mind.',
    );
    await setConversation(phone, { state: 'idle' });
  } else {
    // Unrecognised response — re-prompt
    const consentMsg = consentService.requestConsent(phone, conv.ngo_id, conv.language);
    await sendWhatsAppMessage(`whatsapp:${phone}`, `I didn't understand that.\n\n${consentMsg}`);
  }
}

async function handleCollectingNeed(
  phone: string,
  body: string,
  ngoId: string,
  language: 'en' | 'hi' | 'pa',
  numMedia: number,
  mediaUrl?: string,
  mediaContentType?: string,
): Promise<void> {
  try {
    let extraction;
    if (numMedia > 0 && mediaUrl && mediaContentType?.startsWith('audio/')) {
      extraction = await extractionService.extractFromAudio(mediaUrl);
    } else {
      extraction = await extractionService.extractFromText(body, language);
    }

    // Check for low-confidence fields
    const lowConfFields = extractionService.getLowConfidenceFields(extraction);
    if (lowConfFields.length > 0) {
      const followUp = extractionService.generateFollowUp(lowConfFields[0], extraction.language);
      await sendWhatsAppMessage(`whatsapp:${phone}`, followUp);
      // Stay in collecting_need state so the next message refines the extraction
      await setConversation(phone, {
        ngo_id: ngoId,
        state: 'collecting_need',
        language: extraction.language,
      });
      return;
    }

    // Build pending need from extraction
    const pendingNeed: Partial<Need> = {
      source: numMedia > 0 ? 'voice' : 'whatsapp',
      need_type: extraction.need_type,
      location: extraction.location,
      severity: extraction.severity,
      affected_count: extraction.affected_count,
      vulnerability_flags: extraction.vulnerability_flags,
      raw_input: extraction.raw_input,
      language: extraction.language,
    };

    // Send summary and ask for confirmation
    const summary = formatNeedSummary(pendingNeed);
    await sendWhatsAppMessage(`whatsapp:${phone}`, summary);

    await setConversation(phone, {
      ngo_id: ngoId,
      state: 'awaiting_confirmation',
      pending_need: pendingNeed,
      extraction_confidence: extraction.confidence,
      language: extraction.language,
    });
  } catch (err) {
    logger.error('Extraction failed', { phone, error: err });
    await sendWhatsAppMessage(
      `whatsapp:${phone}`,
      'Sorry, I had trouble understanding your message. Could you please try again?',
    );
    await setConversation(phone, {
      ngo_id: ngoId,
      state: 'collecting_need',
      language,
    });
  }
}

async function handleAwaitingConfirmation(
  phone: string,
  body: string,
  conv: Conversation,
): Promise<void> {
  const normalised = body.trim().toUpperCase();

  if (normalised === 'YES') {
    const pending = conv.pending_need;
    if (!pending) {
      await sendWhatsAppMessage(`whatsapp:${phone}`, 'Something went wrong. Please report the need again.');
      await setConversation(phone, { state: 'idle', pending_need: undefined });
      return;
    }

    // Create Need document in Firestore
    const needRef = db.collection('needs').doc();
    const now = admin.firestore.Timestamp.now();
    const needDoc: Partial<Need> = {
      id: needRef.id,
      source: pending.source || 'whatsapp',
      need_type: pending.need_type || 'unknown',
      location: pending.location || { lat: 0, lng: 0, description: 'Unknown' },
      severity: pending.severity ?? 3,
      affected_count: pending.affected_count ?? 1,
      vulnerability_flags: pending.vulnerability_flags || [],
      urgency_score: 0, // Will be computed by urgency engine trigger
      status: 'new',
      ngo_id: conv.ngo_id,
      raw_input: pending.raw_input || '',
      language: conv.language || 'en',
      reporter_phone: phone,
      created_at: now as unknown as Need['created_at'],
      updated_at: now as unknown as Need['updated_at'],
      audit_trail_id: needRef.id,
    };

    await needRef.set(needDoc);

    await sendWhatsAppMessage(
      `whatsapp:${phone}`,
      'Your need has been recorded and will be prioritized. A volunteer will be dispatched soon. Thank you!',
    );
    await setConversation(phone, { state: 'idle', pending_need: undefined });
  } else if (normalised === 'EDIT') {
    const pending = conv.pending_need;
    if (!pending) {
      await sendWhatsAppMessage(`whatsapp:${phone}`, 'No pending need to edit. Please report the need again.');
      await setConversation(phone, { state: 'idle' });
      return;
    }
    const fieldList = formatFieldList(pending);
    await sendWhatsAppMessage(`whatsapp:${phone}`, fieldList);
    await setConversation(phone, { state: 'editing_fields' });
  } else {
    await sendWhatsAppMessage(`whatsapp:${phone}`, 'Please reply YES to confirm or EDIT to modify the reported need.');
  }
}

async function handleEditingFields(
  phone: string,
  body: string,
  conv: Conversation,
): Promise<void> {
  const pending = conv.pending_need || {};
  const trimmed = body.trim();

  // Parse "N value" format
  const match = trimmed.match(/^(\d)\s+(.+)$/);
  if (!match) {
    const fieldList = formatFieldList(pending);
    await sendWhatsAppMessage(`whatsapp:${phone}`, `Invalid format.\n\n${fieldList}`);
    return;
  }

  const fieldNum = parseInt(match[1], 10);
  const newValue = match[2].trim();

  switch (fieldNum) {
    case 1:
      pending.need_type = newValue;
      break;
    case 2:
      pending.location = { ...pending.location, lat: pending.location?.lat ?? 0, lng: pending.location?.lng ?? 0, description: newValue };
      break;
    case 3: {
      const sev = parseInt(newValue, 10);
      if (sev >= 1 && sev <= 10) pending.severity = sev;
      else {
        await sendWhatsAppMessage(`whatsapp:${phone}`, 'Severity must be between 1 and 10.');
        return;
      }
      break;
    }
    case 4: {
      const count = parseInt(newValue, 10);
      if (count >= 1) pending.affected_count = count;
      else {
        await sendWhatsAppMessage(`whatsapp:${phone}`, 'Affected count must be at least 1.');
        return;
      }
      break;
    }
    case 5:
      pending.vulnerability_flags = newValue.split(',').map((s) => s.trim()) as Need['vulnerability_flags'];
      break;
    default:
      await sendWhatsAppMessage(`whatsapp:${phone}`, 'Invalid field number. Please choose 1-5.');
      return;
  }

  // Show updated summary and go back to confirmation
  const summary = formatNeedSummary(pending);
  await sendWhatsAppMessage(`whatsapp:${phone}`, `Updated!\n\n${summary}`);
  await setConversation(phone, {
    state: 'awaiting_confirmation',
    pending_need: pending,
  });
}

async function handleDispatched(phone: string, body: string): Promise<void> {
  // Stub — will be implemented in task 14
  const normalised = body.trim().toUpperCase();
  const validCommands = ['YES', 'NO', 'DONE', 'HELP', 'AVAILABLE', 'BUSY'];
  if (validCommands.includes(normalised)) {
    logger.info('Volunteer command received (stub)', { phone, command: normalised });
    await sendWhatsAppMessage(
      `whatsapp:${phone}`,
      'Volunteer dispatch handling is coming soon. Your command has been noted.',
    );
  } else {
    await sendWhatsAppMessage(
      `whatsapp:${phone}`,
      'You have an active dispatch. Available commands: YES, NO, DONE, HELP, AVAILABLE, BUSY.',
    );
  }
}

async function handleDebriefActive(phone: string, body: string): Promise<void> {
  // Stub — will be implemented in task 15
  logger.info('Debrief response received (stub)', { phone, body });
  await sendWhatsAppMessage(
    `whatsapp:${phone}`,
    'Debrief handling is coming soon. Thank you for your response.',
  );
}

async function handleWithdraw(phone: string, conv: Conversation): Promise<void> {
  try {
    await consentService.revokeConsent(phone, conv.ngo_id);
    await sendWhatsAppMessage(
      `whatsapp:${phone}`,
      'Your consent has been withdrawn and your personal data has been anonymized. You can report needs anonymously via our hotline or web form.',
    );
  } catch (err) {
    logger.error('Consent revocation failed', { phone, error: err });
    await sendWhatsAppMessage(
      `whatsapp:${phone}`,
      'We could not find an active consent to withdraw. If you believe this is an error, please contact us.',
    );
  }
  await setConversation(phone, { state: 'idle', pending_need: undefined });
}

// ---------------------------------------------------------------------------
// Main webhook Cloud Function
// ---------------------------------------------------------------------------

export const whatsappWebhook = onRequest(
  { region: 'asia-south1' },
  async (req, res) => {
    // Only accept POST
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    // Validate Twilio request signature
    const twilioSignature = req.headers['x-twilio-signature'] as string | undefined;
    if (!twilioSignature) {
      logger.warn('Missing Twilio signature');
      res.status(403).send('Forbidden');
      return;
    }

    const isValid = twilio.validateRequest(
      getTwilioAuthToken(),
      twilioSignature,
      getWebhookUrl(),
      req.body,
    );

    if (!isValid) {
      logger.warn('Invalid Twilio signature');
      res.status(403).send('Forbidden');
      return;
    }

    // Extract fields from Twilio request body
    const {
      From: rawFrom,
      Body: body,
      NumMedia: numMediaStr,
      MediaUrl0: mediaUrl,
      MediaContentType0: mediaContentType,
      MessageSid: messageSid,
    } = req.body;

    if (!rawFrom || !messageSid) {
      res.status(400).send('Bad Request');
      return;
    }

    // Normalise phone — strip "whatsapp:" prefix if present
    const phone = rawFrom.replace(/^whatsapp:/, '');
    const numMedia = parseInt(numMediaStr || '0', 10);
    const messageBody = (body || '').trim();

    // Ignore empty messages with no media
    if (!messageBody && numMedia === 0) {
      logger.warn('Empty message received', { phone });
      res.status(200).send('<Response></Response>');
      return;
    }

    // Idempotency check
    if (await isMessageProcessed(messageSid)) {
      logger.info('Duplicate message ignored', { messageSid, phone });
      res.status(200).send('<Response></Response>');
      return;
    }
    await markMessageProcessed(messageSid);

    try {
      // Load conversation state
      const conv = await getConversation(phone);

      // Global WITHDRAW command — works from any state
      if (messageBody.toUpperCase() === 'WITHDRAW') {
        if (conv) {
          await handleWithdraw(phone, conv);
        } else {
          await sendWhatsAppMessage(
            `whatsapp:${phone}`,
            'No active consent found to withdraw.',
          );
        }
        res.status(200).send('<Response></Response>');
        return;
      }

      // Route based on conversation state
      const state = conv?.state || 'idle';

      switch (state) {
        case 'idle':
          await handleIdle(phone, messageBody, conv, numMedia, mediaUrl, mediaContentType);
          break;
        case 'awaiting_consent':
          await handleAwaitingConsent(phone, messageBody, conv!);
          break;
        case 'collecting_need':
          await handleCollectingNeed(
            phone,
            messageBody,
            conv!.ngo_id,
            conv!.language,
            numMedia,
            mediaUrl,
            mediaContentType,
          );
          break;
        case 'awaiting_confirmation':
          await handleAwaitingConfirmation(phone, messageBody, conv!);
          break;
        case 'editing_fields':
          await handleEditingFields(phone, messageBody, conv!);
          break;
        case 'dispatched':
          await handleDispatched(phone, messageBody);
          break;
        case 'debrief_active':
          await handleDebriefActive(phone, messageBody);
          break;
        default:
          logger.warn('Unknown conversation state', { phone, state });
          await handleIdle(phone, messageBody, conv, numMedia, mediaUrl, mediaContentType);
          break;
      }

      res.status(200).send('<Response></Response>');
    } catch (err) {
      logger.error('Webhook processing error', { phone, error: err });
      res.status(500).send('Internal Server Error');
    }
  },
);
