import type { Need } from '../types';

interface NeedListProps {
  needs: Need[];
  onNeedClick: (need: Need) => void;
}

function urgencyBadgeClasses(score: number): string {
  if (score > 8) return 'bg-red-100 text-red-700';
  if (score >= 4) return 'bg-orange-100 text-orange-700';
  return 'bg-green-100 text-green-700';
}

function timeSince(createdAt: unknown): string {
  let ms: number;

  if (
    createdAt &&
    typeof createdAt === 'object' &&
    'seconds' in (createdAt as Record<string, unknown>)
  ) {
    ms = Date.now() - (createdAt as { seconds: number }).seconds * 1000;
  } else if (
    createdAt &&
    typeof createdAt === 'object' &&
    'toMillis' in (createdAt as Record<string, unknown>)
  ) {
    ms = Date.now() - (createdAt as { toMillis: () => number }).toMillis();
  } else {
    return '—';
  }

  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * NeedList renders a ranked table of Needs sorted by urgency_score descending
 * (already sorted from the useNeeds hook).
 */
export default function NeedList({ needs, onNeedClick }: NeedListProps) {
  if (needs.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-gray-200 bg-white p-8">
        <p className="text-sm text-gray-500">No open needs</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left font-medium text-gray-600">Type</th>
            <th className="px-4 py-2 text-left font-medium text-gray-600">Location</th>
            <th className="px-4 py-2 text-right font-medium text-gray-600">Severity</th>
            <th className="px-4 py-2 text-right font-medium text-gray-600">Affected</th>
            <th className="px-4 py-2 text-right font-medium text-gray-600">Urgency</th>
            <th className="px-4 py-2 text-right font-medium text-gray-600">Reported</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {needs.map((need) => (
            <tr
              key={need.id}
              onClick={() => onNeedClick(need)}
              className="cursor-pointer hover:bg-indigo-50 transition-colors"
            >
              <td className="whitespace-nowrap px-4 py-2 font-medium text-gray-900">
                {need.need_type}
              </td>
              <td className="px-4 py-2 text-gray-600 max-w-[200px] truncate">
                {need.location.description}
              </td>
              <td className="whitespace-nowrap px-4 py-2 text-right text-gray-700">
                {need.severity}
              </td>
              <td className="whitespace-nowrap px-4 py-2 text-right text-gray-700">
                {need.affected_count}
              </td>
              <td className="whitespace-nowrap px-4 py-2 text-right">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${urgencyBadgeClasses(need.urgency_score)}`}
                >
                  {need.urgency_score.toFixed(1)}
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-2 text-right text-gray-500">
                {timeSince(need.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
