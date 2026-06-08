import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login, user } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) nav('/');
  }, [user, nav]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900/95 p-8 shadow-2xl shadow-slate-950/30 backdrop-blur">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Accesso</h1>
          <p className="mt-2 text-slate-400">Entra nel sistema di gestione manutenzione.</p>
        </div>

        {error && <div className="mb-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}

        <label className="block text-sm font-medium text-slate-300">Username</label>
        <input
          className="mt-2 mb-4 w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none transition focus:border-slate-500"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="admin"
        />

        <label className="block text-sm font-medium text-slate-300">Password</label>
        <input
          type="password"
          className="mt-2 mb-6 w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none transition focus:border-slate-500"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />

        <button
          type="button"
          className="w-full rounded-2xl bg-sky-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={loading}
          onClick={async () => {
            setError(null);
            setLoading(true);
            try {
              await login(username, password);
              nav('/');
            } catch (e: any) {
              setError(e?.response?.data?.error ?? 'Login fallito. Controlla le credenziali.');
            } finally {
              setLoading(false);
            }
          }}
        >
          {loading ? 'Verifico...' : 'Accedi'}
        </button>

        <p className="mt-5 text-center text-xs uppercase tracking-[0.18em] text-slate-500">
          Utilizza admin/admin o user/user sui dati iniziali.
        </p>
      </div>
    </div>
  );
}

