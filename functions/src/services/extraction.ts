import { GoogleGenerativeAI } from '@google/generative-ai';
import { ExtractionResult } from '../types/extraction';
import { VulnerabilityFlag } from '../types/common';

let genAIInstance: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (!genAIInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set');
    }
    genAIInstance = new GoogleGenerativeAI(apiKey);
  }
  return genAIInstance;
}

/** Visible for testing — allows injecting a mock GoogleGenerativeAI instance. */
export function _setGenAIForTesting(instance: GoogleGenerativeAI | null): void {
  genAIInstance = instance;
}

const EXTRACTION_PROMPT = `You are a humanitarian need extraction system. Analyze the following message and extract structured information about the community need being reported.

Return ONLY valid JSON with the following fields:
{
  "need_type": "string - type of need (e.g., food_shortage, medical_emergency, shelter, water, clothing, rescue)",
  "location": {
    "lat": number,
    "lng": number,
    "description": "string - human-readable location description"
  },
  "severity": number (1-10, where 10 is most severe),
  "affected_count": number (estimated number of people affected),
  "vulnerability_flags": ["array of applicable flags: children, elderly, pregnant, disabled, medical_emergency"],
  "confidence": {
    "need_type": number (0.0-1.0),
    "location": number (0.0-1.0),
    "severity": number (0.0-1.0),
    "affected_count": number (0.0-1.0),
    "vulnerability_flags": number (0.0-1.0)
  },
  "language": "detected language code: en, hi, or pa"
}

If a field cannot be determined, provide your best estimate and set its confidence low.`;

const AUDIO_EXTRACTION_PROMPT = `You are a humanitarian need extraction system processing an audio message. First transcribe the audio, then extract structured information.

Return ONLY valid JSON with the following fields:
{
  "transcription": "string - the transcribed text",
  "transcription_confidence": number (0.0-1.0),
  "need_type": "string - type of need",
  "location": {
    "lat": number,
    "lng": number,
    "description": "string"
  },
  "severity": number (1-10),
  "affected_count": number,
  "vulnerability_flags": ["array of flags"],
  "confidence": {
    "need_type": number (0.0-1.0),
    "location": number (0.0-1.0),
    "severity": number (0.0-1.0),
    "affected_count": number (0.0-1.0),
    "vulnerability_flags": number (0.0-1.0)
  },
  "language": "detected language code: en, hi, or pa"
}`;

const FOLLOW_UP_QUESTIONS: Record<string, Record<string, string>> = {
  en: {
    need_type: 'Could you please describe the type of help needed more clearly?',
    location: 'Could you please specify the exact location or area name?',
    severity: 'How serious is the situation on a scale of 1 to 10?',
    affected_count: 'Approximately how many people are affected?',
    vulnerability_flags: 'Are there children, elderly, pregnant women, disabled persons, or medical emergencies involved?',
  },
  hi: {
    need_type: 'कृपया आवश्यक सहायता के प्रकार को और स्पष्ट रूप से बता सकते हैं?',
    location: 'कृपया सटीक स्थान या क्षेत्र का नाम बता सकते हैं?',
    severity: 'स्थिति 1 से 10 के पैमाने पर कितनी गंभीर है?',
    affected_count: 'लगभग कितने लोग प्रभावित हैं?',
    vulnerability_flags: 'क्या इसमें बच्चे, बुजुर्ग, गर्भवती महिलाएं, विकलांग व्यक्ति, या चिकित्सा आपातकाल शामिल हैं?',
  },
  pa: {
    need_type: 'ਕਿਰਪਾ ਕਰਕੇ ਲੋੜੀਂਦੀ ਮਦਦ ਦੀ ਕਿਸਮ ਨੂੰ ਹੋਰ ਸਪੱਸ਼ਟ ਰੂਪ ਵਿੱਚ ਦੱਸ ਸਕਦੇ ਹੋ?',
    location: 'ਕਿਰਪਾ ਕਰਕੇ ਸਹੀ ਟਿਕਾਣਾ ਜਾਂ ਖੇਤਰ ਦਾ ਨਾਮ ਦੱਸ ਸਕਦੇ ਹੋ?',
    severity: 'ਸਥਿਤੀ 1 ਤੋਂ 10 ਦੇ ਪੈਮਾਨੇ \'ਤੇ ਕਿੰਨੀ ਗੰਭੀਰ ਹੈ?',
    affected_count: 'ਲਗਭਗ ਕਿੰਨੇ ਲੋਕ ਪ੍ਰਭਾਵਿਤ ਹਨ?',
    vulnerability_flags: 'ਕੀ ਇਸ ਵਿੱਚ ਬੱਚੇ, ਬਜ਼ੁਰਗ, ਗਰਭਵਤੀ ਔਰਤਾਂ, ਅਪਾਹਜ ਵਿਅਕਤੀ, ਜਾਂ ਮੈਡੀਕਲ ਐਮਰਜੈਂਸੀ ਸ਼ਾਮਲ ਹਨ?',
  },
};

