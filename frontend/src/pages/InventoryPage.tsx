import { useState } from 'react';
import { useInventory } from '../hooks/useInventory';
import { useAuth } from '../contexts/AuthContext';
import { doc, setDoc, deleteDoc, collection } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { InventoryItem } from '../types';

const LOW_STOCK_THRESHOLD = 10;

const NEED_TYPE_RESOURCE_MAP: Record<string, string[]> = {
  food_shortage: ['food_kits', 'water_bottles'],
  medical_emergency: ['medical_supplies', 'first_aid_kits'],
  shelter: ['tents', 'blankets'],
  clothing: ['clothing_packs'],
};

interface FormData {
  resource_type: string;
  quantity: string;
  location_desc: string;
  status: InventoryItem['status'];
  expiry_date: string;
}

const emptyForm: FormData = {
  resource_type: '',
  quantity: '',
  location_desc: '',
  status: 'available',
  expiry_date: '',
};

export default function InventoryPage() {
  const { data, loading } = useInventory();
  const { ngoId } = useAuth();
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [showForm, setShowForm] = useState(false);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (item: InventoryItem) => {
    setEditing(item.id);
    setForm({
      resource_type: item.resource_type,
      quantity: String(item.quantity),
      location_desc: item.location?.description ?? '',
      status: item.status,
      expiry_date: '',
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!ngoId) return;
    const ref = editing
      ? doc(db, 'inventory', editing)
      : doc(collection(db, 'inventory'));
    await setDoc(
      ref,
      {
        resource_type: form.resource_type,
        quantity: Number(form.quantity) || 0,
        location: { lat: 0, lng: 0, description: form.location_desc },
        ngo_id: ngoId,
        status: form.status,
        ...(form.expiry_date ? { expiry_date: new Date(form.expiry_date) } : {}),
        updated_at: new Date(),
        ...(!editing ? { created_at: new Date() } : {}),
      },
      { merge: true }
    );
    setShowForm(false);
  };

  const remove = async (id: string) => {
    await deleteDoc(doc(db, 'inventory', id));
  };

  if (loading) return <div className="p-6 text-gray-500">Loading inventory…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Inventory Manager</h1>
        <button
          type="button"
          onClick={openAdd}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + Add Item
        </button>
      </div>

      {/* Need-type to resource mapping */}
      <div className="rounded-lg bg-white p-4 shadow">
        <h2 className="text-sm font-semibold text-gray-600 mb-2">Need → Resource Mapping</h2>
        <div className="flex flex-wrap gap-3 text-xs">
          {Object.entries(NEED_TYPE_RESOURCE_MAP).map(([need, resources]) => (
            <span key={need} className="bg-gray-100 rounded px-2 py-1">
              <span className="font-medium">{need}</span> → {resources.join(', ')}
            </span>
          ))}
        </div>
      </div>

      {/* Inline form */}
      {showForm && (
        <div className="rounded-lg bg-white p-4 shadow space-y-3">
          <h2 className="text-lg font-semibold text-gray-700">
            {editing ? 'Edit Item' : 'Add Item'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <input
              className="border rounded px-2 py-1 text-sm"
              placeholder="Resource type"
              value={form.resource_type}
              onChange={(e) => setForm({ ...form, resource_type: e.target.value })}
            />
            <input
              className="border rounded px-2 py-1 text-sm"
              placeholder="Quantity"
              type="number"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            />
            <input
              className="border rounded px-2 py-1 text-sm"
              placeholder="Location"
              value={form.location_desc}
              onChange={(e) => setForm({ ...form, location_desc: e.target.value })}
            />
            <select
              className="border rounded px-2 py-1 text-sm"
              value={form.status}
              onChange={(e) =>
                setForm({ ...form, status: e.target.value as InventoryItem['status'] })
              }
            >
              <option value="available">Available</option>
              <option value="depleted">Depleted</option>
              <option value="expired">Expired</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              className="rounded bg-indigo-600 px-3 py-1 text-sm text-white hover:bg-indigo-700"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded bg-gray-200 px-3 py-1 text-sm text-gray-700 hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Table */}
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
              <tr key={item.id}>
                <td className="px-4 py-2 text-sm text-gray-800">{item.resource_type}</td>
                <td className="px-4 py-2 text-sm text-gray-800">
                  {item.quantity}
                  {item.quantity < LOW_STOCK_THRESHOLD && (
                    <span className="ml-2 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                      Low stock
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-sm text-gray-600">{item.location?.description}</td>
                <td className="px-4 py-2 text-sm">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      item.status === 'available'
                        ? 'bg-green-100 text-green-700'
                        : item.status === 'depleted'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {item.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-sm space-x-2">
                  <button
                    type="button"
                    onClick={() => openEdit(item)}
                    className="text-indigo-600 hover:underline text-xs"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(item.id)}
                    className="text-red-600 hover:underline text-xs"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-400">
                  No inventory items
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
