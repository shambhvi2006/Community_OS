import { useState, useMemo } from 'react';
import { useInventory } from '../hooks/useInventory';
import { useAuth } from '../contexts/AuthContext';
import { doc, setDoc, deleteDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { InventoryItem } from '../types';

const LOW_STOCK_THRESHOLD = 10;

interface FormData {
  resource_type: string;
  quantity: string;
  location_desc: string;
  location_lat: string;
  location_lng: string;
  status: InventoryItem['status'];
}

const emptyForm: FormData = {
  resource_type: '', quantity: '', location_desc: '', location_lat: '', location_lng: '', status: 'available',
};

function getStatusColor(status: string) {
  if (status === 'available') return 'bg-green-100 text-green-700 border-green-200';
  if (status === 'depleted') return 'bg-red-100 text-red-700 border-red-200';
  return 'bg-gray-100 text-gray-600 border-gray-200';
}

function getTypeIcon(type: string) {
  const icons: Record<string, string> = {
    food_kits: '🍱', medical_supplies: '💊', blankets: '🛏', water_bottles: '💧',
    tents: '⛺', clothing_packs: '👕', first_aid_kits: '🩹', hygiene_kits: '🧴',
  };
  return icons[type] || '📦';
}

export default function InventoryPage() {
  const { data, loading } = useInventory();
  const { ngoId } = useAuth();
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [imageProcessing, setImageProcessing] = useState(false);
  const [view, setView] = useState<'grid' | 'table'>('grid');

  // Group by location
  const byLocation = useMemo(() => {
    const map: Record<string, { description: string; lat: number; lng: number; items: (InventoryItem & { id: string })[] }> = {};
    for (const item of data) {
      const key = item.location?.description || 'Unknown';
      if (!map[key]) map[key] = { description: key, lat: item.location?.lat || 0, lng: item.location?.lng || 0, items: [] };
      map[key].items.push(item);
    }
    return Object.values(map);
  }, [data]);

  // Summary stats
  const stats = useMemo(() => {
    const totalItems = data.reduce((s, i) => s + i.quantity, 0);
    const lowStock = data.filter(i => i.quantity < LOW_STOCK_THRESHOLD && i.status === 'available').length;
    const locations = new Set(data.map(i => i.location?.description)).size;
    const types = new Set(data.map(i => i.resource_type)).size;
    return { totalItems, lowStock, locations, types };
  }, [data]);

  const openAdd = () => { setEditing(null); setForm(emptyForm); setShowForm(true); };

  const openEdit = (item: InventoryItem) => {
    setEditing(item.id);
    setForm({
      resource_type: item.resource_type, quantity: String(item.quantity),
      location_desc: item.location?.description ?? '', location_lat: String(item.location?.lat || 0),
      location_lng: String(item.location?.lng || 0), status: item.status,
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!ngoId) return;
    const ref = editing ? doc(db, 'inventory', editing) : doc(collection(db, 'inventory'));
    await setDoc(ref, {
      resource_type: form.resource_type, quantity: Number(form.quantity) || 0,
      location: { lat: Number(form.location_lat) || 0, lng: Number(form.location_lng) || 0, description: form.location_desc },
      ngo_id: ngoId, status: form.status,
      updated_at: serverTimestamp(), ...(!editing ? { created_at: serverTimestamp() } : {}),
    }, { merge: true });
    setShowForm(false);
  };

  const remove = async (id: string) => { await deleteDoc(doc(db, 'inventory', id)); };

  // Image upload handler — uses Gemini Vision to extract inventory from handwritten lists
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !ngoId) return;

    setImageProcessing(true);
    try {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(file);
      });

      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: `You are an inventory extraction system. Analyze this handwritten inventory list image and extract all items with their quantities.

Return ONLY valid JSON array:
[{"resource_type": "item_name_in_snake_case", "quantity": number, "location_description": "location if mentioned or empty string"}]

Common resource types: food_kits, medical_supplies, blankets, water_bottles, tents, clothing_packs, first_aid_kits, hygiene_kits, rice_bags, dal_packets, cooking_oil, medicines, bandages, masks, sanitizer, torches, batteries, rope, tarpaulin

If the handwriting is unclear for a field, make your best guess. Always return valid JSON.` },
                { inlineData: { mimeType: file.type, data: base64 } }
              ]
            }]
          }),
        }
      );

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('Could not extract inventory from image');

      const items = JSON.parse(jsonMatch[0]);
      let count = 0;
      for (const item of items) {
        if (item.resource_type && item.quantity) {
          await addDoc(collection(db, 'inventory'), {
            resource_type: item.resource_type,
            quantity: Number(item.quantity) || 0,
            location: { lat: 0, lng: 0, description: item.location_description || 'Uploaded via image' },
            ngo_id: ngoId, status: 'available',
            created_at: serverTimestamp(), updated_at: serverTimestamp(),
          });
          count++;
        }
      }
      alert(`Extracted and added ${count} items from the image.`);
    } catch (err: any) {
      alert(`Failed to process image: ${err.message}`);
    }
    setImageProcessing(false);
    e.target.value = '';
  };

  if (loading) return <div className="p-6 text-gray-500">Loading inventory...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-800">Inventory</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md shadow-sm">
            <button onClick={() => setView('grid')} className={`px-3 py-1.5 text-xs font-medium border first:rounded-l-md last:rounded-r-md ${view === 'grid' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-300'}`}>Grid</button>
            <button onClick={() => setView('table')} className={`px-3 py-1.5 text-xs font-medium border first:rounded-l-md last:rounded-r-md ${view === 'table' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-300'}`}>Table</button>
          </div>
          <label className={`rounded-md px-3 py-1.5 text-sm font-medium text-white cursor-pointer ${imageProcessing ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}>
            {imageProcessing ? 'Processing...' : 'Upload Image'}
            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={imageProcessing} />
          </label>
          <button onClick={openAdd} className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">+ Add Item</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-lg bg-white p-4 shadow">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Items</p>
          <p className="text-2xl font-bold text-gray-800">{stats.totalItems}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Low Stock Alerts</p>
          <p className={`text-2xl font-bold ${stats.lowStock > 0 ? 'text-amber-600' : 'text-green-600'}`}>{stats.lowStock}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Locations</p>
          <p className="text-2xl font-bold text-gray-800">{stats.locations}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Resource Types</p>
          <p className="text-2xl font-bold text-gray-800">{stats.types}</p>
        </div>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="rounded-lg bg-white p-4 shadow space-y-3">
          <h2 className="text-lg font-semibold text-gray-700">{editing ? 'Edit Item' : 'Add Item'}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <input className="border rounded px-3 py-2 text-sm" placeholder="Resource type (e.g. food_kits)" value={form.resource_type} onChange={(e) => setForm({ ...form, resource_type: e.target.value })} />
            <input className="border rounded px-3 py-2 text-sm" placeholder="Quantity" type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            <input className="border rounded px-3 py-2 text-sm" placeholder="Location description" value={form.location_desc} onChange={(e) => setForm({ ...form, location_desc: e.target.value })} />
            <select className="border rounded px-3 py-2 text-sm" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as InventoryItem['status'] })}>
              <option value="available">Available</option>
              <option value="depleted">Depleted</option>
              <option value="expired">Expired</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={save} className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700">Save</button>
            <button onClick={() => setShowForm(false)} className="rounded bg-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-300">Cancel</button>
          </div>
        </div>
      )}

      {/* Grid View — grouped by location */}
      {view === 'grid' && (
        <div className="space-y-6">
          {byLocation.map((loc) => (
            <div key={loc.description} className="rounded-lg bg-white shadow overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-800">{loc.description}</h3>
                  <p className="text-xs text-gray-500">{loc.items.length} item types · {loc.items.reduce((s, i) => s + i.quantity, 0)} total units</p>
                </div>
                {loc.lat !== 0 && <span className="text-xs text-gray-400">{loc.lat.toFixed(2)}, {loc.lng.toFixed(2)}</span>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 p-4">
                {loc.items.map((item) => (
                  <div key={item.id} className={`rounded-lg border p-3 ${item.quantity < LOW_STOCK_THRESHOLD && item.status === 'available' ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{getTypeIcon(item.resource_type)}</span>
                        <span className="font-medium text-sm text-gray-800 capitalize">{item.resource_type.replace(/_/g, ' ')}</span>
                      </div>
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${getStatusColor(item.status)}`}>{item.status}</span>
                    </div>
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-2xl font-bold text-gray-800">{item.quantity}</p>
                        <p className="text-xs text-gray-500">units</p>
                      </div>
                      {item.quantity < LOW_STOCK_THRESHOLD && item.status === 'available' && (
                        <span className="text-xs font-medium text-amber-700 bg-amber-100 rounded px-2 py-0.5">Low stock</span>
                      )}
                    </div>
                    <div className="flex gap-2 mt-2 pt-2 border-t border-gray-100">
                      <button onClick={() => openEdit(item)} className="text-xs text-indigo-600 hover:underline">Edit</button>
                      <button onClick={() => remove(item.id)} className="text-xs text-red-600 hover:underline">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {byLocation.length === 0 && (
            <div className="text-center py-12 text-gray-400">No inventory items. Add items manually or upload a handwritten inventory image.</div>
          )}
        </div>
      )}

      {/* Table View */}
      {view === 'table' && (
        <div className="overflow-x-auto rounded-lg bg-white shadow">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Qty</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map((item) => (
                <tr key={item.id} className={item.quantity < LOW_STOCK_THRESHOLD && item.status === 'available' ? 'bg-amber-50' : ''}>
                  <td className="px-4 py-2 text-sm text-gray-800 flex items-center gap-2">
                    <span>{getTypeIcon(item.resource_type)}</span>
                    <span className="capitalize">{item.resource_type.replace(/_/g, ' ')}</span>
                  </td>
                  <td className="px-4 py-2 text-sm font-medium text-gray-800">
                    {item.quantity}
                    {item.quantity < LOW_STOCK_THRESHOLD && item.status === 'available' && (
                      <span className="ml-2 text-xs font-medium text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">Low</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-600">{item.location?.description}</td>
                  <td className="px-4 py-2 text-sm">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${getStatusColor(item.status)}`}>{item.status}</span>
                  </td>
                  <td className="px-4 py-2 text-sm space-x-2">
                    <button onClick={() => openEdit(item)} className="text-indigo-600 hover:underline text-xs">Edit</button>
                    <button onClick={() => remove(item.id)} className="text-red-600 hover:underline text-xs">Delete</button>
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-400">No inventory items</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
