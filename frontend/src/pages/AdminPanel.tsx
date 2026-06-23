import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { ConfirmModal } from '../components/ConfirmModal';

type Category = { id: string; type: string; name: string; description?: string; usage_count?: number };
type Operatore = { id: string; nome: string; attivo: boolean; created_at?: string; updated_at?: string; usage_count?: number };
type Machine = { id: string; code: string; name: string; line?: string; location?: string; tipologia?: string; type?: string; posizione?: string; usage_count?: number };
type User = { id: string; username: string; email?: string; role: string };
type SparePart = { id: string; name: string; tipologia?: string[]; tipologie?: string[]; type?: string; description?: string; usage_count?: number };
type SolutionApplied = { id: string; name: string; description?: string; problem_id?: string | null; problem_name?: string | null; usage_count?: number };

const API_URL = '/api';
type AdminTab = 'operatori' | 'problemi' | 'cause' | 'macchine' | 'utenti' | 'ricambi' | 'soluzioni';

function DeleteButton({ itemId, usageCount, type, onDelete }: {
  itemId: string; usageCount?: number;
  type: 'categories' | 'machines' | 'users' | 'spare_parts' | 'solutions' | 'operatori';
  onDelete: (type: 'categories' | 'machines' | 'users' | 'spare_parts' | 'solutions' | 'operatori', id: string) => void;
}) {
  if (type === 'users') {
    return <button type="button" className="rounded-2xl bg-rose-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-rose-400 transition" onClick={() => onDelete(type, itemId)}>Elimina</button>;
  }
  const isInUse = (usageCount ?? 0) > 0;
  if (isInUse) {
    return <span className="text-xs text-slate-500 font-semibold bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">In uso (Non eliminabile)</span>;
  }
  return <button type="button" className="rounded-2xl bg-rose-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-rose-400 transition" onClick={() => onDelete(type, itemId)}>Elimina</button>;
}