function parseGeminiResponse(responseText: string): Record<string, unknown> {
  // Strip markdown code fences if present
  let cleaned = responseText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  return JSON.parse(cleaned);
}

export const extractionService = {
  async extractFromText(text: string, language?: string): Promise<ExtractionResult> {
    const genAI = getGenAI();
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = language
      ? `${EXTRACTION_PROMPT}\n\nThe message is in language: ${language}\n\nMessage:\n${text}`
      : `${EXTRACTION_PROMPT}\n\nMessage:\n${text}`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const responseText = response.text();

    const parsed = parseGeminiResponse(responseText);

    return {
      need_type: parsed.need_type as string,
      location: parsed.location as { lat: number; lng: number; description: string },
      severity: parsed.severity as number,
      affected_count: parsed.affected_count as number,
      vulnerability_flags: (parsed.vulnerability_flags as VulnerabilityFlag[]) || [],
      confidence: parsed.confidence as Record<string, number>,
      language: (parsed.language as 'en' | 'hi' | 'pa') || 'en',
      raw_input: text,
    };
  },

  async extractFromAudio(audioUrl: string): Promise<ExtractionResult> {
    const genAI = getGenAI();
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    // Download audio from URL
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to download audio from ${audioUrl}: ${audioResponse.statusText}`);
    }
    const audioBuffer = await audioResponse.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');

    const contentType = audioResponse.headers.get('content-type') || 'audio/ogg';

    const result = await model.generateContent([
      { text: AUDIO_EXTRACTION_PROMPT },
      {
        inlineData: {
          mimeType: contentType,
          data: audioBase64,
        },
      },
    ]);

    const response = result.response;
    const responseText = response.text();

    const parsed = parseGeminiResponse(responseText);

    const transcriptionConfidence = parsed.transcription_confidence as number;
    if (transcriptionConfidence < 0.5) {
      throw new Error(
        'Audio transcription confidence is too low. Please resend the voice message or type your message instead.'
      );
    }

    const transcription = parsed.transcription as string;

    return {
      need_type: parsed.need_type as string,
      location: parsed.location as { lat: number; lng: number; description: string },
      severity: parsed.severity as number,
      affected_count: parsed.affected_count as number,
      vulnerability_flags: (parsed.vulnerability_flags as VulnerabilityFlag[]) || [],
      confidence: parsed.confidence as Record<string, number>,
      language: (parsed.language as 'en' | 'hi' | 'pa') || 'en',
      raw_input: transcription,
    };
  },

  generateFollowUp(field: string, language: string): string {
    const langQuestions = FOLLOW_UP_QUESTIONS[language] || FOLLOW_UP_QUESTIONS['en'];
    return langQuestions[field] || langQuestions['need_type'];
  },

  getLowConfidenceFields(result: ExtractionResult): string[] {
    return Object.entries(result.confidence)
      .filter(([, score]) => score < 0.7)
      .map(([field]) => field);
  },
};
