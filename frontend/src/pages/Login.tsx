import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login, user } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (user) {
    nav('/');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm bg-white rounded shadow p-6">
        <h1 className="text-xl font-semibold mb-4">Login</h1>
        {error && <div className="mb-3 text-red-600 text-sm">{error}</div>}
        <label className="block text-sm mb-1">Username</label>
        <input className="w-full border rounded px-3 py-2 mb-3" value={username} onChange={(e) => setUsername(e.target.value)} />
        <label className="block text-sm mb-1">Password</label>
        <input type="password" className="w-full border rounded px-3 py-2 mb-4" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
          onClick={async () => {
            setError(null);
            try {
              await login(username, password);
              nav('/');
            } catch (e: any) {
              setError(e?.response?.data?.error ?? 'Login failed');
            }
          }}
        >
          Accedi
        </button>
        <div className="mt-4 text-xs text-gray-500">LDAP fallback gestito dal backend (opzionale).</div>
      </div>
    </div>
  );
}

