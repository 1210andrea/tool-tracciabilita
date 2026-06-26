import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

const API_URL = '/api';

/** Normalizza qualsiasi risposta del backend in un array sicuro */
function toArr<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.items)) return d.items as T[];
    if (Array.isArray(d.data))  return d.data  as T[];
  }
  return [];
}

type Category = { id: string; name: string; type: string; description?: string; problem_id?: string; problem_ids?: string[]; usage_count?: number };
type Machine = { id: string; code: string; name: string; line?: string; tipologia?: string; type?: string; usage_count?: number };
type User = { id: string; username: string; email?: string; role: string };
type SparePart = { id: string; name: string; codice?: string; tipologia?: string; description?: string; scorta_minima?: number; quantita_riordino?: number; quantita?: number; usage_count?: number };
type SolutionApplied = { id: string; name: string; description?: string; problem_ids?: string[] };
type Operatore = { id: string; nome: string; attivo: boolean };

type DeleteButtonProps = {
  itemId: string;
  usageCount?: number;
  type: 'categories' | 'machines' | 'users' | 'spare_parts' | 'solutions' | 'operatori';
  onDelete: (type: 'categories' | 'machines' | 'users' | 'spare_parts' | 'solutions' | 'operatori', id: string) => void;
};

function DeleteButton({ itemId, usageCount, type, onDelete }: DeleteButtonProps) {
  const [confirm, setConfirm] = useState(false);
  if (confirm) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-red-400">Sicuro?</span>
        <button type="button" className="rounded-xl bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-400 transition" onClick={() => onDelete(type, itemId)}>Sì, elimina</button>
        <button type="button" className="rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition" onClick={() => setConfirm(false)}>Annulla</button>
      </div>
    );
  }
  return (
    <button type="button" className="rounded-2xl bg-red-500/80 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 transition" onClick={() => setConfirm(true)}>
      {usageCount ? `Elimina (${usageCount} casi)` : 'Elimina'}
    </button>
  );
}

