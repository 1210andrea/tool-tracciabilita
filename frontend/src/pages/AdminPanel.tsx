import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';

export default function AdminPanel() {
  const { user } = useAuth();
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Admin Panel</h1>
        <p className="text-sm text-slate-400">Area riservata agli amministratori.</p>
      </div>
      <div className="rounded-xl bg-white p-6 shadow">
        <div className="text-sm text-slate-500">Utente:</div>
        <div className="mt-2 text-xl font-semibold text-slate-900">{user?.id ?? 'N/D'}</div>
      </div>
      <div className="rounded-xl bg-white p-6 shadow">
        <h2 className="text-xl font-semibold mb-3">Funzionalità</h2>
        <ul className="space-y-2 text-slate-600">
          <li>• Gestione categorie</li>
          <li>• Gestione macchine</li>
          <li>• Gestione utenti</li>
        </ul>
      </div>
      <Link
        to="/"
        className="inline-flex rounded bg-slate-800 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-700"
      >
        Torna alla dashboard
      </Link>
    </div>
  );
}

