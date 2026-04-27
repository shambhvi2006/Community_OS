import { db } from '../config/firebase';
import { Consent } from '../types/consent';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

const CONSENT_MESSAGES: Record<string, string> = {
  en: 'We would like to collect information about the community need you are reporting. '
    + 'This data will be used to coordinate volunteer response and track resolution. '
    + 'Your phone number will be stored to send you updates and verify task completion. '
    + 'You can withdraw consent at any time by sending WITHDRAW. '
    + 'Reply YES to consent or NO to decline.',
  hi: 'हम आपकी रिपोर्ट की गई सामुदायिक आवश्यकता के बारे में जानकारी एकत्र करना चाहते हैं। '
    + 'इस डेटा का उपयोग स्वयंसेवक प्रतिक्रिया समन्वय और समाधान ट्रैकिंग के लिए किया जाएगा। '
    + 'आपका फ़ोन नंबर अपडेट भेजने और कार्य पूर्णता सत्यापित करने के लिए संग्रहीत किया जाएगा। '
    + 'आप किसी भी समय WITHDRAW भेजकर सहमति वापस ले सकते हैं। '
    + 'सहमति के लिए YES या अस्वीकार करने के लिए NO भेजें।',
  pa: 'ਅਸੀਂ ਤੁਹਾਡੀ ਰਿਪੋਰਟ ਕੀਤੀ ਭਾਈਚਾਰਕ ਲੋੜ ਬਾਰੇ ਜਾਣਕਾਰੀ ਇਕੱਠੀ ਕਰਨਾ ਚਾਹੁੰਦੇ ਹਾਂ। '
    + 'ਇਹ ਡੇਟਾ ਵਲੰਟੀਅਰ ਜਵਾਬ ਤਾਲਮੇਲ ਅਤੇ ਹੱਲ ਟਰੈਕਿੰਗ ਲਈ ਵਰਤਿਆ ਜਾਵੇਗਾ। '
    + 'ਤੁਹਾਡਾ ਫ਼ੋਨ ਨੰਬਰ ਅੱਪਡੇਟ ਭੇਜਣ ਅਤੇ ਕੰਮ ਪੂਰਾ ਹੋਣ ਦੀ ਪੁਸ਼ਟੀ ਲਈ ਸਟੋਰ ਕੀਤਾ ਜਾਵੇਗਾ। '
    + 'ਤੁਸੀਂ ਕਿਸੇ ਵੀ ਸਮੇਂ WITHDRAW ਭੇਜ ਕੇ ਸਹਿਮਤੀ ਵਾਪਸ ਲੈ ਸਕਦੇ ਹੋ। '
    + 'ਸਹਿਮਤੀ ਲਈ YES ਜਾਂ ਇਨਕਾਰ ਲਈ NO ਭੇਜੋ।',
};

export const consentService = {
  requestConsent(phone: string, ngo_id: string, language: string): string {
    if (!phone || typeof phone !== 'string') {
      throw new Error('phone is required and must be a non-empty string');
    }
    if (!ngo_id || typeof ngo_id !== 'string') {
      throw new Error('ngo_id is required and must be a non-empty string');
    }
    return CONSENT_MESSAGES[language] || CONSENT_MESSAGES['en'];
  },

  async grantConsent(phone: string, ngo_id: string): Promise<string> {
    if (!phone || typeof phone !== 'string') {
      throw new Error('phone is required and must be a non-empty string');
    }
    if (!ngo_id || typeof ngo_id !== 'string') {
      throw new Error('ngo_id is required and must be a non-empty string');
    }

    const consentId = crypto.randomUUID();
    const consent: Consent = {
      id: consentId,
      phone,
      ngo_id,
      status: 'active',
      granted_at: admin.firestore.Timestamp.now() as unknown as Consent['granted_at'],
    };

    await db.collection('consents').doc(consentId).set(consent);
    return consentId;
  },

  async revokeConsent(phone: string, ngo_id: string): Promise<void> {
    if (!phone || typeof phone !== 'string') {
      throw new Error('phone is required and must be a non-empty string');
    }
    if (!ngo_id || typeof ngo_id !== 'string') {
      throw new Error('ngo_id is required and must be a non-empty string');
    }

    // Find active consent for this phone + ngo_id
    const snapshot = await db
      .collection('consents')
      .where('phone', '==', phone)
      .where('ngo_id', '==', ngo_id)
      .where('status', '==', 'active')
      .get();

    if (snapshot.empty) {
      throw new Error('No active consent found for this phone and ngo_id');
    }

    const batch = db.batch();

    // Revoke all active consents for this phone + ngo_id
    const consentIds: string[] = [];
    for (const doc of snapshot.docs) {
      batch.update(doc.ref, {
        status: 'revoked',
        revoked_at: admin.firestore.Timestamp.now(),
      });
      consentIds.push(doc.id);
    }

    await batch.commit();

    // Anonymize reporter_phone in all Need documents referencing these consent tokens
    for (const consentId of consentIds) {
      const needsSnapshot = await db
        .collection('needs')
        .where('consent_token', '==', consentId)
        .get();

      if (!needsSnapshot.empty) {
        const needsBatch = db.batch();
        for (const needDoc of needsSnapshot.docs) {
          needsBatch.update(needDoc.ref, { reporter_phone: 'ANONYMIZED' });
        }
        await needsBatch.commit();
      }
    }
  },

  async hasValidConsent(phone: string, ngo_id: string): Promise<boolean> {
    if (!phone || typeof phone !== 'string') {
      throw new Error('phone is required and must be a non-empty string');
    }
    if (!ngo_id || typeof ngo_id !== 'string') {
      throw new Error('ngo_id is required and must be a non-empty string');
    }

    const snapshot = await db
      .collection('consents')
      .where('phone', '==', phone)
      .where('ngo_id', '==', ngo_id)
      .where('status', '==', 'active')
      .get();

    return !snapshot.empty;
  },
};
