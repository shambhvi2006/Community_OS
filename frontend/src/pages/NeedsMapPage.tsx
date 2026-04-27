import { useState, useCallback } from 'react';
import { useNeeds } from '../hooks/useNeeds';
import MapView from '../components/MapView';
import NeedList from '../components/NeedList';
import NeedDetail from '../components/NeedDetail';
import DispatchPanel from '../components/DispatchPanel';
import type { Need, MatchScoreBreakdown } from '../types';

// Mock data for dispatch panel (matching engine is backend-only)
const MOCK_MATCHES: MatchScoreBreakdown[] = [
  {
    volunteer_id: 'vol_001',
    skill_match: 0.9,
    distance_km: 2.3,
    availability_score: 1.0,
    burnout_factor: 1.2,
    reliability_score: 88,
    match_score: 0.227,
  },
  {
    volunteer_id: 'vol_002',
    skill_match: 0.75,
    distance_km: 5.1,
    availability_score: 1.0,
    burnout_factor: 1.5,
    reliability_score: 72,
    match_score: 0.082,
  },
  {
    volunteer_id: 'vol_003',
    skill_match: 0.6,
    distance_km: 8.0,
    availability_score: 0.5,
    burnout_factor: 1.1,
    reliability_score: 95,
    match_score: 0.03,
  },
];

export default function NeedsMapPage() {
  const { data: needs, loading, error } = useNeeds();
  const [selectedNeed, setSelectedNeed] = useState<Need | null>(null);
  const [showDispatch, setShowDispatch] = useState(false);
  const [dispatchLoading, setDispatchLoading] = useState(false);

  const handleNeedClick = useCallback((need: Need) => {
    setSelectedNeed(need);
    setShowDispatch(false);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedNeed(null);
    setShowDispatch(false);
  }, []);

  const handleDispatch = useCallback((_needId: string) => {
    setDispatchLoading(true);
    setShowDispatch(true);
    // Simulate network delay for fetching matches
    setTimeout(() => setDispatchLoading(false), 800);
  }, []);

  const handleSelectVolunteer = useCallback((volunteerId: string) => {
    // Placeholder — will integrate with real dispatch service
    console.log('Dispatching volunteer:', volunteerId, 'for need:', selectedNeed?.id);
    alert(`Dispatched volunteer ${volunteerId}`);
    setShowDispatch(false);
  }, [selectedNeed]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-gray-500">Loading needs…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
        Failed to load needs: {error.message}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:gap-6 h-full">
      {/* Map — left on desktop, top on mobile */}
      <div className="lg:w-1/2 xl:w-3/5">
        <MapView needs={needs} onNeedClick={handleNeedClick} />
      </div>

      {/* List — right on desktop, bottom on mobile */}
      <div className="lg:w-1/2 xl:w-2/5">
        <NeedList needs={needs} onNeedClick={handleNeedClick} />
      </div>

      {/* NeedDetail slide-over */}
      {selectedNeed && !showDispatch && (
        <NeedDetail
          need={selectedNeed}
          onClose={handleCloseDetail}
          onDispatch={handleDispatch}
        />
      )}

      {/* DispatchPanel slide-over */}
      {showDispatch && (
        <DispatchPanel
          matches={MOCK_MATCHES}
          onSelectVolunteer={handleSelectVolunteer}
          onClose={() => setShowDispatch(false)}
          loading={dispatchLoading}
        />
      )}
    </div>
  );
}
