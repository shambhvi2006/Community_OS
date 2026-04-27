import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useNeeds } from '../hooks/useNeeds';
import { useCollection } from '../hooks/useCollection';
import type { Need, Volunteer } from '../types';

interface VolunteerMatch {
  id: string;
  name: string;
  skills: string[];
  distance_km: number;
  reliability_score: number;
  match_score: number;
}

type WorkflowStep =
  | 'idle'
  | 'need_detected'
  | 'scoring'
  | 'matching'
  | 'dispatching'
  | 'waiting_response'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'score_updated';

const STEP_LABELS: Record<WorkflowStep, string> = {
  idle: 'Monitoring',
  need_detected: 'Need Detected',
  scoring: 'Scoring Urgency',
  matching: 'Matching Volunteers',
  dispatching: 'Dispatching',
  waiting_response: 'Awaiting Response',
  accepted: 'Accepted',
  in_progress: 'In Progress',
  completed: 'Completed',
  score_updated: 'Score Updated',
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeMatchScore(vol: VolunteerMatch, needType: string): number {
  const skillMap: Record<string, string[]> = {
    food_shortage: ['food_distribution', 'driving', 'logistics'],
    medical_emergency: ['medical', 'first_aid', 'counseling'],
    shelter: ['logistics', 'driving'],
    water_supply: ['driving', 'logistics'],
    clothing: ['logistics', 'food_distribution'],
    rescue: ['first_aid', 'driving'],
    sanitation: ['logistics'],
  };
  const required = skillMap[needType] || ['logistics'];
  const matched = vol.skills.filter(s => required.includes(s)).length;
  const skillMatch = required.length > 0 ? matched / required.length : 0.3;
  const distScore = 1 / (vol.distance_km + 1);
  const reliabilityFactor = vol.reliability_score / 100;
  return parseFloat((skillMatch * distScore * reliabilityFactor).toFixed(3));
}

export default function LiveOperations() {
  const { ngoId } = useAuth();
  const { data: needs } = useNeeds();
  const { data: volunteers } = useCollection<Volunteer>('volunteers', ngoId, 'reliability_score', 'desc');
  const [step, setStep] = useState<WorkflowStep>('idle');
  const [matches, setMatches] = useState<VolunteerMatch[]>([]);
  const [selectedVol, setSelectedVol] = useState<VolunteerMatch | null>(null);
  const [log, setLog] = useState<{ time: string; msg: string; type: 'info' | 'success' | 'action' }[]>([]);

  // Track processed needs to prevent re-triggering
  const processedIds = useRef<Set<string>>(new Set());
  const isRunning = useRef(false);
  const initialLoad = useRef(true);
  const needsRef = useRef(needs);

  const topNeed = useMemo(() => {
    if (!needs.length) return null;
    return needs.reduce((a, b) => (a.urgency_score >= b.urgency_score ? a : b));
  }, [needs]);

  const addLog = useCallback((msg: string, type: 'info' | 'success' | 'action' = 'info') => {
    const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLog(prev => [{ time, msg, type }, ...prev].slice(0, 30));
  }, []);

  const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

  const runWorkflow = useCallback(async (targetNeed: Need) => {
    if (!ngoId || isRunning.current) return;
    isRunning.current = true;
    processedIds.current.add(targetNeed.id);

    setStep('need_detected');
    addLog(`New need: ${targetNeed.need_type.replace(/_/g, ' ')} at ${targetNeed.location.description}`, 'action');
    await delay(1500);

    setStep('scoring');
    addLog(`Computing urgency: severity=${targetNeed.severity}, affected=${targetNeed.affected_count}`, 'info');
    await delay(1200);
    const level = targetNeed.urgency_score > 8 ? 'CRITICAL' : targetNeed.urgency_score >= 4 ? 'HIGH' : 'MODERATE';
    addLog(`Urgency score: ${targetNeed.urgency_score.toFixed(1)} — ${level}`, 'info');
    await delay(800);

    setStep('matching');
    addLog('Searching available volunteers...', 'info');
    await delay(1000);

    const volMatches: VolunteerMatch[] = volunteers
      .filter(v => v.status === 'available')
      .map(v => ({
        id: v.id, name: v.name, skills: v.skills,
        distance_km: parseFloat(haversineKm(targetNeed.location.lat, targetNeed.location.lng, v.location.lat, v.location.lng).toFixed(1)),
        reliability_score: v.reliability_score, match_score: 0,
      }))
      .map(v => ({ ...v, match_score: computeMatchScore(v, targetNeed.need_type) }))
      .sort((a, b) => b.match_score - a.match_score)
      .slice(0, 3);

    if (volMatches.length === 0) {
      addLog('No available volunteers found.', 'action');
      setStep('idle');
      isRunning.current = false;
      return;
    }

    setMatches(volMatches);
    addLog(`${volMatches.length} volunteers matched. Best: ${volMatches[0].name} (${volMatches[0].match_score})`, 'success');
    await delay(2000);

    const best = volMatches[0];
    setSelectedVol(best);
    setStep('dispatching');
    addLog(`Dispatching ${best.name} — ${best.distance_km}km, reliability ${best.reliability_score}%`, 'action');
    await delay(1500);

    try {
      await addDoc(collection(db, 'dispatches'), {
        need_id: targetNeed.id, volunteer_id: best.id, ngo_id: ngoId,
        status: 'sent', match_score_breakdown: {
          volunteer_id: best.id, skill_match: best.match_score, distance_km: best.distance_km,
          availability_score: 1.0, burnout_factor: 1.0, reliability_score: best.reliability_score, match_score: best.match_score,
        }, sent_at: serverTimestamp(), escalation_count: 0, created_at: serverTimestamp(),
      });
    } catch { /* ignore */ }

    setStep('waiting_response');
    addLog(`Notified ${best.name}: "${targetNeed.need_type.replace(/_/g, ' ')} at ${targetNeed.location.description}"`, 'info');
    await delay(2500);

    setStep('accepted');
    addLog(`${best.name} accepted the task`, 'success');
    await delay(1000);

    try {
      await updateDoc(doc(db, 'needs', targetNeed.id), { status: 'assigned', assigned_volunteer_id: best.id, updated_at: serverTimestamp() });
    } catch { /* ignore */ }
    addLog(`Status: assigned to ${best.name}`, 'info');
    await delay(1500);

    setStep('in_progress');
    addLog(`${best.name} en route to ${targetNeed.location.description}`, 'info');
    await delay(2000);

    setStep('completed');
    addLog(`${best.name} completed the task`, 'success');
    await delay(1000);

    try {
      await updateDoc(doc(db, 'needs', targetNeed.id), { status: 'completed', updated_at: serverTimestamp() });
    } catch { /* ignore */ }

    setStep('score_updated');
    const newScore = Math.min(best.reliability_score + 2, 100);
    addLog(`Reliability: ${best.name} ${best.reliability_score}% → ${newScore}%`, 'success');

    try {
      await updateDoc(doc(db, 'volunteers', best.id), { reliability_score: newScore, updated_at: serverTimestamp() });
    } catch { /* ignore */ }

    await delay(2000);
    addLog('Workflow complete. Monitoring for next need.', 'info');
    await delay(1000);
    setStep('idle');
    isRunning.current = false;
  }, [ngoId, addLog, volunteers]);

  // On first load, mark all existing needs as processed
  useEffect(() => {
    needsRef.current = needs;
    if (initialLoad.current && needs.length > 0) {
      needs.forEach(n => processedIds.current.add(n.id));
      initialLoad.current = false;
    }
  }, [needs]);

  // Detect genuinely new needs (not seen before, not currently running)
  useEffect(() => {
    if (initialLoad.current || isRunning.current) return;

    const brandNew = needs.filter(n => !processedIds.current.has(n.id) && n.status === 'new');
    if (brandNew.length > 0) {
      const newest = brandNew[0];
      processedIds.current.add(newest.id);
      addLog('Incoming need detected — starting workflow', 'action');
      runWorkflow(newest);
    }
  }, [needs]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for chatbot events — when fired, wait briefly then grab the newest 'new' need
  useEffect(() => {
    const handler = () => {
      addLog('Chatbot submitted a new need — syncing...', 'action');
      // Poll for the new need to appear in Firestore snapshot
      let attempts = 0;
      const poll = setInterval(() => {
        attempts++;
        if (isRunning.current || attempts > 20) { clearInterval(poll); return; }
        const current = needsRef.current;
        const brandNew = current.filter(n => !processedIds.current.has(n.id) && n.status === 'new');
        if (brandNew.length > 0) {
          clearInterval(poll);
          const newest = brandNew[0];
          processedIds.current.add(newest.id);
          addLog('Need synced — starting workflow', 'action');
          runWorkflow(newest);
        }
      }, 500);
    };
    window.addEventListener('communityos:need-created', handler as EventListener);
    return () => window.removeEventListener('communityos:need-created', handler as EventListener);
  }, [addLog, runWorkflow]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-800">Live Operations</h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="space-y-4">
          <div className="rounded-lg bg-white p-4 shadow border-l-4 border-red-500">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Highest Priority</h3>
            {topNeed ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${topNeed.urgency_score > 8 ? 'bg-red-500' : topNeed.urgency_score >= 4 ? 'bg-orange-500' : 'bg-green-500'}`} />
                  <span className="font-semibold text-gray-800 capitalize">{topNeed.need_type.replace(/_/g, ' ')}</span>
                </div>
                <p className="text-sm text-gray-600">{topNeed.location.description}</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-gray-50 rounded p-2"><span className="text-gray-500">Urgency</span><p className="font-bold text-gray-800">{topNeed.urgency_score.toFixed(1)}</p></div>
                  <div className="bg-gray-50 rounded p-2"><span className="text-gray-500">Severity</span><p className="font-bold text-gray-800">{topNeed.severity}/10</p></div>
                  <div className="bg-gray-50 rounded p-2"><span className="text-gray-500">Affected</span><p className="font-bold text-gray-800">{topNeed.affected_count}</p></div>
                  <div className="bg-gray-50 rounded p-2"><span className="text-gray-500">Status</span><p className="font-bold text-gray-800 capitalize">{topNeed.status}</p></div>
                </div>
                {topNeed.vulnerability_flags?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {topNeed.vulnerability_flags.map(f => (
                      <span key={f} className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-700 border border-red-200">{f}</span>
                    ))}
                  </div>
                )}
              </div>
            ) : <p className="text-sm text-gray-400">No open needs</p>}
          </div>
          {matches.length > 0 && (
            <div className="rounded-lg bg-white p-4 shadow">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Top Volunteers</h3>
              <div className="space-y-2">
                {matches.map((vol, i) => (
                  <div key={vol.id} className={`rounded-lg border p-3 text-sm ${selectedVol?.id === vol.id ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white ${i === 0 ? 'bg-indigo-600' : 'bg-gray-400'}`}>{i + 1}</span>
                        <span className="font-medium text-gray-800">{vol.name}</span>
                      </div>
                      <span className="font-mono text-xs text-gray-600">{vol.match_score.toFixed(3)}</span>
                    </div>
                    <div className="mt-1 flex gap-3 text-xs text-gray-500">
                      <span>{vol.distance_km}km</span>
                      <span>{vol.reliability_score}% reliable</span>
                    </div>
                    {selectedVol?.id === vol.id && <p className="mt-1 text-xs font-medium text-indigo-600">Selected for dispatch</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-lg bg-white p-4 shadow">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Workflow Pipeline</h3>
            <div className="flex flex-wrap gap-1">
              {(Object.keys(STEP_LABELS) as WorkflowStep[]).filter(s => s !== 'idle').map((s) => {
                const stepKeys = (Object.keys(STEP_LABELS) as WorkflowStep[]).filter(k => k !== 'idle');
                const currentIdx = stepKeys.indexOf(step);
                const thisIdx = stepKeys.indexOf(s);
                const isDone = step !== 'idle' && thisIdx < currentIdx;
                const isCurrent = s === step;
                return (
                  <div key={s} className={`rounded px-2.5 py-1.5 text-xs font-medium transition-all ${
                    isCurrent ? 'bg-indigo-600 text-white shadow-sm' : isDone ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-50 text-gray-400 border border-gray-100'
                  }`}>{STEP_LABELS[s]}</div>
                );
              })}
            </div>
            {step === 'idle' && <p className="mt-3 text-xs text-gray-400">Submit a need via the chatbot to trigger the workflow.</p>}
          </div>
          <div className="rounded-lg bg-gray-900 p-4 shadow">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 font-mono">Operations Log</h3>
            <div className="space-y-1 max-h-72 overflow-y-auto font-mono text-xs">
              {log.length === 0 ? <p className="text-gray-600">Waiting for incoming needs...</p> : log.map((entry, i) => (
                <div key={i} className={`flex gap-2 ${entry.type === 'success' ? 'text-green-400' : entry.type === 'action' ? 'text-yellow-300' : 'text-gray-400'}`}>
                  <span className="text-gray-600 shrink-0">[{entry.time}]</span><span>{entry.msg}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
