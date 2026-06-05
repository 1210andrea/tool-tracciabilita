import { useAuth } from '../context/AuthContext';

export default function AdminPanel() {
  const { user } = useAuth();
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-2">Admin Panel</h1>
      <div className="text-sm text-gray-600">Utente: {user?.id}</div>
      <div className="mt-4 bg-white rounded shadow p-4">(stub) Gestione categorie/macchine e utenti.</div>
    </div>
  );
}

