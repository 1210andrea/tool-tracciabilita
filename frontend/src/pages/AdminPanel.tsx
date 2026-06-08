import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Link } from 'react-router-dom';

type Category = { id: string; type: string; name: string; description?: string };
type Machine = { id: string; code: string; name: string; line?: string; location?: string };
type User = { id: string; username: string; email?: string; role: string };

const API_URL = '/api';

export default function AdminPanel() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<'categories' | 'machines' | 'users'>('categories');
  const [categories, setCategories] = useState<Category[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const [categoryForm, setCategoryForm] = useState({ type: 'operator', name: '', description: '' });
  const [machineForm, setMachineForm] = useState({ code: '', name: '', line: '', location: '' });
  const [userForm, setUserForm] = useState({ username: '', email: '', password: '', role: 'user' });

  const headers = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);

  const loadAll = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [categoriesResp, machinesResp, usersResp] = await Promise.all([
        axios.get(`${API_URL}/categories`, headers),
        axios.get(`${API_URL}/machines`, headers),
        axios.get(`${API_URL}/users`, headers)
      ]);
      setCategories(categoriesResp.data.items || []);
      setMachines(machinesResp.data.items || []);
      setUsers(usersResp.data.items || []);
    } catch {
      setCategories([]);
      setMachines([]);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [token]);

  const submitCategory = async () => {
    try {
      await axios.post(`${API_URL}/categories`, categoryForm, headers);
      setMessage('Categoria creata.');
      setCategoryForm({ type: 'operator', name: '', description: '' });
      loadAll();
    } catch (err: any) {
      setMessage(err?.response?.data?.error ?? 'Errore salvataggio categoria.');
    }
  };

  const submitMachine = async () => {
    try {
      await axios.post(`${API_URL}/machines`, machineForm, headers);
      setMessage('Macchina aggiunta.');
      setMachineForm({ code: '', name: '', line: '', location: '' });
      loadAll();
    } catch (err: any) {
      setMessage(err?.response?.data?.error ?? 'Errore salvataggio macchina.');
    }
  };

  const submitUser = async () => {
    try {
      await axios.post(`${API_URL}/users`, userForm, headers);
      setMessage('Utente creato.');
      setUserForm({ username: '', email: '', password: '', role: 'user' });
      loadAll();
    } catch (err: any) {
      setMessage(err?.response?.data?.error ?? 'Errore salvataggio utente.');
    }
  };

  const deleteItem = async (type: 'categories' | 'machines' | 'users', id: string) => {
    try {
      await axios.delete(`${API_URL}/${type}/${id}`, headers);
      setMessage('Elemento eliminato.');
      loadAll();
    } catch (err: any) {
      setMessage(err?.response?.data?.error ?? 'Errore eliminazione.');
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Admin Panel</h1>
        <p className="text-sm text-slate-400">Gestisci categorie, macchine e utenti.</p>
      </div>

      {message && <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">{message}</div>}

      <div className="flex flex-wrap gap-3">
        {(['categories', 'machines', 'users'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`rounded-full px-5 py-3 text-sm font-semibold transition ${
              activeTab === tab ? 'bg-sky-500 text-slate-950' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
            }`}
          >
            {tab === 'categories' ? 'Categorie' : tab === 'machines' ? 'Macchine' : 'Utenti'}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6 rounded-3xl bg-slate-950/80 p-6 shadow-xl shadow-slate-950/10">
          {activeTab === 'categories' && (
            <>
              <div>
                <h2 className="text-xl font-semibold text-slate-100">Nuova categoria</h2>
                <p className="text-sm text-slate-400">Aggiungi operatori, problemi o cause.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm text-slate-300">Tipo</label>
                  <select
                    value={categoryForm.type}
                    onChange={(e) => setCategoryForm((current) => ({ ...current, type: e.target.value }))}
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none"
                  >
                    <option value="operator">Operatore</option>
                    <option value="problem">Problema</option>
                    <option value="cause">Causa</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-slate-300">Nome</label>
                  <input
                    value={categoryForm.name}
                    onChange={(e) => setCategoryForm((current) => ({ ...current, name: e.target.value }))}
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm text-slate-300">Descrizione</label>
                <textarea
                  value={categoryForm.description}
                  onChange={(e) => setCategoryForm((current) => ({ ...current, description: e.target.value }))}
                  rows={4}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none"
                />
              </div>
              <button type="button" className="rounded-2xl bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950" onClick={submitCategory}>
                Crea categoria
              </button>
            </>
          )}

          {activeTab === 'machines' && (
            <>
              <div>
                <h2 className="text-xl font-semibold text-slate-100">Nuova macchina</h2>
                <p className="text-sm text-slate-400">Aggiungi qui le macchine della linea.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <input
                  value={machineForm.code}
                  onChange={(e) => setMachineForm((current) => ({ ...current, code: e.target.value }))}
                  placeholder="Codice macchina"
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none"
                />
                <input
                  value={machineForm.name}
                  onChange={(e) => setMachineForm((current) => ({ ...current, name: e.target.value }))}
                  placeholder="Nome macchina"
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <input
                  value={machineForm.line}
                  onChange={(e) => setMachineForm((current) => ({ ...current, line: e.target.value }))}
                  placeholder="Linea"
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none"
                />
                <input
                  value={machineForm.location}
                  onChange={(e) => setMachineForm((current) => ({ ...current, location: e.target.value }))}
                  placeholder="Posizione"
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none"
                />
              </div>
              <button type="button" className="rounded-2xl bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950" onClick={submitMachine}>
                Aggiungi macchina
              </button>
            </>
          )}

          {activeTab === 'users' && (
            <>
              <div>
                <h2 className="text-xl font-semibold text-slate-100">Nuovo utente</h2>
                <p className="text-sm text-slate-400">Crea account per accesso al portale.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <input
                  value={userForm.username}
                  onChange={(e) => setUserForm((current) => ({ ...current, username: e.target.value }))}
                  placeholder="Username"
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none"
                />
                <input
                  value={userForm.email}
                  onChange={(e) => setUserForm((current) => ({ ...current, email: e.target.value }))}
                  placeholder="Email"
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <input
                  type="password"
                  value={userForm.password}
                  onChange={(e) => setUserForm((current) => ({ ...current, password: e.target.value }))}
                  placeholder="Password"
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none"
                />
                <select
                  value={userForm.role}
                  onChange={(e) => setUserForm((current) => ({ ...current, role: e.target.value }))}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none"
                >
                  <option value="user">Utente</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button type="button" className="rounded-2xl bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950" onClick={submitUser}>
                Crea utente
              </button>
            </>
          )}
        </div>

        <div className="space-y-6 rounded-3xl bg-slate-950/95 p-6 shadow-xl shadow-slate-950/10">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-100">Elenco {activeTab === 'categories' ? 'categorie' : activeTab === 'machines' ? 'macchine' : 'utenti'}</h2>
            {loading && <span className="text-sm text-slate-500">Caricamento...</span>}
          </div>

          {activeTab === 'categories' && (
            <div className="space-y-4">
              {categories.map((category) => (
                <div key={category.id} className="flex flex-col gap-2 rounded-3xl border border-slate-800 bg-slate-900/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-semibold text-slate-100">[{category.type}] {category.name}</div>
                    <div className="text-sm text-slate-500">{category.description || 'Nessuna descrizione'}</div>
                  </div>
                  <button type="button" className="rounded-2xl bg-rose-500 px-4 py-2 text-sm font-semibold text-slate-950" onClick={() => deleteItem('categories', category.id)}>
                    Elimina
                  </button>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'machines' && (
            <div className="space-y-4">
              {machines.map((machine) => (
                <div key={machine.id} className="flex flex-col gap-2 rounded-3xl border border-slate-800 bg-slate-900/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-semibold text-slate-100">{machine.code} - {machine.name}</div>
                    <div className="text-sm text-slate-500">{machine.line || 'Linea non impostata'} · {machine.location || 'Posizione non impostata'}</div>
                  </div>
                  <button type="button" className="rounded-2xl bg-rose-500 px-4 py-2 text-sm font-semibold text-slate-950" onClick={() => deleteItem('machines', machine.id)}>
                    Elimina
                  </button>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'users' && (
            <div className="space-y-4">
              {users.map((userItem) => (
                <div key={userItem.id} className="flex flex-col gap-2 rounded-3xl border border-slate-800 bg-slate-900/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-semibold text-slate-100">{userItem.username}</div>
                    <div className="text-sm text-slate-500">{userItem.email || 'Email non fornita'} · ruolo: {userItem.role}</div>
                  </div>
                  <button type="button" className="rounded-2xl bg-rose-500 px-4 py-2 text-sm font-semibold text-slate-950" onClick={() => deleteItem('users', userItem.id)}>
                    Elimina
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Link to="/" className="inline-flex rounded-2xl bg-slate-800 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700">
        Torna alla dashboard
      </Link>
    </div>
  );
}

