import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../config/firebase';

interface UserRecord {
  uid: string;
  name: string;
  email: string;
  role: string;
}

const ROLES = ['volunteer', 'coordinator', 'ngo_admin', 'super_admin'];

export default function AdminPage() {
  const { ngoId } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [overflowEnabled, setOverflowEnabled] = useState(false);
  const [partnerNgos, setPartnerNgos] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    if (!ngoId) return;
    (async () => {
      setLoading(true);
      const q = query(collection(db, 'users'), where('ngo_id', '==', ngoId));
      const snap = await getDocs(q);
      setUsers(
        snap.docs.map((d) => ({
          uid: d.id,
          name: d.data().name ?? '',
          email: d.data().email ?? '',
          role: d.data().role ?? 'volunteer',
        }))
      );

      // Load NGO settings
      const ngoSnap = await getDocs(
        query(collection(db, 'ngos'), where('__name__', '==', ngoId))
      );
      if (!ngoSnap.empty) {
        const ngoData = ngoSnap.docs[0].data();
        setOverflowEnabled(ngoData.settings?.overflow_enabled ?? false);
        setPartnerNgos((ngoData.settings?.overflow_partners ?? []).join(', '));
      }
      setLoading(false);
    })();
  }, [ngoId]);

  const changeRole = async (uid: string, newRole: string) => {
    const functions = getFunctions();
    const setCustomClaims = httpsCallable(functions, 'setCustomClaims');
    await setCustomClaims({ uid, role: newRole });
    setUsers((prev) => prev.map((u) => (u.uid === uid ? { ...u, role: newRole } : u)));
  };

  const saveSettings = async () => {
    if (!ngoId) return;
    setSavingSettings(true);
    await updateDoc(doc(db, 'ngos', ngoId), {
      'settings.overflow_enabled': overflowEnabled,
      'settings.overflow_partners': partnerNgos
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    });
    setSavingSettings(false);
  };

  if (loading) return <div className="p-6 text-gray-500">Loading admin panel…</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Admin Panel</h1>

      {/* User list */}
      <div className="rounded-lg bg-white shadow overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((u) => (
              <tr key={u.uid}>
                <td className="px-4 py-2 text-sm text-gray-800">{u.name}</td>
                <td className="px-4 py-2 text-sm text-gray-600">{u.email}</td>
                <td className="px-4 py-2 text-sm">
                  <select
                    value={u.role}
                    onChange={(e) => changeRole(u.uid, e.target.value)}
                    className="border rounded px-2 py-1 text-sm"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* NGO Settings */}
      <div className="rounded-lg bg-white p-6 shadow space-y-4">
        <h2 className="text-lg font-semibold text-gray-700">NGO Settings</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={overflowEnabled}
            onChange={(e) => setOverflowEnabled(e.target.checked)}
            className="rounded border-gray-300"
          />
          Enable cross-NGO overflow
        </label>
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1" htmlFor="partner-ngos">
            Partner NGO IDs (comma-separated)
          </label>
          <input
            id="partner-ngos"
            className="w-full border rounded px-3 py-1.5 text-sm"
            value={partnerNgos}
            onChange={(e) => setPartnerNgos(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={saveSettings}
          disabled={savingSettings}
          className="rounded bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {savingSettings ? 'Saving…' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
