import { useMemo, useState } from 'react';
import { useNeeds } from '../hooks/useNeeds';
import { useDispatches } from '../hooks/useDispatches';

type Period = '7d' | '30d' | '90d';

function periodToDays(p: Period): number {
  return p === '7d' ? 7 : p === '30d' ? 30 : 90;
}

function tsToMs(ts: unknown): number {
  if (ts && typeof ts === 'object' && 'seconds' in ts) {
    return (ts as { seconds: number }).seconds * 1000;
  }
  return 0;
}

export default function ImpactPage() {
  const [period, setPeriod] = useState<Period>('30d');
  const { data: needs, loading: needsLoading } = useNeeds();
  const { data: dispatches, loading: dispatchesLoading } = useDispatches();

  const cutoff = Date.now() - periodToDays(period) * 86_400_000;

  const metrics = useMemo(() => {
    const resolved = needs.filter(
      (n) => n.status === 'completed' || n.status === 'verified' || n.status === 'archived'
    );

    const recentDispatches = dispatches.filter((d) => tsToMs(d.created_at) >= cutoff);

    // avg report-to-dispatch time (minutes)
    const reportToDispatchTimes: number[] = [];
    for (const d of recentDispatches) {
      const need = needs.find((n) => n.id === d.need_id);
      if (need && d.sent_at) {
        const diff = (tsToMs(d.sent_at) - tsToMs(need.created_at)) / 60_000;
        if (diff > 0) reportToDispatchTimes.push(diff);
      }
    }
    const avgReportToDispatch =
      reportToDispatchTimes.length > 0
        ? reportToDispatchTimes.reduce((a, b) => a + b, 0) / reportToDispatchTimes.length
        : 0;

    // avg dispatch-to-completion time (minutes)
    const dispatchToCompletionTimes: number[] = [];
    for (const d of recentDispatches) {
      if (d.completed_at && d.sent_at) {
        const diff = (tsToMs(d.completed_at) - tsToMs(d.sent_at)) / 60_000;
        if (diff > 0) dispatchToCompletionTimes.push(diff);
      }
    }
    const avgDispatchToCompletion =
      dispatchToCompletionTimes.length > 0
        ? dispatchToCompletionTimes.reduce((a, b) => a + b, 0) / dispatchToCompletionTimes.length
        : 0;

    // active volunteers (unique from recent dispatches with accepted/completed)
    const activeVolunteers = new Set(
      recentDispatches
        .filter((d) => d.status === 'accepted' || d.status === 'completed')
        .map((d) => d.volunteer_id)
    ).size;

    // skill match % (avg from recent dispatches)
    const skillScores = recentDispatches
      .map((d) => d.match_score_breakdown?.skill_match)
      .filter((s): s is number => typeof s === 'number');
    const avgSkillMatch =
      skillScores.length > 0
        ? (skillScores.reduce((a, b) => a + b, 0) / skillScores.length) * 100
        : 0;

    return {
      totalResolved: resolved.length,
      avgReportToDispatch,
      avgDispatchToCompletion,
      activeVolunteers,
      avgSkillMatch,
    };
  }, [needs, dispatches, cutoff]);

  const loading = needsLoading || dispatchesLoading;

  const exportCsv = () => {
    const rows = [
      ['Metric', 'Value'],
      ['Total Needs Resolved', String(metrics.totalResolved)],
      ['Avg Report-to-Dispatch (min)', metrics.avgReportToDispatch.toFixed(1)],
      ['Avg Dispatch-to-Completion (min)', metrics.avgDispatchToCompletion.toFixed(1)],
      ['Active Volunteers', String(metrics.activeVolunteers)],
      ['Skill Match %', metrics.avgSkillMatch.toFixed(1)],
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `impact-metrics-${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="p-6 text-gray-500">Loading metrics…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Impact Dashboard</h1>
        <div className="flex items-center gap-3">
          <div className="flex rounded-md shadow-sm" role="group" aria-label="Period selector">
            {(['7d', '30d', '90d'] as Period[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-sm font-medium border ${
                  period === p
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                } first:rounded-l-md last:rounded-r-md`}
              >
                {p}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={exportCsv}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard label="Needs Resolved" value={String(metrics.totalResolved)} />
        <MetricCard
          label="Avg Report→Dispatch"
          value={`${metrics.avgReportToDispatch.toFixed(1)} min`}
          warning={metrics.avgReportToDispatch > 30}
        />
        <MetricCard
          label="Avg Dispatch→Complete"
          value={`${metrics.avgDispatchToCompletion.toFixed(1)} min`}
        />
        <MetricCard label="Active Volunteers" value={String(metrics.activeVolunteers)} />
        <MetricCard label="Skill Match" value={`${metrics.avgSkillMatch.toFixed(1)}%`} />
      </div>

      {/* Placeholder for Recharts trend charts */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-gray-700 mb-4">Trend Charts</h2>
        <p className="text-sm text-gray-400">
          Recharts trend charts for need volume, resolution time, and volunteer engagement will render here.
        </p>
        <div className="mt-4 h-64 flex items-center justify-center border-2 border-dashed border-gray-200 rounded-lg text-gray-300">
          Chart placeholder
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  warning,
}: {
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div
      className={`rounded-lg bg-white p-4 shadow ${
        warning ? 'ring-2 ring-amber-400' : ''
      }`}
    >
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-800">{value}</p>
      {warning && (
        <p className="mt-1 text-xs font-medium text-amber-600">⚠ Exceeds 30 min threshold</p>
      )}
    </div>
  );
}