export default function AdminPanel() {
  const { token } = useAuth();
  const headers = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);

  const [activeTab, setActiveTab] = useState<'operatori' | 'problemi' | 'cause' | 'macchine' | 'utenti' | 'ricambi' | 'soluzioni'>('operatori');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'error' | 'info'>('info');

  const [categories, setCategories] = useState<Category[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [spareParts, setSpareParts] = useState<SparePart[]>([]);
  const [solutions, setSolutions] = useState<SolutionApplied[]>([]);
  const [operatori, setOperatori] = useState<Operatore[]>([]);
  const [availableTipologie, setAvailableTipologie] = useState<string[]>([]);

  const [machineForm, setMachineForm] = useState({ code: '', name: '', line: '', tipologia: '' });
  const [editingMachineId, setEditingMachineId] = useState<string | null>(null);

  const [sparePartForm, setSparePartForm] = useState({ name: '', codice: '', tipologia: '', scorta_minima: 1, quantita_riordino: 10, description: '', quantita: 0 });
  const [editingSparePartId, setEditingSparePartId] = useState<string | null>(null);

  const [categoryForm, setCategoryForm] = useState({ type: 'problem' as 'problem' | 'cause', name: '', description: '', problem_id: '', problem_ids: [] as string[] });
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);

  const [userForm, setUserForm] = useState({ username: '', email: '', password: '', role: 'user' });
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userEditForm, setUserEditForm] = useState({ username: '', email: '', password: '' });

  const [solutionForm, setSolutionForm] = useState({ name: '', description: '', problem_ids: [] as string[] });
  const [editingSolutionId, setEditingSolutionId] = useState<string | null>(null);

  const [operatoreForm, setOperatoreForm] = useState({ nome: '', attivo: true });
  const [editingOperatoreId, setEditingOperatoreId] = useState<string | null>(null);

  const [pendingDeleteType, setPendingDeleteType] = useState<'categories' | 'machines' | 'users' | 'spare_parts' | 'solutions' | 'operatori' | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const problems = useMemo(() => (Array.isArray(categories) ? categories : []).filter((c) => c.type === 'problem'), [categories]);

  const showMessage = (msg: string, type: 'error' | 'info' = 'info') => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(''), 5000);
  };

  const loadAll = async () => {
    try {
      const entries = [
        { key: 'categories' as const,  promise: axios.get(`${API_URL}/categories`, headers) },
        { key: 'machines' as const,    promise: axios.get(`${API_URL}/machines`, headers) },
        { key: 'users' as const,       promise: axios.get(`${API_URL}/users`, headers) },
        { key: 'spare_parts' as const, promise: axios.get(`${API_URL}/spare-parts`, headers) },
        { key: 'solutions' as const,   promise: axios.get(`${API_URL}/solutions-applied`, headers) },
        { key: 'operatori' as const,   promise: axios.get(`${API_URL}/operatori`, headers) },
        { key: 'tipologie' as const,   promise: axios.get(`${API_URL}/machines/tipologie`, headers) },
      ];

      const results = await Promise.allSettled(entries.map((e) => e.promise));
      const errors: string[] = [];

      results.forEach((result, idx) => {
        const key = entries[idx].key;
        if (result.status === 'fulfilled') {
          const raw = result.value.data;
          if (key === 'categories')       setCategories(toArr<Category>(raw));
          else if (key === 'machines')    setMachines(toArr<Machine>(raw));
          else if (key === 'users')       setUsers(toArr<User>(raw));
          else if (key === 'spare_parts') setSpareParts(toArr<SparePart>(raw));
          else if (key === 'solutions')   setSolutions(toArr<SolutionApplied>(raw));
          else if (key === 'operatori')   setOperatori(toArr<Operatore>(raw));
          else if (key === 'tipologie')   setAvailableTipologie(toArr<string>(raw));
        } else {
          if (key !== 'tipologie') {
            const msg = (result.reason as any)?.response?.data?.error ?? (result.reason as any)?.message ?? key;
            errors.push(msg);
          }
        }
      });

      if (errors.length) {
        showMessage(`Alcuni dati non sono stati caricati: ${errors.join('; ')}`, 'error');
      }
    } catch (err: any) {
      showMessage(err?.response?.data?.error ?? 'Errore caricamento dati dal database.', 'error');
    }
  };

  useEffect(() => { loadAll(); }, [token]);

  useEffect(() => {
    if (activeTab === 'problemi') setCategoryForm((c) => ({ ...c, type: 'problem' }));
    else if (activeTab === 'cause') setCategoryForm((c) => ({ ...c, type: 'cause' }));
  }, [activeTab]);

  useEffect(() => {
    setEditingCategoryId(null); setEditingMachineId(null); setEditingSparePartId(null);
    setEditingOperatoreId(null); setEditingSolutionId(null);
    setCategoryForm((c) => ({ type: activeTab === 'cause' ? 'cause' : 'problem', name: '', description: '', problem_id: '', problem_ids: [] }));
    setMachineForm({ code: '', name: '', line: '', tipologia: '' });
    setSparePartForm({ name: '', codice: '', tipologia: '', scorta_minima: 1, quantita_riordino: 10, description: '', quantita: 0 });
    setSolutionForm({ name: '', description: '', problem_ids: [] });
    setOperatoreForm({ nome: '', attivo: true });
  }, [activeTab]);

  // ── helpers utenti ──────────────────────────────────────────────────────
  const startEditUser = (user: User) => { setEditingUser(user); setUserEditForm({ username: user.username, email: user.email || '', password: '' }); };
  const cancelEditUser = () => { setEditingUser(null); setUserEditForm({ username: '', email: '', password: '' }); };
  const submitUserEdit = async () => {
    if (!editingUser) return;
    try {
      const payload: any = {};
      if (userEditForm.username) payload.username = userEditForm.username;
      if (userEditForm.email)    payload.email    = userEditForm.email;
      if (userEditForm.password) payload.password = userEditForm.password;
      if (!Object.keys(payload).length) { showMessage('Nessun campo da aggiornare.'); return; }
      await axios.put(`${API_URL}/users/${editingUser.id}`, payload, headers);
      showMessage('Utente aggiornato.'); cancelEditUser(); loadAll();
    } catch (err: any) { showMessage(err?.response?.data?.error ?? 'Errore aggiornamento utente.', 'error'); }
  };

  // ── helpers operatori ───────────────────────────────────────────────────
  const submitOperatore = async () => {
    try {
      if (!operatoreForm.nome.trim()) { showMessage('Il nome operatore è obbligatorio.', 'error'); return; }
      if (editingOperatoreId) {
        await axios.put(`${API_URL}/operatori/${editingOperatoreId}`, operatoreForm, headers);
        showMessage('Operatore aggiornato.');
      } else {
        await axios.post(`${API_URL}/operatori`, operatoreForm, headers);
        showMessage('Operatore creato.');
      }
      setOperatoreForm({ nome: '', attivo: true }); setEditingOperatoreId(null); loadAll();
    } catch (err: any) { showMessage(err?.response?.data?.error ?? 'Errore salvataggio operatore.', 'error'); }
  };
  const startEditOperatore = (op: Operatore) => { setEditingOperatoreId(op.id); setOperatoreForm({ nome: op.nome, attivo: op.attivo }); };
  const cancelEditOperatore = () => { setEditingOperatoreId(null); setOperatoreForm({ nome: '', attivo: true }); };

  // ── helpers categorie ───────────────────────────────────────────────────
  const toggleCauseProblem = (pid: string) => {
    setCategoryForm((c) => ({
      ...c,
      problem_ids: c.problem_ids.includes(pid)
        ? c.problem_ids.filter((x) => x !== pid)
        : [...c.problem_ids, pid],
    }));
  };

  const submitCategory = async () => {
    try {
      if (categoryForm.type === 'cause' && categoryForm.problem_ids.length === 0) {
        showMessage('Seleziona almeno un problema collegato per la causa.', 'error'); return;
      }
      const payload: any = {
        type: categoryForm.type,
        name: categoryForm.name,
        description: categoryForm.description || null,
      };
      if (categoryForm.type === 'cause') {
        payload.problem_ids = categoryForm.problem_ids;
        payload.problem_id = categoryForm.problem_ids[0] ?? null;
      } else {
        payload.problem_id = null;
      }
      if (editingCategoryId) {
        await axios.put(`${API_URL}/categories/${editingCategoryId}`, payload, headers);
        showMessage('Aggiornato.');
      } else {
        await axios.post(`${API_URL}/categories`, payload, headers);
        showMessage('Creato.');
      }
      setCategoryForm((prev) => ({ type: prev.type, name: '', description: '', problem_id: '', problem_ids: [] }));
      setEditingCategoryId(null); loadAll();
    } catch (err: any) { showMessage(err?.response?.data?.error ?? 'Errore salvataggio.', 'error'); }
  };
  const startEditCategory = (cat: Category) => {
    setEditingCategoryId(cat.id);
    setCategoryForm({
      type: cat.type as 'problem' | 'cause',
      name: cat.name,
      description: cat.description || '',
      problem_id: cat.problem_id || '',
      problem_ids: cat.problem_ids || (cat.problem_id ? [cat.problem_id] : []),
    });
  };
  const cancelEditCategory = () => { setEditingCategoryId(null); setCategoryForm((c) => ({ ...c, name: '', description: '', problem_id: '', problem_ids: [] })); };

  // ── helpers macchine ────────────────────────────────────────────────────
  const submitMachine = async () => {
    try {
      const payload = { ...machineForm, tipologia: machineForm.tipologia || undefined };
      if (editingMachineId) {
        await axios.put(`${API_URL}/machines/${editingMachineId}`, payload, headers);
        showMessage('Macchina aggiornata.');
      } else {
        await axios.post(`${API_URL}/machines`, payload, headers);
        showMessage('Macchina aggiunta.');
      }
      setMachineForm({ code: '', name: '', line: '', tipologia: '' }); setEditingMachineId(null); loadAll();
    } catch (err: any) { showMessage(err?.response?.data?.error ?? 'Errore salvataggio macchina.', 'error'); }
  };
  const startEditMachine = (m: Machine) => { setEditingMachineId(m.id); setMachineForm({ code: m.code, name: m.name, line: m.line || '', tipologia: m.tipologia || m.type || '' }); };
  const cancelEditMachine = () => { setEditingMachineId(null); setMachineForm({ code: '', name: '', line: '', tipologia: '' }); };

  // ── helpers ricambi ─────────────────────────────────────────────────────
  const submitSparePart = async () => {
    try {
      if (!sparePartForm.name.trim()) { showMessage('Il nome ricambio è obbligatorio.', 'error'); return; }
      const payload = {
        name: sparePartForm.name.trim(),
        codice: sparePartForm.codice.trim() || null,
        tipologia: sparePartForm.tipologia.trim() || null,
        description: sparePartForm.description.trim() || null,
        scorta_minima: sparePartForm.scorta_minima,
        quantita_riordino: sparePartForm.quantita_riordino,
        quantita: sparePartForm.quantita,
      };
      if (editingSparePartId) {
        await axios.put(`${API_URL}/spare-parts/${editingSparePartId}`, payload, headers);
        showMessage('Ricambio aggiornato.');
      } else {
        await axios.post(`${API_URL}/spare-parts`, payload, headers);
        showMessage('Ricambio aggiunto.');
      }
      setSparePartForm({ name: '', codice: '', tipologia: '', scorta_minima: 1, quantita_riordino: 10, description: '', quantita: 0 });
      setEditingSparePartId(null); loadAll();
    } catch (err: any) { showMessage(err?.response?.data?.error ?? 'Errore salvataggio ricambio.', 'error'); }
  };
  const startEditSparePart = (part: SparePart) => {
    setEditingSparePartId(part.id);
    setSparePartForm({ name: part.name, codice: part.codice || '', tipologia: part.tipologia || '', scorta_minima: part.scorta_minima ?? 1, quantita_riordino: part.quantita_riordino ?? 10, description: part.description || '', quantita: part.quantita ?? 0 });
  };
  const cancelEditSparePart = () => { setEditingSparePartId(null); setSparePartForm({ name: '', codice: '', tipologia: '', scorta_minima: 1, quantita_riordino: 10, description: '', quantita: 0 }); };

  // ── helpers soluzioni ───────────────────────────────────────────────────
  const toggleSolutionProblem = (pid: string) => {
    setSolutionForm((c) => ({
      ...c,
      problem_ids: c.problem_ids.includes(pid)
        ? c.problem_ids.filter((x) => x !== pid)
        : [...c.problem_ids, pid],
    }));
  };
  const submitSolution = async () => {
    try {
      if (!solutionForm.name.trim()) { showMessage('Il nome soluzione è obbligatorio.', 'error'); return; }
      const payload = {
        name: solutionForm.name.trim(),
        description: solutionForm.description.trim() || null,
        problem_ids: solutionForm.problem_ids,
      };
      if (editingSolutionId) {
        await axios.put(`${API_URL}/solutions-applied/${editingSolutionId}`, payload, headers);
        showMessage('Soluzione aggiornata.');
      } else {
        await axios.post(`${API_URL}/solutions-applied`, payload, headers);
        showMessage('Soluzione aggiunta.');
      }
      setSolutionForm({ name: '', description: '', problem_ids: [] });
      setEditingSolutionId(null); loadAll();
    } catch (err: any) { showMessage(err?.response?.data?.error ?? 'Errore salvataggio soluzione.', 'error'); }
  };
  const startEditSolution = (sol: SolutionApplied) => {
    setEditingSolutionId(sol.id);
    setSolutionForm({ name: sol.name, description: sol.description || '', problem_ids: sol.problem_ids || [] });
  };
  const cancelEditSolution = () => { setEditingSolutionId(null); setSolutionForm({ name: '', description: '', problem_ids: [] }); };

  // ── helpers delete ──────────────────────────────────────────────────────
  const submitUser = async () => {
    try {
      await axios.post(`${API_URL}/users`, userForm, headers);
      showMessage('Utente creato.'); setUserForm({ username: '', email: '', password: '', role: 'user' }); loadAll();
    } catch (err: any) { showMessage(err?.response?.data?.error ?? 'Errore salvataggio utente.', 'error'); }
  };
  const deleteItem = async (type: 'categories' | 'machines' | 'users' | 'spare_parts' | 'solutions' | 'operatori', id: string) => {
    try {
      const path = type === 'spare_parts' ? 'spare-parts' : type === 'solutions' ? 'solutions-applied' : type === 'operatori' ? 'operatori' : type;
      await axios.delete(`${API_URL}/${path}/${id}`, headers);
      showMessage('Elemento eliminato.'); loadAll();
    } catch (err: any) {
      const usage = err?.response?.data?.usage_count;
      showMessage(err?.response?.data?.error ?? (usage ? `In uso da ${usage} casi` : 'Eliminazione non consentita.'), 'error');
    }
  };
  const requestDelete = (type: 'categories' | 'machines' | 'users' | 'spare_parts' | 'solutions' | 'operatori', id: string) => {
    setPendingDeleteType(type); setPendingDeleteId(id);
  };
  const confirmDelete = async () => {
    if (!pendingDeleteType || !pendingDeleteId) return;
    await deleteItem(pendingDeleteType, pendingDeleteId);
    setPendingDeleteType(null); setPendingDeleteId(null);
  };
  const cancelDelete = () => { setPendingDeleteType(null); setPendingDeleteId(null); };

  const tabs = [
    { key: 'operatori', label: 'Operatori' },
    { key: 'problemi',  label: 'Problemi' },
    { key: 'cause',     label: 'Cause' },
    { key: 'macchine',  label: 'Macchine' },
    { key: 'utenti',    label: 'Utenti' },
    { key: 'ricambi',   label: 'Pezzi di Ricambio' },
    { key: 'soluzioni', label: 'Soluzioni' },
  ] as const;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-100">Admin Panel</h1>
          <p className="mt-1 text-slate-400">Gestisci operatori, problemi, cause, macchine, utenti, ricambi e soluzioni.</p>
        </div>

        {message && (
          <div className={`mb-6 rounded-2xl px-5 py-4 text-sm font-medium flex items-center justify-between gap-4 ${messageType === 'error' ? 'bg-red-900/40 text-red-300 border border-red-700/40' : 'bg-sky-900/40 text-sky-300 border border-sky-700/40'}`}>
            <span>{message}</span>
          </div>
        )}

        {/* Pending delete modal */}
        {pendingDeleteType && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 max-w-sm w-full mx-4 shadow-2xl">
              <h3 className="text-lg font-bold text-slate-100 mb-2">Conferma eliminazione</h3>
              <p className="text-slate-400 text-sm mb-6">Questa azione è irreversibile. Continuare?</p>
              <div className="flex gap-3">
                <button type="button" className="flex-1 rounded-2xl bg-red-500 py-3 text-sm font-semibold text-white hover:bg-red-400 transition" onClick={confirmDelete}>Elimina</button>
                <button type="button" className="flex-1 rounded-2xl border border-slate-700 py-3 text-sm font-semibold text-slate-300 hover:bg-slate-800 transition" onClick={cancelDelete}>Annulla</button>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-8">
          {tabs.map((t) => (
            <button key={t.key} type="button"
              className={`rounded-full px-5 py-2 text-sm font-semibold transition ${activeTab === t.key ? 'bg-sky-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
              onClick={() => setActiveTab(t.key)}>{t.label}</button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* ── LEFT: form ── */}
          <div className="flex flex-col gap-5 rounded-3xl border border-slate-800 bg-slate-900/60 p-6">

            {activeTab === 'operatori' && (
              <>
                <div>
                  <h2 className="text-xl font-semibold text-slate-100">{editingOperatoreId ? 'Modifica operatore' : 'Nuovo operatore'}</h2>
                  <p className="text-sm text-slate-400">Gestisci gli operatori.</p>
                </div>
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Nome operatore</label>
                  <input value={operatoreForm.nome} onChange={(e) => setOperatoreForm((c) => ({ ...c, nome: e.target.value }))} placeholder="Nome operatore" className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
                </div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={operatoreForm.attivo} onChange={(e) => setOperatoreForm((c) => ({ ...c, attivo: e.target.checked }))} className="accent-sky-500 h-4 w-4" />
                  <span className="text-sm text-slate-300">Attivo</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="rounded-2xl bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-sky-400 transition" onClick={submitOperatore}>{editingOperatoreId ? 'Salva modifiche' : 'Aggiungi operatore'}</button>
                  {editingOperatoreId && <button type="button" className="rounded-2xl border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800 transition" onClick={cancelEditOperatore}>Annulla</button>}
                </div>
              </>
            )}

            {(activeTab === 'problemi' || activeTab === 'cause') && (
              <>
                <div>
                  <h2 className="text-xl font-semibold text-slate-100">{editingCategoryId ? 'Modifica' : activeTab === 'problemi' ? 'Nuovo problema' : 'Nuova causa'}</h2>
                  <p className="text-sm text-slate-400">Aggiungi o modifica una tipologia di problema.</p>
                </div>
                <input value={categoryForm.name} onChange={(e) => setCategoryForm((c) => ({ ...c, name: e.target.value }))} placeholder="Nome" className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
                <textarea value={categoryForm.description} onChange={(e) => setCategoryForm((c) => ({ ...c, description: e.target.value }))} rows={2} placeholder="Descrizione (opzionale)" className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
                {activeTab === 'cause' && (
                  <div>
                    <span className="block text-sm text-slate-300 mb-2">Problemi collegati <span className="text-slate-500">(selezione multipla)</span></span>
                    {problems.length === 0
                      ? <p className="text-sm text-slate-500 bg-slate-900/50 p-3 rounded-2xl border border-slate-800">Nessun problema configurato.</p>
                      : (
                        <div className="flex flex-wrap gap-2 p-3 rounded-2xl border border-slate-800 bg-slate-900/30">
                          {problems.map((p) => (
                            <label key={p.id} className="flex items-center gap-2 cursor-pointer bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800 hover:bg-slate-800/80 transition select-none">
                              <input type="checkbox" checked={categoryForm.problem_ids.includes(p.id)} onChange={() => toggleCauseProblem(p.id)} className="accent-sky-500 h-4 w-4 cursor-pointer" />
                              <span className="text-sm text-slate-200">{p.name}</span>
                            </label>
                          ))}
                        </div>
                      )}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="rounded-2xl bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-sky-400 transition" onClick={submitCategory}>{editingCategoryId ? 'Salva modifiche' : 'Aggiungi'}</button>
                  {editingCategoryId && <button type="button" className="rounded-2xl border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800 transition" onClick={cancelEditCategory}>Annulla</button>}
                </div>
              </>
            )}

            {activeTab === 'macchine' && (
              <>
                <div>
                  <h2 className="text-xl font-semibold text-slate-100">{editingMachineId ? 'Modifica macchina' : 'Nuova macchina'}</h2>
                  <p className="text-sm text-slate-400">Aggiungi o modifica una macchina.</p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <input value={machineForm.code} onChange={(e) => setMachineForm((c) => ({ ...c, code: e.target.value }))} placeholder="Codice *" className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
                  <input value={machineForm.name} onChange={(e) => setMachineForm((c) => ({ ...c, name: e.target.value }))} placeholder="Nome" className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
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
                    <option value="magazziniere">Magazziniere</option>
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
                  <p className="text-sm text-slate-400">Gestisci l&apos;anagrafica dei pezzi di ricambio per il magazzino.</p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <input value={sparePartForm.name} onChange={(e) => setSparePartForm((c) => ({ ...c, name: e.target.value }))} placeholder="Nome ricambio *" className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
                  <input value={sparePartForm.codice} onChange={(e) => setSparePartForm((c) => ({ ...c, codice: e.target.value }))} placeholder="Codice articolo (opzionale)" className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
                  <input value={sparePartForm.tipologia} onChange={(e) => setSparePartForm((c) => ({ ...c, tipologia: e.target.value }))} placeholder="Tipologia (es. Cinghia, Filtro...)" className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
                  <textarea value={sparePartForm.description} onChange={(e) => setSparePartForm((c) => ({ ...c, description: e.target.value }))} rows={1} placeholder="Descrizione (opzionale)" className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none resize-none" />
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Scorta minima</label>
                    <input type="number" min={0} value={sparePartForm.scorta_minima} onChange={(e) => setSparePartForm((c) => ({ ...c, scorta_minima: Number(e.target.value) }))} className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Giacenza attuale</label>
                    <input type="number" min={0} value={sparePartForm.quantita} onChange={(e) => setSparePartForm((c) => ({ ...c, quantita: Number(e.target.value) }))} className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Quantità riordino</label>
                    <input type="number" min={1} value={sparePartForm.quantita_riordino} onChange={(e) => setSparePartForm((c) => ({ ...c, quantita_riordino: Number(e.target.value) }))} className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
                  </div>
                </div>
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
                  <p className="text-sm text-slate-400">Collega la soluzione a uno o più problemi.</p>
                </div>
                <div>
                  <label className="text-sm text-slate-300">Nome soluzione</label>
                  <input value={solutionForm.name} onChange={(e) => setSolutionForm((c) => ({ ...c, name: e.target.value }))} placeholder="Nome soluzione" className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
                </div>
                <div>
                  <span className="block text-sm text-slate-300 mb-2">
                    Problemi collegati <span className="text-slate-500">(opzionale, selezione multipla)</span>
                  </span>
                  {problems.length === 0
                    ? <p className="text-sm text-slate-500 bg-slate-900/50 p-3 rounded-2xl border border-slate-800">Nessun problema configurato.</p>
                    : (
                      <div className="flex flex-wrap gap-2 p-3 rounded-2xl border border-slate-800 bg-slate-900/30">
                        {problems.map((p) => (
                          <label key={p.id} className="flex items-center gap-2 cursor-pointer bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800 hover:bg-slate-800/80 transition select-none">
                            <input type="checkbox" checked={solutionForm.problem_ids.includes(p.id)} onChange={() => toggleSolutionProblem(p.id)} className="accent-sky-500 h-4 w-4 cursor-pointer" />
                            <span className="text-sm text-slate-200">{p.name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                </div>
                <textarea value={solutionForm.description} onChange={(e) => setSolutionForm((c) => ({ ...c, description: e.target.value }))} rows={3} placeholder="Descrizione (opzionale)" className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="rounded-2xl bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-sky-400 transition" onClick={submitSolution}>{editingSolutionId ? 'Salva modifiche' : 'Aggiungi soluzione'}</button>
                  {editingSolutionId && <button type="button" className="rounded-2xl border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800 transition" onClick={cancelEditSolution}>Annulla</button>}
                </div>
              </>
            )}
          </div>

          {/* ── RIGHT: list ── */}
          <div className="flex flex-col gap-3 rounded-3xl border border-slate-800 bg-slate-900/60 p-6 overflow-y-auto max-h-[70vh]">

            {activeTab === 'operatori' && (
              <>
                <h3 className="text-lg font-semibold text-slate-100 mb-1">Elenco operatori</h3>
                {operatori.length === 0 && <p className="text-sm text-slate-500">Nessun operatore.</p>}
                {operatori.map((op) => (
                  <div key={op.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                    <div>
                      <div className="font-semibold text-slate-100">{op.nome}</div>
                      <div className={`text-sm ${op.attivo ? 'text-emerald-400' : 'text-slate-500'}`}>{op.attivo ? 'Attivo' : 'Inattivo'}</div>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" className="rounded-2xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700 transition" onClick={() => startEditOperatore(op)}>Modifica</button>
                      <DeleteButton itemId={op.id} type="operatori" onDelete={requestDelete} />
                    </div>
                  </div>
                ))}
              </>
            )}

            {activeTab === 'problemi' && (
              <>
                <h3 className="text-lg font-semibold text-slate-100 mb-1">Elenco problemi</h3>
                {problems.length === 0 && <p className="text-sm text-slate-500">Nessun problema.</p>}
                {problems.map((cat) => (
                  <div key={cat.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                    <div>
                      <div className="font-semibold text-slate-100">{cat.name}</div>
                      <div className="text-sm text-slate-500">{cat.description || 'Nessuna descrizione'}</div>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" className="rounded-2xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700 transition" onClick={() => startEditCategory(cat)}>Modifica</button>
                      <DeleteButton itemId={cat.id} usageCount={cat.usage_count} type="categories" onDelete={requestDelete} />
                    </div>
                  </div>
                ))}
              </>
            )}

            {activeTab === 'cause' && (
              <>
                <h3 className="text-lg font-semibold text-slate-100 mb-1">Elenco cause</h3>
                {categories.filter((c) => c.type === 'cause').length === 0 && <p className="text-sm text-slate-500">Nessuna causa.</p>}
                {categories.filter((c) => c.type === 'cause').map((cat) => (
                  <div key={cat.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                    <div>
                      <div className="font-semibold text-slate-100">{cat.name}</div>
                      <div className="text-sm text-slate-500">{cat.description || 'Nessuna descrizione'}</div>
                      {cat.problem_ids && cat.problem_ids.length > 0 && (
                        <div className="text-xs text-sky-400 mt-1">
                          Collegata a: {cat.problem_ids.map(pid => problems.find(p => p.id === pid)?.name).filter(Boolean).join(', ')}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button type="button" className="rounded-2xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700 transition" onClick={() => startEditCategory(cat)}>Modifica</button>
                      <DeleteButton itemId={cat.id} usageCount={cat.usage_count} type="categories" onDelete={requestDelete} />
                    </div>
                  </div>
                ))}
              </>
            )}

            {activeTab === 'macchine' && (
              <>
                <h3 className="text-lg font-semibold text-slate-100 mb-1">Elenco macchine</h3>
                {machines.length === 0 && <p className="text-sm text-slate-500">Nessuna macchina.</p>}
                {machines.map((machine) => (
                  <div key={machine.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                    <div>
                      <div className="font-semibold text-slate-100">{machine.code} — {machine.name}</div>
                      <div className="text-sm text-slate-500">{machine.line || 'Linea N/D'} · Tipologia: {machine.tipologia || 'Non specificata'}</div>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" className="rounded-2xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700 transition" onClick={() => startEditMachine(machine)}>Modifica</button>
                      <DeleteButton itemId={machine.id} usageCount={machine.usage_count} type="machines" onDelete={requestDelete} />
                    </div>
                  </div>
                ))}
              </>
            )}

            {activeTab === 'utenti' && (
              <>
                <h3 className="text-lg font-semibold text-slate-100 mb-1">Elenco utenti</h3>
                {users.length === 0 && <p className="text-sm text-slate-500">Nessun utente.</p>}
                {users.map((user) => (
                  <div key={user.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                    {editingUser?.id === user.id ? (
                      <div className="flex flex-col gap-3">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <input value={userEditForm.username} onChange={(e) => setUserEditForm((c) => ({ ...c, username: e.target.value }))} placeholder="Username" className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none" />
                          <input value={userEditForm.email} onChange={(e) => setUserEditForm((c) => ({ ...c, email: e.target.value }))} placeholder="Email" className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none" />
                          <input type="password" value={userEditForm.password} onChange={(e) => setUserEditForm((c) => ({ ...c, password: e.target.value }))} placeholder="Nuova password (opzionale)" className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none" />
                        </div>
                        <div className="flex gap-2">
                          <button type="button" className="rounded-xl bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-400 transition" onClick={submitUserEdit}>Salva</button>
                          <button type="button" className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition" onClick={cancelEditUser}>Annulla</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-100">{user.username}</div>
                          <div className="text-sm text-slate-500">{user.email || 'Nessuna email'} · {user.role}</div>
                        </div>
                        <div className="flex gap-2">
                          <button type="button" className="rounded-2xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700 transition" onClick={() => startEditUser(user)}>Modifica</button>
                          {user.role !== 'admin' && (
                            <DeleteButton itemId={user.id} type="users" onDelete={requestDelete} />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}

            {activeTab === 'ricambi' && (
              <>
                <h3 className="text-lg font-semibold text-slate-100 mb-1">Elenco pezzi di ricambio</h3>
                {spareParts.length === 0 && <p className="text-sm text-slate-500">Nessun pezzo di ricambio.</p>}
                {spareParts.map((part) => (
                  <div key={part.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                    <div>
                      <div className="font-semibold text-slate-100">{part.name}</div>
                      <div className="text-sm text-slate-500">{part.tipologia || 'Nessuna tipologia'} · {part.codice ? `Cod. ${part.codice}` : 'Nessun codice'}</div>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" className="rounded-2xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700 transition" onClick={() => startEditSparePart(part)}>Modifica</button>
                      <DeleteButton itemId={part.id} usageCount={part.usage_count} type="spare_parts" onDelete={requestDelete} />
                    </div>
                  </div>
                ))}
              </>
            )}

            {activeTab === 'soluzioni' && (
              <>
                <h3 className="text-lg font-semibold text-slate-100 mb-1">Elenco soluzioni</h3>
                {solutions.length === 0 && <p className="text-sm text-slate-500">Nessuna soluzione.</p>}
                {solutions.map((sol) => (
                  <div key={sol.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                    <div>
                      <div className="font-semibold text-slate-100">{sol.name}</div>
                      <div className="text-sm text-slate-500">{sol.description || 'Nessuna descrizione'}</div>
                      {sol.problem_ids && sol.problem_ids.length > 0 && (
                        <div className="text-xs text-sky-400 mt-1">
                          Collegata a: {sol.problem_ids.map(pid => problems.find(p => p.id === pid)?.name).filter(Boolean).join(', ')}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button type="button" className="rounded-2xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700 transition" onClick={() => startEditSolution(sol)}>Modifica</button>
                      <DeleteButton itemId={sol.id} type="solutions" onDelete={requestDelete} />
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
