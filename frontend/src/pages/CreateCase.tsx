import { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL as string;

export default function CreateCase() {
  const { token } = useAuth();
  const [machineId, setMachineId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Nuovo caso</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-4 rounded shadow">
        <div>
          <div className="text-sm mb-1">Machine ID</div>
          <input className="w-full border rounded px-3 py-2" value={machineId} onChange={(e) => setMachineId(e.target.value)} />
        </div>
        <div>
          <div className="text-sm mb-1">Category ID (opzionale)</div>
          <input className="w-full border rounded px-3 py-2" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <div className="text-sm mb-1">Titolo</div>
          <input className="w-full border rounded px-3 py-2" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <div className="text-sm mb-1">Descrizione</div>
          <textarea className="w-full border rounded px-3 py-2" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <div className="text-sm mb-1">Priorità</div>
          <select className="w-full border rounded px-3 py-2" value={priority} onChange={(e) => setPriority(e.target.value)}>
            {['low','medium','high','critical'].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <button
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            disabled={!token}
            onClick={async () => {
              if (!token) return;
              await axios.post(`${API_URL}/cases`, {
                machine_id: machineId,
                category_id: categoryId || null,
                title,
                description,
                priority
              }, { headers: { Authorization: `Bearer ${token}` } });
              alert('Case creato');
            }}
          >
            Crea
          </button>
        </div>
      </div>
    </div>
  );
}

