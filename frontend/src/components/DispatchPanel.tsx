import type { MatchScoreBreakdown } from '../types';

interface DispatchPanelProps {
  matches: MatchScoreBreakdown[];
  onSelectVolunteer: (volunteerId: string) => void;
  onClose: () => void;
  loading?: boolean;
}

function scoreBar(value: number, max: number = 1): string {
  const pct = Math.min((value / max) * 100, 100);
  if (pct >= 70) return 'bg-green-500';
  if (pct >= 40) return 'bg-yellow-500';
  return 'bg-red-500';
}

export default function DispatchPanel({ matches, onSelectVolunteer, onClose, loading }: DispatchPanelProps) {
  return (
    <div className="fixed inset-y-0 right-0 z-50 flex">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />

      {/* Panel */}
      <div className="relative ml-auto w-full max-w-md bg-white shadow-xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between bg-white border-b px-4 py-3">
          <h2 className="text-lg font-semibold text-gray-900">Volunteer Matches</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:text-gray-600"
            aria-label="Close dispatch panel"
          >
            ✕
          </button>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
              <p className="text-sm text-gray-500">Finding best matches…</p>
            </div>
          ) : matches.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No matching volunteers found.</p>
          ) : (
            <ul className="space-y-4">
              {matches.map((m, idx) => (
                <li key={m.volunteer_id} className="rounded-lg border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="text-xs text-gray-400">#{idx + 1}</span>
                      <p className="font-mono text-sm text-gray-900">{m.volunteer_id}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelectVolunteer(m.volunteer_id)}
                      className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
                    >
                      Dispatch
                    </button>
                  </div>

                  {/* Overall score */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                      <span>Match Score</span>
                      <span className="font-semibold text-gray-900">{m.match_score.toFixed(3)}</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-gray-100">
                      <div
                        className={`h-2 rounded-full ${scoreBar(m.match_score)}`}
                        style={{ width: `${Math.min(m.match_score * 100, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Breakdown */}
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <dt className="text-gray-500">Skill Match</dt>
                    <dd className="text-gray-800">{(m.skill_match * 100).toFixed(0)}%</dd>
                    <dt className="text-gray-500">Distance</dt>
                    <dd className="text-gray-800">{m.distance_km.toFixed(1)} km</dd>
                    <dt className="text-gray-500">Availability</dt>
                    <dd className="text-gray-800">{m.availability_score.toFixed(1)}</dd>
                    <dt className="text-gray-500">Burnout Factor</dt>
                    <dd className="text-gray-800">{m.burnout_factor.toFixed(1)}</dd>
                    <dt className="text-gray-500">Reliability</dt>
                    <dd className="text-gray-800">{m.reliability_score.toFixed(0)}</dd>
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
