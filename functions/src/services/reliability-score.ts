import { db } from '../config/firebase';
import { Volunteer } from '../types/volunteer';

type TaskHistory = Volunteer['task_history'];

/**
 * Pure function: computes reliability score from task history.
 *
 * Formula: reliability_score = (completion_rate × 0.4 + response_time_score × 0.3 + feedback_score × 0.3) × 100
 * Clamped to [0, 100].
 *
 * - completion_rate = total_completed / (total_completed + total_declined + total_escalated), or 0 if no tasks
 * - response_time_score = max(0, 1 - (avg_response_time_minutes / 30)), normalized to [0, 1]
 * - feedback_score = avg_feedback_rating / 5.0, normalized to [0, 1]
 */
export function computeScore(taskHistory: TaskHistory): number {
  const { total_completed, total_declined, total_escalated, avg_response_time_minutes, avg_feedback_rating } = taskHistory;

  const totalTasks = total_completed + total_declined + total_escalated;
  const completionRate = totalTasks > 0 ? total_completed / totalTasks : 0;

  const responseTimeScore = Math.max(0, 1 - (avg_response_time_minutes / 30));

  const feedbackScore = avg_feedback_rating / 5.0;

  const raw = (completionRate * 0.4 + responseTimeScore * 0.3 + feedbackScore * 0.3) * 100;

  return Math.min(100, Math.max(0, raw));
}

export const reliabilityScoreService = {
  computeScore,

  async updateOnCompletion(volunteerId: string, responseTimeMinutes: number): Promise<void> {
    if (!volunteerId || typeof volunteerId !== 'string') {
      throw new Error('volunteerId is required and must be a non-empty string');
    }

    const docRef = db.collection('volunteers').doc(volunteerId);
    const snap = await docRef.get();
    if (!snap.exists) {
      throw new Error(`Volunteer ${volunteerId} not found`);
    }

    const volunteer = snap.data() as Volunteer;
    const history = volunteer.task_history;

    const newTotalCompleted = history.total_completed + 1;
    // Running average for response time
    const newAvgResponseTime =
      (history.avg_response_time_minutes * history.total_completed + responseTimeMinutes) / newTotalCompleted;

    const updatedHistory: TaskHistory = {
      ...history,
      total_completed: newTotalCompleted,
      avg_response_time_minutes: newAvgResponseTime,
    };

    const score = computeScore(updatedHistory);
    const update: Record<string, unknown> = {
      task_history: updatedHistory,
      reliability_score: score,
    };

    if (score < 30) {
      update.status = 'under_review';
    }

    await docRef.update(update);
  },

  async updateOnDecline(volunteerId: string): Promise<void> {
    if (!volunteerId || typeof volunteerId !== 'string') {
      throw new Error('volunteerId is required and must be a non-empty string');
    }

    const docRef = db.collection('volunteers').doc(volunteerId);
    const snap = await docRef.get();
    if (!snap.exists) {
      throw new Error(`Volunteer ${volunteerId} not found`);
    }

    const volunteer = snap.data() as Volunteer;
    const history = volunteer.task_history;

    const updatedHistory: TaskHistory = {
      ...history,
      total_declined: history.total_declined + 1,
    };

    const score = computeScore(updatedHistory);
    const update: Record<string, unknown> = {
      task_history: updatedHistory,
      reliability_score: score,
    };

    if (score < 30) {
      update.status = 'under_review';
    }

    await docRef.update(update);
  },

  async updateOnFeedback(volunteerId: string, rating: number): Promise<void> {
    if (!volunteerId || typeof volunteerId !== 'string') {
      throw new Error('volunteerId is required and must be a non-empty string');
    }

    const docRef = db.collection('volunteers').doc(volunteerId);
    const snap = await docRef.get();
    if (!snap.exists) {
      throw new Error(`Volunteer ${volunteerId} not found`);
    }

    const volunteer = snap.data() as Volunteer;
    const history = volunteer.task_history;

    // Running average using total_completed as count
    const count = history.total_completed;
    const newAvgFeedback = count > 0
      ? (history.avg_feedback_rating * count + rating) / (count + 1)
      : rating;

    const updatedHistory: TaskHistory = {
      ...history,
      avg_feedback_rating: newAvgFeedback,
    };

    const score = computeScore(updatedHistory);

    await docRef.update({
      task_history: updatedHistory,
      reliability_score: score,
    });
  },
};
