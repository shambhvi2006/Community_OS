import LiveOperations from '../components/LiveOperations';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Operations Dashboard</h1>
      <LiveOperations />
    </div>
  );
}
