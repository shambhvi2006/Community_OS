import { useState } from 'react';

interface OverflowRequest {
  id: string;
  need_type: string;
  general_area: string;
  severity: number;
  direction: 'incoming' | 'outgoing';
  status: 'pending' | 'accepted' | 'declined' | 'resolved';
  source_ngo: string;
}

const MOCK_REQUESTS: OverflowRequest[] = [
  {
    id: '1',
    need_type: 'food_shortage',
    general_area: 'North District',
    severity: 8,
    direction: 'incoming',
    status: 'pending',
    source_ngo: 'ngo-alpha',
  },
  {
    id: '2',
    need_type: 'medical_emergency',
    general_area: 'East Zone',
    severity: 9,
    direction: 'outgoing',
    status: 'pending',
    source_ngo: 'ngo-beta',
  },
  {
    id: '3',
    need_type: 'shelter',
    general_area: 'South Area',
    severity: 6,
    direction: 'incoming',
    status: 'accepted',
    source_ngo: 'ngo-gamma',
  },
];

export default function OverflowPage() {
  const [requests, setRequests] = useState(MOCK_REQUESTS);

  const updateStatus = (id: string, status: OverflowRequest['status']) => {
    setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  };

  const incoming = requests.filter((r) => r.direction === 'incoming');
  const outgoing = requests.filter((r) => r.direction === 'outgoing');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Overflow Requests</h1>

      <Section title="Incoming Requests" items={incoming} onAction={updateStatus} showActions />
      <Section title="Outgoing Requests" items={outgoing} onAction={updateStatus} showActions={false} />
    </div>
  );
}

function Section({
  title,
  items,
  onAction,
  showActions,
}: {
  title: string;
  items: OverflowRequest[];
  onAction: (id: string, status: OverflowRequest['status']) => void;
  showActions: boolean;
}) {
  return (
    <div className="rounded-lg bg-white shadow">
      <div className="px-4 py-3 border-b">
        <h2 className="text-lg font-semibold text-gray-700">{title}</h2>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-gray-400 text-center">No requests</p>
      ) : (
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Need Type</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Area</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Severity</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">NGO</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              {showActions && (
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2 text-sm text-gray-800">{r.need_type}</td>
                <td className="px-4 py-2 text-sm text-gray-600">{r.general_area}</td>
                <td className="px-4 py-2 text-sm text-gray-800">{r.severity}</td>
                <td className="px-4 py-2 text-sm text-gray-600">{r.source_ngo}</td>
                <td className="px-4 py-2 text-sm">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      r.status === 'accepted'
                        ? 'bg-green-100 text-green-700'
                        : r.status === 'declined'
                        ? 'bg-red-100 text-red-700'
                        : r.status === 'resolved'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
                {showActions && (
                  <td className="px-4 py-2 text-sm space-x-2">
                    {r.status === 'pending' && (
                      <>
                        <button
                          type="button"
                          onClick={() => onAction(r.id, 'accepted')}
                          className="text-green-600 hover:underline text-xs"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          onClick={() => onAction(r.id, 'declined')}
                          className="text-red-600 hover:underline text-xs"
                        >
                          Decline
                        </button>
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
