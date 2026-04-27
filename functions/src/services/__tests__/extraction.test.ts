import { extractionService, _setGenAIForTesting } from '../extraction';
import { ExtractionResult } from '../../types/extraction';

// --- Helpers to build mock Gemini instances ---

function makeMockGenAI(responseText: string) {
  const mockResponse = {
    response: { text: () => responseText },
  };
  const mockModel = {
    generateContent: jest.fn().mockResolvedValue(mockResponse),
  };
  return {
    instance: { getGenerativeModel: jest.fn().mockReturnValue(mockModel) } as any,
    mockModel,
  };
}

// Stub global fetch for audio tests
const originalFetch = global.fetch;

afterEach(() => {
  _setGenAIForTesting(null);
  global.fetch = originalFetch;
});

// ---- extractFromText ----

describe('extractFromText', () => {
  it('parses a valid Gemini JSON response into ExtractionResult', async () => {
    const geminiJson = JSON.stringify({
      need_type: 'food_shortage',
      location: { lat: 28.6, lng: 77.2, description: 'Sector 5, Noida' },
      severity: 7,
      affected_count: 25,
      vulnerability_flags: ['children', 'elderly'],
      confidence: {
        need_type: 0.95,
        location: 0.8,
        severity: 0.9,
        affected_count: 0.75,
        vulnerability_flags: 0.85,
      },
      language: 'en',
    });

    const { instance } = makeMockGenAI(geminiJson);
    _setGenAIForTesting(instance);

    const result = await extractionService.extractFromText('There is a food shortage in Sector 5 Noida affecting 25 people including children and elderly');

    expect(result.need_type).toBe('food_shortage');
    expect(result.location).toEqual({ lat: 28.6, lng: 77.2, description: 'Sector 5, Noida' });
    expect(result.severity).toBe(7);
    expect(result.affected_count).toBe(25);
    expect(result.vulnerability_flags).toEqual(['children', 'elderly']);
    expect(result.confidence.need_type).toBe(0.95);
    expect(result.language).toBe('en');
    expect(result.raw_input).toBe('There is a food shortage in Sector 5 Noida affecting 25 people including children and elderly');
  });

  it('handles response wrapped in markdown code fences', async () => {
    const geminiJson = '```json\n' + JSON.stringify({
      need_type: 'medical_emergency',
      location: { lat: 30.7, lng: 76.7, description: 'Civil Hospital, Chandigarh' },
      severity: 9,
      affected_count: 3,
      vulnerability_flags: ['medical_emergency'],
      confidence: {
        need_type: 0.9,
        location: 0.85,
        severity: 0.95,
        affected_count: 0.8,
        vulnerability_flags: 0.9,
      },
      language: 'en',
    }) + '\n```';

    const { instance } = makeMockGenAI(geminiJson);
    _setGenAIForTesting(instance);

    const result = await extractionService.extractFromText('Medical emergency near Civil Hospital Chandigarh');
    expect(result.need_type).toBe('medical_emergency');
    expect(result.severity).toBe(9);
  });

  it('returns low-confidence fields correctly', async () => {
    const geminiJson = JSON.stringify({
      need_type: 'shelter',
      location: { lat: 0, lng: 0, description: 'unknown area' },
      severity: 5,
      affected_count: 10,
      vulnerability_flags: [],
      confidence: {
        need_type: 0.9,
        location: 0.3,
        severity: 0.5,
        affected_count: 0.65,
        vulnerability_flags: 0.8,
      },
      language: 'hi',
    });

    const { instance } = makeMockGenAI(geminiJson);
    _setGenAIForTesting(instance);

    const result = await extractionService.extractFromText('कहीं पर आश्रय चाहिए', 'hi');

    // location (0.3), severity (0.5), affected_count (0.65) are all < 0.7
    const lowFields = extractionService.getLowConfidenceFields(result);
    expect(lowFields).toContain('location');
    expect(lowFields).toContain('severity');
    expect(lowFields).toContain('affected_count');
    expect(lowFields).not.toContain('need_type');
    expect(lowFields).not.toContain('vulnerability_flags');
  });
});

// ---- extractFromAudio ----

