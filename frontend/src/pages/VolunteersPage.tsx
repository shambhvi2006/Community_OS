import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCollection } from '../hooks/useCollection';
import { useDispatches } from '../hooks/useDispatches';
import type { Volunteer, Dispatch } from '../types';

interface VolunteerWithStats extends Volunteer {
  completedTasks: number;
  activeTasks: number;
  declinedTasks: number;
}

export default function VolunteersPage() {
  const { ngoId } = useAuth();
  const { data: volunteers, loading: volLoading } = useCollection<Volunteer>(
    'volunteers', ngoId, 'reliability_score', 'desc'
  );
  const { data: dispatches, loading: dispLoading } = useDispatches();

  const volunteersWithStats = useMemo(() => {
    return volunteers.map((vol): VolunteerWithStats => {
      const volDispatches = dispatches.filter(d => d.volunteer_id === vol.id);
      return {
        ...vol,
        completedTasks: volDispatches.filter(d => d.status === 'completed').length,
        activeTasks: volDispatches.filter(d => d.status === 'accepted' || d.status === 'sent').length,
        declinedTasks: volDispatches.filter(d => d.status === 'declined').length,
      };
    });
  }, [volunteers, dispatches]);

  const loading = volLoading || dispLoading;

  if (loading) {
    return <div className="p-6 text-gray-500">Loading volunteers…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Volunteers</h1>
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-green-500" /> Available
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-yellow-500" /> Busy
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-red-500" /> Under Review
          </span>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="rounded-lg bg-white p-4 shadow">
          <p className="text-sm text-gray-500">Total Volunteers</p>
          <p className="text-2xl font-bold text-gray-800">{volunteers.length}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <p className="text-sm text-gray-500">Available Now</p>
          <p className="text-2xl font-bold text-green-600">
            {volunteers.filter(v => v.status === 'available').length}
          </p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <p className="text-sm text-gray-500">Avg Reliability</p>
          <p className="text-2xl font-bold text-indigo-600">
            {volunteers.length > 0
              ? (volunteers.reduce((s, v) => s + v.reliability_score, 0) / volunteers.length).toFixed(0)
              : 0}%
          </p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <p className="text-sm text-gray-500">Total Tasks Done</p>
          <p className="text-2xl font-bold text-gray-800">
            {dispatches.filter(d => d.status === 'completed').length}
          </p>
        </div>
      </div>

      {/* Volunteer cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {volunteersWithStats.map((vol) => (
          <div key={vol.id} className="rounded-lg bg-white p-5 shadow hover:shadow-md transition">
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 font-bold text-sm">
                  {vol.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">{vol.name}</h3>
                  <p className="text-xs text-gray-500">{vol.location.description}</p>
                </div>
              </div>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                vol.status === 'available' ? 'bg-green-100 text-green-700' :
                vol.status === 'busy' ? 'bg-yellow-100 text-yellow-700' :
                'bg-red-100 text-red-700'
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${
                  vol.status === 'available' ? 'bg-green-500' :
                  vol.status === 'busy' ? 'bg-yellow-500' : 'bg-red-500'
                }`} />
                {vol.status}
              </span>
            </div>

            {/* Reliability bar */}
            <div className="mb-3">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-gray-500">Reliability Score</span>
                <span className={`font-bold ${
                  vol.reliability_score >= 80 ? 'text-green-600' :
                  vol.reliability_score >= 50 ? 'text-yellow-600' : 'text-red-600'
                }`}>{vol.reliability_score}%</span>
              </div>
              <div className="h-2 rounded-full bg-gray-200">
                <div className={`h-2 rounded-full transition-all ${
                  vol.reliability_score >= 80 ? 'bg-green-500' :
                  vol.reliability_score >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                }`} style={{ width: `${vol.reliability_score}%` }} />
              </div>
            </div>

            {/* Skills */}
            <div className="flex flex-wrap gap-1 mb-3">
              {vol.skills.map(skill => (
                <span key={skill} className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-600">
                  {skill.replace(/_/g, ' ')}
                </span>
              ))}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 text-center border-t border-gray-100 pt-3">
              <div>
                <p className="text-lg font-bold text-green-600">{vol.completedTasks}</p>
                <p className="text-xs text-gray-500">Completed</p>
              </div>
              <div>
                <p className="text-lg font-bold text-blue-600">{vol.activeTasks}</p>
                <p className="text-xs text-gray-500">Active</p>
              </div>
              <div>
                <p className="text-lg font-bold text-red-600">{vol.declinedTasks}</p>
                <p className="text-xs text-gray-500">Declined</p>
              </div>
            </div>

            {/* Burnout indicator */}
            {vol.burnout_factor > 2.0 && (
              <div className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">
                ⚠ High burnout factor ({vol.burnout_factor.toFixed(1)}) — consider reducing assignments
              </div>
            )}
          </div>
        ))}
      </div>

      {volunteers.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          No volunteers registered yet
        </div>
      )}
    </div>
  );
}
