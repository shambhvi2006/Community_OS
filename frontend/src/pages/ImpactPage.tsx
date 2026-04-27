import { useMemo, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { useAllNeeds } from '../hooks/useAllNeeds';
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

function formatDate(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export default function ImpactPage() {
  const [period, setPeriod] = useState<Period>('30d');
  const { data: needs, loading: needsLoading } = useAllNeeds();
  const { data: dispatches, loading: dispatchesLoading } = useDispatches();

  const days = periodToDays(period);
  const cutoff = Date.now() - days * 86_400_000;

  const metrics = useMemo(() => {
    const resolved = needs.filter(
      (n) => n.status === 'completed' || n.status === 'verified' || n.status === 'archived'
    );
    const recentDispatches = dispatches.filter((d) => tsToMs(d.created_at) >= cutoff);

    const reportToDispatchTimes: number[] = [];
    for (const d of recentDispatches) {
      const need = needs.find((n) => n.id === d.need_id);
      if (need && d.sent_at) {
        const diff = (tsToMs(d.sent_at) - tsToMs(need.created_at)) / 60_000;
        if (diff > 0) reportToDispatchTimes.push(diff);
      }
    }
    const avgReportToDispatch = reportToDispatchTimes.length > 0
      ? reportToDispatchTimes.reduce((a, b) => a + b, 0) / reportToDispatchTimes.length : 0;

    const dispatchToCompletionTimes: number[] = [];
    for (const d of recentDispatches) {
      if (d.completed_at && d.sent_at) {
        const diff = (tsToMs(d.completed_at) - tsToMs(d.sent_at)) / 60_000;
        if (diff > 0) dispatchToCompletionTimes.push(diff);
      }
    }
    const avgDispatchToCompletion = dispatchToCompletionTimes.length > 0
      ? dispatchToCompletionTimes.reduce((a, b) => a + b, 0) / dispatchToCompletionTimes.length : 0;

    const activeVolunteers = new Set(
      recentDispatches
        .filter((d) => d.status === 'accepted' || d.status === 'completed')
        .map((d) => d.volunteer_id)
    ).size;

    const skillScores = recentDispatches
      .map((d) => d.match_score_breakdown?.skill_match)
      .filter((s): s is number => typeof s === 'number');
    const avgSkillMatch = skillScores.length > 0
      ? (skillScores.reduce((a, b) => a + b, 0) / skillScores.length) * 100 : 0;

    return { totalResolved: resolved.length, avgReportToDispatch, avgDispatchToCompletion, activeVolunteers, avgSkillMatch };
  }, [needs, dispatches, cutoff]);

  // Build chart data: daily need volume
  const needVolumeData = useMemo(() => {
    const buckets: Record<string, { date: string; reported: number; resolved: number }> = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000);
      const key = formatDate(d);
      buckets[key] = { date: key, reported: 0, resolved: 0 };
    }
    for (const n of needs) {
      const ms = tsToMs(n.created_at);
      if (ms >= cutoff) {
        const key = formatDate(new Date(ms));
        if (buckets[key]) buckets[key].reported++;
      }
    }
    for (const n of needs) {
      if (n.status === 'completed' || n.status === 'verified') {
        const ms = tsToMs(n.updated_at);
        if (ms >= cutoff) {
          const key = formatDate(new Date(ms));
          if (buckets[key]) buckets[key].resolved++;
        }
      }
    }
    return Object.values(buckets);
  }, [needs, cutoff, days]);

  // Build chart data: volunteer engagement (dispatches per day)
  const engagementData = useMemo(() => {
    const buckets: Record<string, { date: string; dispatches: number; uniqueVolunteers: number }> = {};
    const volSets: Record<string, Set<string>> = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000);
      const key = formatDate(d);
      buckets[key] = { date: key, dispatches: 0, uniqueVolunteers: 0 };
      volSets[key] = new Set();
    }
    for (const d of dispatches) {
      const ms = tsToMs(d.created_at);
      if (ms >= cutoff) {
        const key = formatDate(new Date(ms));
        if (buckets[key]) {
          buckets[key].dispatches++;
          volSets[key].add(d.volunteer_id);
        }
      }
    }
    for (const key of Object.keys(buckets)) {
      buckets[key].uniqueVolunteers = volSets[key].size;
    }
    return Object.values(buckets);
  }, [dispatches, cutoff, days]);

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
              <button key={p} type="button" onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-sm font-medium border ${
                  period === p ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                } first:rounded-l-md last:rounded-r-md`}>{p}</button>
            ))}
          </div>
          <button type="button" onClick={exportCsv}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700">
            Export CSV
          </button>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard label="Needs Resolved" value={String(metrics.totalResolved)} />
        <MetricCard label="Avg Report→Dispatch" value={`${metrics.avgReportToDispatch.toFixed(1)} min`}
          warning={metrics.avgReportToDispatch > 30} />
        <MetricCard label="Avg Dispatch→Complete" value={`${metrics.avgDispatchToCompletion.toFixed(1)} min`} />
        <MetricCard label="Active Volunteers" value={String(metrics.activeVolunteers)} />
        <MetricCard label="Skill Match" value={`${metrics.avgSkillMatch.toFixed(1)}%`} />
      </div>

      {/* Need Volume Chart */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-gray-700 mb-4">Need Volume</h2>
        <p className="text-xs text-gray-400 mb-2">Daily reported vs resolved needs</p>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={needVolumeData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Bar dataKey="reported" name="Reported" fill="#6366F1" radius={[4,4,0,0]} />
            <Bar dataKey="resolved" name="Resolved" fill="#22C55E" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Volunteer Engagement Chart */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-gray-700 mb-4">Volunteer Engagement</h2>
        <p className="text-xs text-gray-400 mb-2">Daily dispatches and unique volunteers active</p>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={engagementData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="dispatches" name="Dispatches" stroke="#F97316" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="uniqueVolunteers" name="Unique Volunteers" stroke="#6366F1" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Need Types Breakdown */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-gray-700 mb-4">Needs by Type</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {Object.entries(
            needs.reduce<Record<string, number>>((acc, n) => {
              acc[n.need_type] = (acc[n.need_type] || 0) + 1;
              return acc;
            }, {})
          ).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
            <div key={type} className="rounded-lg border border-gray-200 p-3 text-center">
              <p className="text-xs text-gray-500 capitalize">{type.replace(/_/g, ' ')}</p>
              <p className="text-xl font-bold text-gray-800">{count}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, warning }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className={`rounded-lg bg-white p-4 shadow ${warning ? 'ring-2 ring-amber-400' : ''}`}>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-800">{value}</p>
      {warning && <p className="mt-1 text-xs font-medium text-amber-600">⚠ Exceeds 30 min threshold</p>}
    </div>
  );
}