describe('extractFromAudio', () => {
  it('extracts from audio with good transcription confidence', async () => {
    const geminiJson = JSON.stringify({
      transcription: 'There is flooding in our village near the river',
      transcription_confidence: 0.88,
      need_type: 'rescue',
      location: { lat: 31.1, lng: 75.3, description: 'Village near river' },
      severity: 8,
      affected_count: 50,
      vulnerability_flags: ['children', 'elderly'],
      confidence: {
        need_type: 0.85,
        location: 0.7,
        severity: 0.8,
        affected_count: 0.6,
        vulnerability_flags: 0.75,
      },
      language: 'en',
    });

    const { instance } = makeMockGenAI(geminiJson);
    _setGenAIForTesting(instance);

    // Mock fetch for audio download
    const audioBuffer = new ArrayBuffer(8);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(audioBuffer),
      headers: new Map([['content-type', 'audio/ogg']]) as any,
    });

    const result = await extractionService.extractFromAudio('https://example.com/audio.ogg');

    expect(result.need_type).toBe('rescue');
    expect(result.raw_input).toBe('There is flooding in our village near the river');
    expect(result.severity).toBe(8);
    expect(result.affected_count).toBe(50);
  });

  it('throws error when transcription confidence is below 0.5', async () => {
    const geminiJson = JSON.stringify({
      transcription: 'unintelligible audio',
      transcription_confidence: 0.3,
      need_type: 'unknown',
      location: { lat: 0, lng: 0, description: '' },
      severity: 1,
      affected_count: 1,
      vulnerability_flags: [],
      confidence: {
        need_type: 0.1,
        location: 0.1,
        severity: 0.1,
        affected_count: 0.1,
        vulnerability_flags: 0.1,
      },
      language: 'en',
    });

    const { instance } = makeMockGenAI(geminiJson);
    _setGenAIForTesting(instance);

    const audioBuffer = new ArrayBuffer(8);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(audioBuffer),
      headers: new Map([['content-type', 'audio/ogg']]) as any,
    });

    await expect(
      extractionService.extractFromAudio('https://example.com/bad-audio.ogg')
    ).rejects.toThrow('Audio transcription confidence is too low');
  });

  it('throws error when audio download fails', async () => {
    _setGenAIForTesting({ getGenerativeModel: jest.fn() } as any);

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      statusText: 'Not Found',
    });

    await expect(
      extractionService.extractFromAudio('https://example.com/missing.ogg')
    ).rejects.toThrow('Failed to download audio');
  });
});

// ---- generateFollowUp ----

describe('generateFollowUp', () => {
  it('returns English follow-up for location field', () => {
    const q = extractionService.generateFollowUp('location', 'en');
    expect(q).toBe('Could you please specify the exact location or area name?');
  });

  it('returns Hindi follow-up for severity field', () => {
    const q = extractionService.generateFollowUp('severity', 'hi');
    expect(q).toContain('1 से 10');
  });

  it('returns Punjabi follow-up for affected_count field', () => {
    const q = extractionService.generateFollowUp('affected_count', 'pa');
    expect(q).toContain('ਕਿੰਨੇ ਲੋਕ');
  });

  it('falls back to English for unknown language', () => {
    const q = extractionService.generateFollowUp('location', 'fr');
    expect(q).toBe('Could you please specify the exact location or area name?');
  });

  it('falls back to need_type question for unknown field', () => {
    const q = extractionService.generateFollowUp('unknown_field', 'en');
    expect(q).toBe('Could you please describe the type of help needed more clearly?');
  });
});

// ---- getLowConfidenceFields ----

describe('getLowConfidenceFields', () => {
  it('returns fields with confidence below 0.7', () => {
    const result: ExtractionResult = {
      need_type: 'food_shortage',
      location: { lat: 28.6, lng: 77.2, description: 'Test' },
      severity: 5,
      affected_count: 10,
      vulnerability_flags: [],
      confidence: {
        need_type: 0.9,
        location: 0.4,
        severity: 0.69,
        affected_count: 0.7,
        vulnerability_flags: 0.95,
      },
      language: 'en',
      raw_input: 'test',
    };

    const lowFields = extractionService.getLowConfidenceFields(result);
    expect(lowFields).toEqual(expect.arrayContaining(['location', 'severity']));
    expect(lowFields).not.toContain('need_type');
    expect(lowFields).not.toContain('affected_count'); // 0.7 is NOT < 0.7
    expect(lowFields).not.toContain('vulnerability_flags');
  });

  it('returns empty array when all fields have high confidence', () => {
    const result: ExtractionResult = {
      need_type: 'rescue',
      location: { lat: 30, lng: 76, description: 'Test' },
      severity: 8,
      affected_count: 20,
      vulnerability_flags: ['children'],
      confidence: {
        need_type: 0.95,
        location: 0.85,
        severity: 0.9,
        affected_count: 0.8,
        vulnerability_flags: 0.88,
      },
      language: 'en',
      raw_input: 'test',
    };

    const lowFields = extractionService.getLowConfidenceFields(result);
    expect(lowFields).toEqual([]);
  });
});
