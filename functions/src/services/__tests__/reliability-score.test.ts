import { computeScore, reliabilityScoreService } from '../reliability-score';
import { Volunteer } from '../../types/volunteer';

type TaskHistory = Volunteer['task_history'];

// ─── Firestore mocks ────────────────────────────────────────────────
const mockUpdate = jest.fn().mockResolvedValue(undefined);
const mockGet = jest.fn();
const mockDoc = jest.fn().mockReturnValue({ get: mockGet, update: mockUpdate });
const mockCollection = jest.fn().mockReturnValue({ doc: mockDoc });

jest.mock('../../config/firebase', () => ({
  db: {
    collection: (...args: unknown[]) => mockCollection(...args),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockCollection.mockReturnValue({ doc: mockDoc });
  mockDoc.mockReturnValue({ get: mockGet, update: mockUpdate });
});

// ─── Helper ─────────────────────────────────────────────────────────
function makeHistory(overrides: Partial<TaskHistory> = {}): TaskHistory {
  return {
    total_completed: 0,
    total_declined: 0,
    total_escalated: 0,
    avg_response_time_minutes: 0,
    avg_feedback_rating: 0,
    ...overrides,
  };
}

function makeVolunteerSnap(history: TaskHistory, extra: Record<string, unknown> = {}) {
  return {
    exists: true,
    data: () => ({
      id: 'vol-1',
      task_history: history,
      reliability_score: 50,
      status: 'available',
      ...extra,
    }),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Pure computeScore tests
// ═══════════════════════════════════════════════════════════════════════
describe('computeScore (pure)', () => {
  it('returns 0 for a volunteer with no tasks and zero ratings', () => {
    const score = computeScore(makeHistory());
    // completion_rate=0, response_time_score=max(0,1-0/30)=1, feedback=0/5=0
    // (0*0.4 + 1*0.3 + 0*0.3)*100 = 30
    expect(score).toBe(30);
  });

  it('returns 100 for a perfect volunteer', () => {
    const score = computeScore(
      makeHistory({
        total_completed: 10,
        avg_response_time_minutes: 0,
        avg_feedback_rating: 5,
      }),
    );
    // completion_rate=1, response_time_score=1, feedback=1
    // (1*0.4 + 1*0.3 + 1*0.3)*100 = 100
    expect(score).toBe(100);
  });

  it('computes correctly for mixed history', () => {
    const score = computeScore(
      makeHistory({
        total_completed: 6,
        total_declined: 2,
        total_escalated: 2,
        avg_response_time_minutes: 15,
        avg_feedback_rating: 4,
      }),
    );
    // completion_rate = 6/10 = 0.6
    // response_time_score = max(0, 1 - 15/30) = 0.5
    // feedback_score = 4/5 = 0.8
    // (0.6*0.4 + 0.5*0.3 + 0.8*0.3)*100 = (0.24 + 0.15 + 0.24)*100 = 63
    expect(score).toBe(63);
  });

  it('clamps response_time_score to 0 when avg_response_time >= 30', () => {
    const score = computeScore(
      makeHistory({
        total_completed: 5,
        avg_response_time_minutes: 60,
        avg_feedback_rating: 5,
      }),
    );
    // completion_rate=1, response_time_score=0, feedback=1
    // (1*0.4 + 0*0.3 + 1*0.3)*100 = 70
    expect(score).toBe(70);
  });

  it('handles all declines (completion_rate = 0)', () => {
    const score = computeScore(
      makeHistory({
        total_declined: 10,
        avg_response_time_minutes: 0,
        avg_feedback_rating: 0,
      }),
    );
    // completion_rate=0, response_time_score=1, feedback=0
    // (0 + 0.3 + 0)*100 = 30
    expect(score).toBe(30);
  });

  it('never exceeds 100', () => {
    // Even with extreme values
    const score = computeScore(
      makeHistory({
        total_completed: 1000,
        avg_response_time_minutes: 0,
        avg_feedback_rating: 5,
      }),
    );
    expect(score).toBeLessThanOrEqual(100);
  });

  it('never goes below 0', () => {
    const score = computeScore(
      makeHistory({
        total_declined: 1000,
        avg_response_time_minutes: 999,
        avg_feedback_rating: 0,
      }),
    );
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// updateOnCompletion tests
// ═══════════════════════════════════════════════════════════════════════
describe('reliabilityScoreService.updateOnCompletion', () => {
  it('increments total_completed and updates avg_response_time', async () => {
    const history = makeHistory({
      total_completed: 4,
      avg_response_time_minutes: 10,
      avg_feedback_rating: 4,
    });
    mockGet.mockResolvedValue(makeVolunteerSnap(history));

    await reliabilityScoreService.updateOnCompletion('vol-1', 20);

    expect(mockCollection).toHaveBeenCalledWith('volunteers');
    expect(mockDoc).toHaveBeenCalledWith('vol-1');
    expect(mockUpdate).toHaveBeenCalledTimes(1);

    const updateArg = mockUpdate.mock.calls[0][0];
    expect(updateArg.task_history.total_completed).toBe(5);
    // running avg: (10*4 + 20) / 5 = 60/5 = 12
    expect(updateArg.task_history.avg_response_time_minutes).toBe(12);
    expect(typeof updateArg.reliability_score).toBe('number');
  });

  it('sets status to under_review when score drops below 30', async () => {
    const history = makeHistory({
      total_completed: 0,
      total_declined: 10,
      avg_response_time_minutes: 25,
      avg_feedback_rating: 0,
    });
    mockGet.mockResolvedValue(makeVolunteerSnap(history));

    await reliabilityScoreService.updateOnCompletion('vol-1', 29);

    const updateArg = mockUpdate.mock.calls[0][0];
    expect(updateArg.reliability_score).toBeLessThan(30);
    expect(updateArg.status).toBe('under_review');
  });

  it('throws when volunteerId is empty', async () => {
    await expect(reliabilityScoreService.updateOnCompletion('', 5)).rejects.toThrow(
      'volunteerId is required',
    );
  });

  it('throws when volunteer not found', async () => {
    mockGet.mockResolvedValue({ exists: false });
    await expect(reliabilityScoreService.updateOnCompletion('missing', 5)).rejects.toThrow(
      'Volunteer missing not found',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// updateOnDecline tests
// ═══════════════════════════════════════════════════════════════════════
describe('reliabilityScoreService.updateOnDecline', () => {
  it('increments total_declined and recomputes score', async () => {
    const history = makeHistory({
      total_completed: 5,
      total_declined: 1,
      avg_response_time_minutes: 10,
      avg_feedback_rating: 4,
    });
    mockGet.mockResolvedValue(makeVolunteerSnap(history));

    await reliabilityScoreService.updateOnDecline('vol-1');

    const updateArg = mockUpdate.mock.calls[0][0];
    expect(updateArg.task_history.total_declined).toBe(2);
    expect(typeof updateArg.reliability_score).toBe('number');
  });

  it('sets status to under_review when score < 30', async () => {
    const history = makeHistory({
      total_completed: 0,
      total_declined: 5,
      avg_response_time_minutes: 25,
      avg_feedback_rating: 0,
    });
    mockGet.mockResolvedValue(makeVolunteerSnap(history));

    await reliabilityScoreService.updateOnDecline('vol-1');

    const updateArg = mockUpdate.mock.calls[0][0];
    expect(updateArg.reliability_score).toBeLessThan(30);
    expect(updateArg.status).toBe('under_review');
  });

  it('throws when volunteerId is empty', async () => {
    await expect(reliabilityScoreService.updateOnDecline('')).rejects.toThrow(
      'volunteerId is required',
    );
  });

  it('throws when volunteer not found', async () => {
    mockGet.mockResolvedValue({ exists: false });
    await expect(reliabilityScoreService.updateOnDecline('missing')).rejects.toThrow(
      'Volunteer missing not found',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// updateOnFeedback tests
// ═══════════════════════════════════════════════════════════════════════
describe('reliabilityScoreService.updateOnFeedback', () => {
  it('updates avg_feedback_rating using running average', async () => {
    const history = makeHistory({
      total_completed: 4,
      avg_response_time_minutes: 10,
      avg_feedback_rating: 3,
    });
    mockGet.mockResolvedValue(makeVolunteerSnap(history));

    await reliabilityScoreService.updateOnFeedback('vol-1', 5);

    const updateArg = mockUpdate.mock.calls[0][0];
    // running avg: (3*4 + 5) / 5 = 17/5 = 3.4
    expect(updateArg.task_history.avg_feedback_rating).toBeCloseTo(3.4);
    expect(typeof updateArg.reliability_score).toBe('number');
  });

  it('handles first feedback when total_completed is 0', async () => {
    const history = makeHistory({ total_completed: 0, avg_feedback_rating: 0 });
    mockGet.mockResolvedValue(makeVolunteerSnap(history));

    await reliabilityScoreService.updateOnFeedback('vol-1', 4);

    const updateArg = mockUpdate.mock.calls[0][0];
    expect(updateArg.task_history.avg_feedback_rating).toBe(4);
  });

  it('throws when volunteerId is empty', async () => {
    await expect(reliabilityScoreService.updateOnFeedback('', 5)).rejects.toThrow(
      'volunteerId is required',
    );
  });

  it('throws when volunteer not found', async () => {
    mockGet.mockResolvedValue({ exists: false });
    await expect(reliabilityScoreService.updateOnFeedback('missing', 5)).rejects.toThrow(
      'Volunteer missing not found',
    );
  });
});
