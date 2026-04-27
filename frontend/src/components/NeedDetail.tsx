import { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Need, AuditEntry } from '../types';

interface NeedDetailProps {
  need: Need;
  onClose: () => void;
  onDispatch: (needId: string) => void;
}

function formatTimestamp(ts: unknown): string {
  if (!ts) return '—';
  if (ts && typeof ts === 'object' && 'seconds' in (ts as Record<string, unknown>)) {
    return new Date((ts as { seconds: number }).seconds * 1000).toLocaleString();
  }
  if (ts && typeof ts === 'object' && 'toMillis' in (ts as Record<string, unknown>)) {
    return new Date((ts as { toMillis: () => number }).toMillis()).toLocaleString();
  }
  if (typeof ts === 'string') return new Date(ts).toLocaleString();
  return '—';
}

function statusColor(status: Need['status']): string {
  const map: Record<Need['status'], string> = {
    new: 'bg-blue-100 text-blue-700',
    triaged: 'bg-yellow-100 text-yellow-700',
    assigned: 'bg-purple-100 text-purple-700',
    in_progress: 'bg-indigo-100 text-indigo-700',
    completed: 'bg-green-100 text-green-700',
    verified: 'bg-emerald-100 text-emerald-700',
    archived: 'bg-gray-100 text-gray-600',
  };
  return map[status] ?? 'bg-gray-100 text-gray-600';
}

export default function NeedDetail({ need, onClose, onDispatch }: NeedDetailProps) {
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'needs', need.id, 'audit_entries'),
      orderBy('timestamp', 'asc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setAuditEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() } as AuditEntry)));
      setAuditLoading(false);
    });
    return unsub;
  }, [need.id]);

  const canDispatch = need.status === 'new' || need.status === 'triaged';
  const b = need.urgency_breakdown;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />

      {/* Panel */}
      <div className="relative ml-auto w-full max-w-lg bg-white shadow-xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between bg-white border-b px-4 py-3">
          <h2 className="text-lg font-semibold text-gray-900 truncate">{need.need_type}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:text-gray-600"
            aria-label="Close panel"
          >
            ✕
          </button>
        </div>

        <div className="space-y-6 p-4">
          {/* Status + Actions */}
          <div className="flex items-center gap-3">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColor(need.status)}`}>
              {need.status}
            </span>
            {canDispatch && (
              <button
                type="button"
                onClick={() => onDispatch(need.id)}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Dispatch
              </button>
            )}
          </div>

          {/* Core fields */}
          <section>
            <h3 className="text-sm font-medium text-gray-500 mb-2">Details</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-gray-500">Type</dt>
              <dd className="text-gray-900">{need.need_type}</dd>
              <dt className="text-gray-500">Location</dt>
              <dd className="text-gray-900">{need.location.description}</dd>
              <dt className="text-gray-500">Severity</dt>
              <dd className="text-gray-900">{need.severity}</dd>
              <dt className="text-gray-500">Affected</dt>
              <dd className="text-gray-900">{need.affected_count}</dd>
              <dt className="text-gray-500">Vulnerability</dt>
              <dd className="text-gray-900">
                {need.vulnerability_flags.length > 0 ? need.vulnerability_flags.join(', ') : 'None'}
              </dd>
              <dt className="text-gray-500">Source</dt>
              <dd className="text-gray-900">{need.source}</dd>
              <dt className="text-gray-500">Language</dt>
              <dd className="text-gray-900">{need.language}</dd>
              {need.assigned_volunteer_id && (
                <>
                  <dt className="text-gray-500">Volunteer</dt>
                  <dd className="text-gray-900 font-mono text-xs">{need.assigned_volunteer_id}</dd>
                </>
              )}
            </dl>
          </section>

          {/* Raw input */}
          {need.raw_input && (
            <section>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Raw Input</h3>
              <p className="rounded bg-gray-50 p-2 text-sm text-gray-700 whitespace-pre-wrap">{need.raw_input}</p>
            </section>
          )}

          {/* Urgency breakdown */}
          {b && (
            <section>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Urgency Breakdown</h3>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm space-y-1">
                <p className="font-mono text-xs text-gray-600">
                  ({b.severity} × {b.affected_count} × {b.vulnerability_multiplier.toFixed(2)}) / {b.hours_since_reported.toFixed(2)}h = <span className="font-semibold text-gray-900">{b.urgency_score.toFixed(2)}</span>
                </p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs">
                  <dt className="text-gray-500">Severity</dt>
                  <dd>{b.severity}</dd>
                  <dt className="text-gray-500">Affected Count</dt>
                  <dd>{b.affected_count}</dd>
                  <dt className="text-gray-500">Vulnerability Multiplier</dt>
                  <dd>{b.vulnerability_multiplier.toFixed(2)}</dd>
                  <dt className="text-gray-500">Hours Since Reported</dt>
                  <dd>{b.hours_since_reported.toFixed(2)}</dd>
                  <dt className="text-gray-500">Computed At</dt>
                  <dd>{b.computed_at ? new Date(b.computed_at).toLocaleString() : '—'}</dd>
                </dl>
              </div>
            </section>
          )}

          {/* Audit trail */}
          <section>
            <h3 className="text-sm font-medium text-gray-500 mb-2">Audit Trail</h3>
            {auditLoading ? (
              <p className="text-xs text-gray-400">Loading audit trail…</p>
            ) : auditEntries.length === 0 ? (
              <p className="text-xs text-gray-400">No audit entries yet.</p>
            ) : (
              <ol className="relative border-l border-gray-200 ml-2 space-y-4">
                {auditEntries.map((entry) => (
                  <li key={entry.id} className="ml-4">
                    <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-white bg-indigo-400" />
                    <time className="text-xs text-gray-400">{formatTimestamp(entry.timestamp)}</time>
                    <p className="text-sm text-gray-800">
                      <span className="font-medium">{entry.action_type}</span>
                      <span className="text-gray-500"> by </span>
                      <span className="font-mono text-xs">{entry.actor_id}</span>
                      <span className="ml-1 text-xs text-gray-400">({entry.actor_role})</span>
                    </p>
                    {(entry.previous_value !== undefined || entry.new_value !== undefined) && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {entry.previous_value !== undefined && (
                          <span>from: <span className="font-mono">{JSON.stringify(entry.previous_value)}</span></span>
                        )}
                        {entry.previous_value !== undefined && entry.new_value !== undefined && ' → '}
                        {entry.new_value !== undefined && (
                          <span>to: <span className="font-mono">{JSON.stringify(entry.new_value)}</span></span>
                        )}
                      </p>
                    )}
                    <span className="text-xs text-gray-400">via {entry.source}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