export default function AdminPanel() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('operatori');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingDeleteType, setPendingDeleteType] = useState<'categories' | 'machines' | 'users' | 'spare_parts' | 'solutions' | 'operatori' | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [operatori, setOperatori] = useState<Operatore[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [spareParts, setSpareParts] = useState<SparePart[]>([]);
  const [solutionsApplied, setSolutionsApplied] = useState<SolutionApplied[]>([]);
  const [availableTipologie, setAvailableTipologie] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const [categoryForm, setCategoryForm] = useState({ type: 'problem', name: '', description: '' });
  const [operatoreForm, setOperatoreForm] = useState({ nome: '', attivo: true });
  const [editingOperatoreId, setEditingOperatoreId] = useState<string | null>(null);
  const [machineForm, setMachineForm] = useState({ code: '', name: '', line: '', location: '', tipologia: '' });
  const [editingMachineId, setEditingMachineId] = useState<string | null>(null);
  const [userForm, setUserForm] = useState({ username: '', email: '', password: '', role: 'user' });
  const [sparePartForm, setSparePartForm] = useState({ name: '', tipologie: [] as string[], description: '' });
  const [editingSparePartId, setEditingSparePartId] = useState<string | null>(null);
  const [solutionForm, setSolutionForm] = useState({ name: '', description: '', problem_id: '' });
  const [editingSolutionId, setEditingSolutionId] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);

  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userEditForm, setUserEditForm] = useState({ username: '', email: '', password: '' });

  const headers = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);

  const causes = useMemo(() => categories.filter((c) => c.type === 'cause').sort((a, b) => a.name.localeCompare(b.name)), [categories]);
  const problems = useMemo(() => categories.filter((c) => c.type === 'problem').sort((a, b) => a.name.localeCompare(b.name)), [categories]);

  const loadAll = async () => {
    if (!token) return;
    setLoading(true); setMessage(null);
    const requests = [
      { key: 'categories' as const, promise: axios.get(`${API_URL}/categories`, headers) },
      { key: 'operatori' as const, promise: axios.get(`${API_URL}/operatori?all=1`, headers) },
      { key: 'machines' as const, promise: axios.get(`${API_URL}/machines`, headers) },
      { key: 'users' as const, promise: axios.get(`${API_URL}/users`, headers) },
      { key: 'spareParts' as const, promise: axios.get(`${API_URL}/spare-parts`, headers) },
      { key: 'solutionsApplied' as const, promise: axios.get(`${API_URL}/solutions-applied`, headers) },
      { key: 'tipologie' as const, promise: axios.get(`${API_URL}/machines/tipologie`, headers) }
    ];
    const results = await Promise.allSettled(requests.map((r) => r.promise));
    const errors: string[] = [];
    results.forEach((result, index) => {
      const key = requests[index].key;
      if (result.status === 'fulfilled') {
        const items = result.value.data.items || [];
        if (key === 'categories') setCategories(items);
        if (key === 'operatori') setOperatori(items);
        if (key === 'machines') setMachines(items);
        if (key === 'users') setUsers(items);
        if (key === 'spareParts') setSpareParts(items);
        if (key === 'solutionsApplied') setSolutionsApplied(items);
        if (key === 'tipologie') setAvailableTipologie(items);
      } else {
        errors.push((result.reason as any)?.response?.data?.error ?? `Errore caricamento ${key}`);
      }
    });
    if (errors.length) setMessage(`Alcuni dati non sono stati caricati: ${errors.join(' · ')}`);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, [token]);

  useEffect(() => {
    if (activeTab === 'problemi') setCategoryForm((c) => ({ ...c, type: 'problem' }));
    else if (activeTab === 'cause') setCategoryForm((c) => ({ ...c, type: 'cause' }));
  }, [activeTab]);

  useEffect(() => {
    setEditingCategoryId(null);
    setEditingMachineId(null);
    setEditingSparePartId(null);
    setEditingOperatoreId(null);
    setEditingSolutionId(null);
    setCategoryForm((c) => ({ type: activeTab === 'cause' ? 'cause' : 'problem', name: '', description: '' }));
    setMachineForm({ code: '', name: '', line: '', location: '', tipologia: '' });
    setSparePartForm({ name: '', tipologie: [], description: '' });
    setSolutionForm({ name: '', description: '', problem_id: '' });
    setOperatoreForm({ nome: '', attivo: true });
  }, [activeTab]);

  const startEditUser = (user: User) => { setEditingUser(user); setUserEditForm({ username: user.username, email: user.email || '', password: '' }); };
  const cancelEditUser = () => { setEditingUser(null); setUserEditForm({ username: '', email: '', password: '' }); };
  const submitUserEdit = async () => {
    if (!editingUser) return;
    try {
      const payload: any = {};
      if (userEditForm.username) payload.username = userEditForm.username;
      if (userEditForm.email) payload.email = userEditForm.email;
      if (userEditForm.password) payload.password = userEditForm.password;
      if (Object.keys(payload).length === 0) { setMessage('Nessun campo da aggiornare.'); return; }
      await axios.put(`${API_URL}/users/${editingUser.id}`, payload, headers);
      setMessage('Utente aggiornato.'); cancelEditUser(); loadAll();
    } catch (err: any) { setMessage(err?.response?.data?.error ?? 'Errore aggiornamento utente.'); }
  };

  const submitOperatore = async () => {
    try {
      if (!operatoreForm.nome.trim()) { setMessage('Il nome operatore è obbligatorio.'); return; }
      if (editingOperatoreId) {
        await axios.put(`${API_URL}/operatori/${editingOperatoreId}`, operatoreForm, headers);
        setMessage('Operatore aggiornato.');
      } else {
        await axios.post(`${API_URL}/operatori`, operatoreForm, headers);
        setMessage('Operatore creato.');
      }
      setOperatoreForm({ nome: '', attivo: true }); setEditingOperatoreId(null); loadAll();
    } catch (err: any) { setMessage(err?.response?.data?.error ?? 'Errore salvataggio operatore.'); }
  };
  const startEditOperatore = (op: Operatore) => { setEditingOperatoreId(op.id); setOperatoreForm({ nome: op.nome, attivo: op.attivo }); };
  const cancelEditOperatore = () => { setEditingOperatoreId(null); setOperatoreForm({ nome: '', attivo: true }); };

  const submitCategory = async () => {
    try {
      const payload = { ...categoryForm };
      if (editingCategoryId) {
        await axios.put(`${API_URL}/categories/${editingCategoryId}`, payload, headers);
        setMessage('Aggiornato.');
      } else {
        await axios.post(`${API_URL}/categories`, payload, headers);
        setMessage('Creato.');
      }
      setCategoryForm((prev) => ({ type: prev.type, name: '', description: '' }));
      setEditingCategoryId(null); loadAll();
    } catch (err: any) { setMessage(err?.response?.data?.error ?? 'Errore salvataggio.'); }
  };
  const startEditCategory = (cat: Category) => {
    setEditingCategoryId(cat.id);
    setCategoryForm({ type: cat.type, name: cat.name, description: cat.description || '' });
  };
  const cancelEditCategory = () => { setEditingCategoryId(null); setCategoryForm((c) => ({ ...c, name: '', description: '' })); };

  const submitMachine = async () => {
    try {
      const payload = { ...machineForm, tipologia: machineForm.tipologia || undefined };
      if (editingMachineId) {
        await axios.put(`${API_URL}/machines/${editingMachineId}`, payload, headers);
        setMessage('Macchina aggiornata.');
      } else {
        await axios.post(`${API_URL}/machines`, payload, headers);
        setMessage('Macchina aggiunta.');
      }
      setMachineForm({ code: '', name: '', line: '', location: '', tipologia: '' }); setEditingMachineId(null); loadAll();
    } catch (err: any) { setMessage(err?.response?.data?.error ?? 'Errore salvataggio macchina.'); }
  };
  const startEditMachine = (m: Machine) => { setEditingMachineId(m.id); setMachineForm({ code: m.code, name: m.name, line: m.line || '', location: m.location || '', tipologia: m.tipologia || m.type || '' }); };
  const cancelEditMachine = () => { setEditingMachineId(null); setMachineForm({ code: '', name: '', line: '', location: '', tipologia: '' }); };

  const submitSparePart = async () => {
    try {
      if (editingSparePartId) {
        await axios.put(`${API_URL}/spare-parts/${editingSparePartId}`, sparePartForm, headers);
        setMessage('Ricambio aggiornato.');
      } else {
        await axios.post(`${API_URL}/spare-parts`, sparePartForm, headers);
        setMessage('Ricambio aggiunto.');
      }
      setSparePartForm({ name: '', tipologie: [], description: '' }); setEditingSparePartId(null); loadAll();
    } catch (err: any) { setMessage(err?.response?.data?.error ?? 'Errore salvataggio ricambio.'); }
  };
  const startEditSparePart = (part: SparePart) => {
    setEditingSparePartId(part.id);
    const tList = part.tipologie && part.tipologie.length ? part.tipologie : (part.tipologia && part.tipologia.length ? part.tipologia : []);
    setSparePartForm({ name: part.name, tipologie: tList, description: part.description || '' });
  };
  const cancelEditSparePart = () => { setEditingSparePartId(null); setSparePartForm({ name: '', tipologie: [], description: '' }); };

  // ── SOLUZIONI ──────────────────────────────────────────────────────────────
  const submitSolution = async () => {
    try {
      if (!solutionForm.name.trim()) { setMessage('Il nome soluzione è obbligatorio.'); return; }
      const payload = {
        name: solutionForm.name.trim(),
        description: solutionForm.description.trim() || null,
        problem_id: solutionForm.problem_id || null,
      };
      if (editingSolutionId) {
        await axios.put(`${API_URL}/solutions-applied/${editingSolutionId}`, payload, headers);
        setMessage('Soluzione aggiornata.');
      } else {
        await axios.post(`${API_URL}/solutions-applied`, payload, headers);
        setMessage('Soluzione aggiunta.');
      }
      setSolutionForm({ name: '', description: '', problem_id: '' });
      setEditingSolutionId(null);
      loadAll();
    } catch (err: any) { setMessage(err?.response?.data?.error ?? 'Errore salvataggio soluzione.'); }
  };
  const startEditSolution = (sol: SolutionApplied) => {
    setEditingSolutionId(sol.id);
    setSolutionForm({ name: sol.name, description: sol.description || '', problem_id: sol.problem_id || '' });
  };
  const cancelEditSolution = () => {
    setEditingSolutionId(null);
    setSolutionForm({ name: '', description: '', problem_id: '' });
  };

  const submitUser = async () => {
    try {
      await axios.post(`${API_URL}/users`, userForm, headers);
      setMessage('Utente creato.'); setUserForm({ username: '', email: '', password: '', role: 'user' }); loadAll();
    } catch (err: any) { setMessage(err?.response?.data?.error ?? 'Errore salvataggio utente.'); }
  };

  const deleteItem = async (type: 'categories' | 'machines' | 'users' | 'spare_parts' | 'solutions' | 'operatori', id: string) => {
    try {
      const path = type === 'spare_parts' ? 'spare-parts' : type === 'solutions' ? 'solutions-applied' : type === 'operatori' ? 'operatori' : type;
      await axios.delete(`${API_URL}/${path}/${id}`, headers);
      setMessage('Elemento eliminato.'); loadAll();
    } catch (err: any) {
      const usage = err?.response?.data?.usage_count;
      setMessage(err?.response?.data?.error ?? (usage ? `In uso da ${usage} casi` : 'Eliminazione non consentita.'));
    }
  };

  const requestDelete = (type: 'categories' | 'machines' | 'users' | 'spare_parts' | 'solutions' | 'operatori', id: string) => {
    setPendingDeleteType(type); setPendingDeleteId(id); setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteType || !pendingDeleteId) return;
    setConfirmOpen(false);
    const type = pendingDeleteType; const id = pendingDeleteId;
    setPendingDeleteType(null); setPendingDeleteId(null);
    await deleteItem(type, id);
  };

  const tabLabels: Record<AdminTab, string> = { operatori: 'Operatori', problemi: 'Problemi', cause: 'Cause', macchine: 'Macchine', utenti: 'Utenti', ricambi: 'Pezzi di Ricambio', soluzioni: 'Soluzioni' };
  const listTitle = activeTab === 'operatori' ? 'operatori' : activeTab === 'problemi' ? 'problemi' : activeTab === 'cause' ? 'cause' : activeTab === 'macchine' ? 'macchine' : activeTab === 'utenti' ? 'utenti' : activeTab === 'ricambi' ? 'pezzi di ricambio' : 'soluzioni applicate';

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Admin Panel</h1>
        <p className="text-sm text-slate-400">Gestisci operatori, problemi, cause, macchine, utenti, ricambi e soluzioni.</p>
      </div>

      {message && <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">{message}</div>}

      <div className="flex flex-wrap gap-2 sm:gap-3">
        {(['operatori', 'problemi', 'cause', 'macchine', 'utenti', 'ricambi', 'soluzioni'] as const).map((tab) => (
          <button key={tab} type="button" onClick={() => setActiveTab(tab)}
            className={`rounded-full px-4 py-2.5 text-xs font-semibold transition sm:px-5 sm:py-3 sm:text-sm ${activeTab === tab ? 'bg-sky-500 text-slate-950' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}`}>
            {tabLabels[tab]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6 rounded-3xl bg-slate-950/80 p-5 shadow-xl shadow-slate-950/10 sm:p-6">

          {activeTab === 'operatori' && (
            <>
              <div>
                <h2 className="text-xl font-semibold text-slate-100">{editingOperatoreId ? 'Modifica operatore' : 'Nuovo operatore'}</h2>
                <p className="text-sm text-slate-400">Gestisci gli operatori.</p>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="text-sm text-slate-300">Nome operatore</label>
                  <input value={operatoreForm.nome} onChange={(e) => setOperatoreForm((c) => ({ ...c, nome: e.target.value }))} placeholder="Nome operatore" className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
                </div>
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input type="checkbox" checked={operatoreForm.attivo} onChange={(e) => setOperatoreForm((c) => ({ ...c, attivo: e.target.checked }))} className="accent-sky-500 h-4 w-4 cursor-pointer rounded" />
                  <span className="text-sm text-slate-300">Attivo</span>
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="rounded-2xl bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-sky-400 transition" onClick={submitOperatore}>{editingOperatoreId ? 'Salva modifiche' : 'Aggiungi operatore'}</button>
                {editingOperatoreId && <button type="button" className="rounded-2xl border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800 transition" onClick={cancelEditOperatore}>Annulla</button>}
              </div>
            </>
          )}

          {activeTab === 'problemi' && (
            <>
              <div>
                <h2 className="text-xl font-semibold text-slate-100">{editingCategoryId ? 'Modifica problema' : 'Nuovo problema'}</h2>
                <p className="text-sm text-slate-400">Aggiungi o modifica una tipologia di problema.</p>
              </div>
              <div>
                <label className="text-sm text-slate-300">Nome</label>
                <input value={categoryForm.name} onChange={(e) => setCategoryForm((c) => ({ ...c, name: e.target.value }))} placeholder="Nome problema" className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
              </div>
              <div>
                <label className="text-sm text-slate-300">Descrizione</label>
                <textarea value={categoryForm.description} onChange={(e) => setCategoryForm((c) => ({ ...c, description: e.target.value }))} rows={3} placeholder="Descrizione (opzionale)" className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="rounded-2xl bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-sky-400 transition" onClick={submitCategory}>{editingCategoryId ? 'Salva modifiche' : 'Aggiungi problema'}</button>
                {editingCategoryId && <button type="button" className="rounded-2xl border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800 transition" onClick={cancelEditCategory}>Annulla</button>}
              </div>
            </>
          )}

          {activeTab === 'cause' && (
            <>
              <div>
                <h2 className="text-xl font-semibold text-slate-100">{editingCategoryId ? 'Modifica causa' : 'Nuova causa'}</h2>
                <p className="text-sm text-slate-400">Aggiungi o modifica una causa.</p>
              </div>
              <div>
                <label className="text-sm text-slate-300">Nome</label>
                <input value={categoryForm.name} onChange={(e) => setCategoryForm((c) => ({ ...c, name: e.target.value }))} placeholder="Nome causa" className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
              </div>
              <div>
                <label className="text-sm text-slate-300">Descrizione</label>
                <textarea value={categoryForm.description} onChange={(e) => setCategoryForm((c) => ({ ...c, description: e.target.value }))} rows={3} placeholder="Descrizione (opzionale)" className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="rounded-2xl bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-sky-400 transition" onClick={submitCategory}>{editingCategoryId ? 'Salva modifiche' : 'Aggiungi causa'}</button>
                {editingCategoryId && <button type="button" className="rounded-2xl border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800 transition" onClick={cancelEditCategory}>Annulla</button>}
              </div>
            </>
          )}

          {activeTab === 'macchine' && (
            <>
              <div>
                <h2 className="text-xl font-semibold text-slate-100">{editingMachineId ? 'Modifica macchina' : 'Nuova macchina'}</h2>
                <p className="text-sm text-slate-400">Aggiungi o modifica le macchine della linea.</p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <input value={machineForm.code} onChange={(e) => setMachineForm((c) => ({ ...c, code: e.target.value }))} placeholder="Codice macchina" className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
                <input value={machineForm.name} onChange={(e) => setMachineForm((c) => ({ ...c, name: e.target.value }))} placeholder="Nome macchina" className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
                <input value={machineForm.line} onChange={(e) => setMachineForm((c) => ({ ...c, line: e.target.value }))} placeholder="Linea" className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
                <input value={machineForm.tipologia} onChange={(e) => setMachineForm((c) => ({ ...c, tipologia: e.target.value }))} placeholder="Tipologia" className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="rounded-2xl bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-sky-400 transition" onClick={submitMachine}>{editingMachineId ? 'Salva modifiche' : 'Aggiungi macchina'}</button>
                {editingMachineId && <button type="button" className="rounded-2xl border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800 transition" onClick={cancelEditMachine}>Annulla</button>}
              </div>
            </>
          )}

          {activeTab === 'utenti' && (
            <>
              <div>
                <h2 className="text-xl font-semibold text-slate-100">Nuovo utente</h2>
                <p className="text-sm text-slate-400">Crea account per accesso al portale.</p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <input value={userForm.username} onChange={(e) => setUserForm((c) => ({ ...c, username: e.target.value }))} placeholder="Username" className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
                <input value={userForm.email} onChange={(e) => setUserForm((c) => ({ ...c, email: e.target.value }))} placeholder="Email" className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
                <input type="password" value={userForm.password} onChange={(e) => setUserForm((c) => ({ ...c, password: e.target.value }))} placeholder="Password" className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
                <select value={userForm.role} onChange={(e) => setUserForm((c) => ({ ...c, role: e.target.value }))} className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none">
                  <option value="user">Utente</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button type="button" className="w-full rounded-2xl bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 sm:w-auto hover:bg-sky-400 transition" onClick={submitUser}>Crea utente</button>
            </>
          )}

          {activeTab === 'ricambi' && (
            <>
              <div>
                <h2 className="text-xl font-semibold text-slate-100">{editingSparePartId ? 'Modifica ricambio' : 'Nuovo pezzo di ricambio'}</h2>
                <p className="text-sm text-slate-400">Aggiungi pezzi di ricambio collegati alle tipologie di macchine.</p>
              </div>
              <input value={sparePartForm.name} onChange={(e) => setSparePartForm((c) => ({ ...c, name: e.target.value }))} placeholder="Nome ricambio" className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
              <div>
                <span className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Tipologie Macchine Collegate</span>
                {availableTipologie.length === 0 ? (
                  <p className="text-sm text-slate-500 bg-slate-900/50 p-3 rounded-2xl border border-slate-800">Nessuna tipologia trovata.</p>
                ) : (
                  <div className="flex flex-wrap gap-2 p-3 rounded-2xl border border-slate-800 bg-slate-900/30">
                    {availableTipologie.map((t) => {
                      const isChecked = sparePartForm.tipologie.includes(t);
                      return (
                        <label key={t} className="flex items-center gap-2 cursor-pointer bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800 hover:bg-slate-800/80 transition select-none">
                          <input type="checkbox" checked={isChecked} onChange={(e) => {
                            setSparePartForm((c) => ({ ...c, tipologie: e.target.checked ? [...c.tipologie, t] : c.tipologie.filter((x) => x !== t) }));
                          }} className="accent-sky-500 h-4 w-4 cursor-pointer" />
                          <span className="text-sm text-slate-200">{t}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
              <textarea value={sparePartForm.description} onChange={(e) => setSparePartForm((c) => ({ ...c, description: e.target.value }))} rows={3} placeholder="Descrizione (opzionale)" className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
              <div className="flex flex-wrap gap-2">
                <button type="button" className="rounded-2xl bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-sky-400 transition" onClick={submitSparePart}>{editingSparePartId ? 'Salva modifiche' : 'Aggiungi ricambio'}</button>
                {editingSparePartId && <button type="button" className="rounded-2xl border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800 transition" onClick={cancelEditSparePart}>Annulla</button>}
              </div>
            </>
          )}

          {activeTab === 'soluzioni' && (
            <>
              <div>
                <h2 className="text-xl font-semibold text-slate-100">{editingSolutionId ? 'Modifica soluzione' : 'Nuova soluzione applicata'}</h2>
                <p className="text-sm text-slate-400">{editingSolutionId ? 'Modifica nome, descrizione o problema collegato.' : 'Aggiungi una soluzione applicata e collegala a un problema.'}</p>
              </div>

              <div>
                <label className="text-sm text-slate-300">Nome soluzione</label>
                <input
                  value={solutionForm.name}
                  onChange={(e) => setSolutionForm((c) => ({ ...c, name: e.target.value }))}
                  placeholder="Nome soluzione"
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none"
                />
              </div>

              <div>
                <label className="text-sm text-slate-300">Problema collegato <span className="text-slate-500">(opzionale)</span></label>
                <select
                  value={solutionForm.problem_id}
                  onChange={(e) => setSolutionForm((c) => ({ ...c, problem_id: e.target.value }))}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none"
                >
                  <option value="">— Nessun problema —</option>
                  {problems.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm text-slate-300">Descrizione <span className="text-slate-500">(opzionale)</span></label>
                <textarea
                  value={solutionForm.description}
                  onChange={(e) => setSolutionForm((c) => ({ ...c, description: e.target.value }))}
                  rows={4}
                  placeholder="Descrizione soluzione"
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" className="rounded-2xl bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-sky-400 transition" onClick={submitSolution}>
                  {editingSolutionId ? 'Salva modifiche' : 'Aggiungi soluzione'}
                </button>
                {editingSolutionId && (
                  <button type="button" className="rounded-2xl border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800 transition" onClick={cancelEditSolution}>
                    Annulla
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <div className="space-y-6 rounded-3xl bg-slate-950/95 p-5 shadow-xl shadow-slate-950/10 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-100">Elenco {listTitle}</h2>
            {loading && <span className="text-sm text-slate-500">Caricamento...</span>}
          </div>

          {activeTab === 'operatori' && (
            <div className="space-y-4">
              {operatori.map((op) => (
                <div key={op.id} className="flex flex-col gap-2 rounded-3xl border border-slate-800 bg-slate-900/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-semibold text-slate-100">{op.nome}</div>
                    <div className={`text-sm ${op.attivo ? 'text-emerald-400' : 'text-slate-500'}`}>{op.attivo ? 'Attivo' : 'Inattivo'}</div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="rounded-2xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700 transition" onClick={() => startEditOperatore(op)}>Modifica</button>
                    <DeleteButton itemId={op.id} usageCount={op.usage_count} type="operatori" onDelete={requestDelete} />
                  </div>
                </div>
              ))}
              {operatori.length === 0 && <p className="text-sm text-slate-500 italic text-center py-4">Nessun operatore configurato.</p>}
            </div>
          )}

          {activeTab === 'problemi' && (
            <div className="space-y-4">
              {problems.map((category) => (
                <div key={category.id} className="flex flex-col gap-2 rounded-3xl border border-slate-800 bg-slate-900/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-semibold text-slate-100">{category.name}</div>
                    <div className="text-sm text-slate-500">{category.description || 'Nessuna descrizione'}</div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="rounded-2xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700 transition" onClick={() => startEditCategory(category)}>Modifica</button>
                    <DeleteButton itemId={category.id} usageCount={category.usage_count} type="categories" onDelete={requestDelete} />
                  </div>
                </div>
              ))}
              {problems.length === 0 && <p className="text-sm text-slate-500 italic text-center py-4">Nessun problema configurato.</p>}
            </div>
          )}

          {activeTab === 'cause' && (
            <div className="space-y-4">
              {causes.map((category) => (
                <div key={category.id} className="flex flex-col gap-2 rounded-3xl border border-slate-800 bg-slate-900/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-semibold text-slate-100">{category.name}</div>
                    <div className="text-sm text-slate-500">{category.description || 'Nessuna descrizione'}</div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="rounded-2xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700 transition" onClick={() => startEditCategory(category)}>Modifica</button>
                    <DeleteButton itemId={category.id} usageCount={category.usage_count} type="categories" onDelete={requestDelete} />
                  </div>
                </div>
              ))}
              {causes.length === 0 && <p className="text-sm text-slate-500 italic text-center py-4">Nessuna causa configurata.</p>}
            </div>
          )}

          {activeTab === 'macchine' && (
            <div className="space-y-4">
              {machines.sort((a, b) => a.name.localeCompare(b.name)).map((machine) => (
                <div key={machine.id} className="flex flex-col gap-2 rounded-3xl border border-slate-800 bg-slate-900/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-semibold text-slate-100">{machine.code} - {machine.name}</div>
                    <div className="text-sm text-slate-500">{machine.line || 'Linea N/D'} · Tipologia: {machine.tipologia || 'Non specificata'}</div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="rounded-2xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700 transition" onClick={() => startEditMachine(machine)}>Modifica</button>
                    <DeleteButton itemId={machine.id} usageCount={machine.usage_count} type="machines" onDelete={requestDelete} />
                  </div>
                </div>
              ))}
              {machines.length === 0 && <p className="text-sm text-slate-500 italic text-center py-4">Nessuna macchina configurata.</p>}
            </div>
          )}

          {activeTab === 'utenti' && (
            <div className="space-y-4">
              {editingUser && (
                <div className="rounded-3xl border border-sky-500/30 bg-sky-500/5 p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-sky-300">Modifica utente: {editingUser.username}</h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <input value={userEditForm.username} onChange={(e) => setUserEditForm((c) => ({ ...c, username: e.target.value }))} placeholder="Username" className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
                    <input value={userEditForm.email} onChange={(e) => setUserEditForm((c) => ({ ...c, email: e.target.value }))} placeholder="Email" className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
                    <input type="password" value={userEditForm.password} onChange={(e) => setUserEditForm((c) => ({ ...c, password: e.target.value }))} placeholder="Nuova password (opzionale)" className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none sm:col-span-2" />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="rounded-2xl bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400 transition" onClick={submitUserEdit}>Salva</button>
                    <button type="button" className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800 transition" onClick={cancelEditUser}>Annulla</button>
                  </div>
                </div>
              )}
              {users.map((userItem) => (
                <div key={userItem.id} className="flex flex-col gap-2 rounded-3xl border border-slate-800 bg-slate-900/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-semibold text-slate-100">{userItem.username}</div>
                    <div className="text-sm text-slate-500">{userItem.email || 'Email non fornita'} · ruolo: {userItem.role}</div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="rounded-2xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700 transition" onClick={() => startEditUser(userItem)}>Modifica</button>
                    <DeleteButton itemId={userItem.id} type="users" onDelete={requestDelete} />
                  </div>
                </div>
              ))}
              {users.length === 0 && <p className="text-sm text-slate-500 italic text-center py-4">Nessun utente.</p>}
            </div>
          )}

          {activeTab === 'ricambi' && (
            <div className="space-y-4">
              {spareParts.map((part) => (
                <div key={part.id} className="flex flex-col gap-2 rounded-3xl border border-slate-800 bg-slate-900/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-semibold text-slate-100">{part.name}</div>
                    <div className="text-sm text-slate-500">{(part.tipologie || part.tipologia || []).join(', ') || 'Nessuna tipologia'} · {part.description || 'Nessuna descrizione'}</div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="rounded-2xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700 transition" onClick={() => startEditSparePart(part)}>Modifica</button>
                    <DeleteButton itemId={part.id} usageCount={part.usage_count} type="spare_parts" onDelete={requestDelete} />
                  </div>
                </div>
              ))}
              {spareParts.length === 0 && <p className="text-sm text-slate-500 italic text-center py-4">Nessun ricambio configurato.</p>}
            </div>
          )}

          {activeTab === 'soluzioni' && (
            <div className="space-y-4">
              {solutionsApplied.map((sol) => (
                <div key={sol.id} className="flex flex-col gap-2 rounded-3xl border border-slate-800 bg-slate-900/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-100">{sol.name}</div>
                    <div className="text-sm text-slate-500">
                      {sol.problem_name
                        ? <span className="text-sky-400/80">↳ {sol.problem_name}</span>
                        : <span>Nessun problema collegato</span>}
                      {sol.description && <span className="ml-2">· {sol.description}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      className="rounded-2xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700 transition"
                      onClick={() => startEditSolution(sol)}
                    >
                      Modifica
                    </button>
                    <DeleteButton itemId={sol.id} usageCount={sol.usage_count} type="solutions" onDelete={requestDelete} />
                  </div>
                </div>
              ))}
              {solutionsApplied.length === 0 && <p className="text-sm text-slate-500 italic text-center py-4">Nessuna soluzione configurata.</p>}
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirmOpen}
        title="Conferma eliminazione"
        message="Sei sicuro di voler eliminare questo elemento?"
        confirmText="Elimina"
        cancelText="Annulla"
        danger
        onCancel={() => { setConfirmOpen(false); setPendingDeleteId(null); setPendingDeleteType(null); }}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
