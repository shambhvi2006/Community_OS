import { useAlerts } from '../hooks/useAlerts';

interface MockForecast {
  date: string;
  predicted_count: number;
  lower_bound: number;
  upper_bound: number;
}

const MOCK_FORECASTS: MockForecast[] = Array.from({ length: 7 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() + i + 1);
  const base = Math.floor(Math.random() * 20) + 5;
  return {
    date: d.toISOString().slice(0, 10),
    predicted_count: base,
    lower_bound: Math.max(0, base - 4),
    upper_bound: base + 6,
  };
});

export default function ForecastsPage() {
  const { data: alerts, loading } = useAlerts();

  const earlyWarnings = alerts.filter((a) => a.type === 'early_warning');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Forecasts</h1>

      {/* Early warnings */}
      {earlyWarnings.length > 0 && (
        <div className="space-y-2">
          {earlyWarnings.map((w) => (
            <div
              key={w.id}
              className={`rounded-lg p-3 text-sm ${
                w.severity === 'critical'
                  ? 'bg-red-50 text-red-800 border border-red-200'
                  : w.severity === 'warning'
                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                  : 'bg-blue-50 text-blue-800 border border-blue-200'
              }`}
            >
              ⚠ {w.message}
            </div>
          ))}
        </div>
      )}

      {/* 7-day forecast table */}
      <div className="rounded-lg bg-white shadow overflow-x-auto">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-700">7-Day Need Volume Forecast</h2>
          <p className="text-xs text-gray-400 mt-1">Mock data — Prophet integration pending</p>
        </div>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Predicted</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Range</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Confidence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {MOCK_FORECASTS.map((f) => {
              const confidence = f.upper_bound - f.lower_bound < 10 ? 'high' : 'reduced';
              return (
                <tr key={f.date}>
                  <td className="px-4 py-2 text-sm text-gray-800">{f.date}</td>
                  <td className="px-4 py-2 text-sm text-gray-800 font-medium">{f.predicted_count}</td>
                  <td className="px-4 py-2 text-sm text-gray-600">
                    {f.lower_bound}–{f.upper_bound}
                  </td>
                  <td className="px-4 py-2 text-sm">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        confidence === 'high'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {confidence}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {loading && <p className="text-sm text-gray-400">Loading alerts…</p>}
    </div>
  );
}
