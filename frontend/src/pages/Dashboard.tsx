import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

const API_URL = (import.meta.env.VITE_API_URL as string) || '/api';

export default function Dashboard() {
  const { token } = useAuth();
  const [breakdown, setBreakdown] = useState<{ status: string; count: number }[]>([]);

  useEffect(() => {
    if (!token) return;
    axios
      .get(`${API_URL}/dashboard`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => setBreakdown(r.data.breakdown ?? []))
      .catch(() => {});
  }, [token]);

  const data = breakdown.map((b, i) => ({ name: b.status, value: b.count, i }));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="text-sm text-gray-500">Realtime via Socket.io</div>
      </div>

      <div className="bg-white rounded shadow p-4">
        <div className="text-lg font-semibold mb-2">Casi per stato</div>
        <div className="h-64">
          <ResponsiveContainer>
            <LineChart data={data}>
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="#2563eb" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

