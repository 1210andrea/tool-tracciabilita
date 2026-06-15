import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { ConfirmModal } from '../components/ConfirmModal';

type Category = { id: string; type: string; name: string; description?: string };
type Machine = { id: string; code: string; name: string; line?: string; location?: string; tipologia?: string; type?: string; posizione?: string };
type User = { id: string; username: string; email?: string; role: string };
type SparePart = { id: string; name: string; tipologia?: string[]; tipologie?: string[]; type?: string; description?: string; usage_count?: number };
type SolutionApplied = { id: string; name: string; description?: string; usage_count?: number };

const API_URL = '/api';
const TIPologie_TYPES = ['nastro', 'assemblaggio', 'controllo', 'imballaggio'];

type AdminTab = 'operatori' | 'problemi' | 'cause' | 'macchine' | 'utenti' | 'ricambi' | 'soluzioni';

export default function AdminPanel() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('operatori');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingDeleteType, setPendingDeleteType] = useState<'categories' | 'machines' | 'users' | 'spare_parts' | 'solutions' | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [spareParts, setSpareParts] = useState<SparePart[]>([]);
  const [solutionsApplied, setSolutionsApplied] = useState<SolutionApplied[]>([]);
  const [availableTipologie, setAvailableTipologie] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const [categoryForm, setCategoryForm] = useState({ type: 'operator', name: '', description: '' });
  const [machineForm, setMachineForm] = useState({ code: '', name: '', line: '', location: '', tipologia: '' });
  const [userForm, setUserForm] = useState({ username: '', email: '', password: '', role: 'user', operator_category_id: '' });
  const [sparePartForm, setSparePartForm] = useState({ name: '', tipologie: [] as string[], description: '' });
  const [solutionForm, setSolutionForm] = useState({ name: '', description: '' });

  const headers = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);

  const loadAll = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [categoriesResp, machinesResp, usersResp, spareResp, solutionsResp, tipologieResp] = await Promise.all([
        axios.get(`${API_URL}/categories`, headers),
        axios.get(`${API_URL}/machines`, headers),
        axios.get(`${API_URL}/users`, headers),
        axios.get(`${API_URL}/spare-parts`, headers),
        axios.get(`${API_URL}/solutions-applied`, headers),
        axios.get(`${API_URL}/machines/tipologie`, headers)
      ]);
      setCategories(categoriesResp.data.items || []);
      setMachines(machinesResp.data.items || []);
      setUsers(usersResp.data.items || []);
      setSpareParts(spareResp.data.items || []);
      setSolutionsApplied(solutionsResp.data.items || []);
      setAvailableTipologie(tipologieResp.data.items || []);
    } catch {
      setCategories([]);
      setMachines([]);
      setUsers([]);
      setSpareParts([]);
      setSolutionsApplied([]);
      setAvailableTipologie([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [token]);

  useEffect(() => {
    if (activeTab === 'operatori') {
      setCategoryForm((c) => ({ ...c, type: 'operator' }));
    } else if (activeTab === 'problemi') {
      setCategoryForm((c) => ({ ...c, type: 'problem' }));
    } else if (activeTab === 'cause') {
      setCategoryForm((c) => ({ ...c, type: 'cause' }));
    }
  }, [activeTab]);

  const submitCategory = async () => {
    try {
      await axios.post(`${API_URL}/categories`, categoryForm, headers);
      setMessage('Categoria creata.');
      setCategoryForm((prev) => ({ type: prev.type, name: '', description: '' }));
      loadAll();
    } catch (err: any) {
      setMessage(err?.response?.data?.error ?? 'Errore salvataggio categoria.');
    }
  };

  const submitMachine = async () => {
    try {
      await axios.post(`${API_URL}/machines`, { ...machineForm, tipologia: machineForm.tipologia || undefined }, headers);
      setMessage('Macchina aggiunta.');
      setMachineForm({ code: '', name: '', line: '', location: '', tipologia: '' });
      loadAll();
    } catch (err: any) {
      setMessage(err?.response?.data?.error ?? 'Errore salvataggio macchina.');
    }
  };

  const submitUser = async () => {
    try {
      await axios.post(`${API_URL}/users`, {
        ...userForm,
        operator_category_id: userForm.operator_category_id || null
      }, headers);
      setMessage('Utente creato.');
      setUserForm({ username: '', email: '', password: '', role: 'user', operator_category_id: '' });
      loadAll();
    } catch (err: any) {
      setMessage(err?.response?.data?.error ?? 'Errore salvataggio utente.');
    }
  };

  const submitSparePart = async () => {
    try {
      await axios.post(`${API_URL}/spare-parts`, sparePartForm, headers);
      setMessage('Ricambio aggiunto.');
      setSparePartForm({ name: '', tipologie: [], description: '' });
      loadAll();
    } catch (err: any) {
      setMessage(err?.response?.data?.error ?? 'Errore salvataggio ricambio.');
    }
  };

  const submitSolution = async () => {
    try {
      await axios.post(`${API_URL}/solutions-applied`, solutionForm, headers);
      setMessage('Soluzione aggiunta.');
      setSolutionForm({ name: '', description: '' });
      loadAll();
    } catch (err: any) {
      setMessage(err?.response?.data?.error ?? 'Errore salvataggio soluzione.');
    }
  };

  const deleteItem = async (type: 'categories' | 'machines' | 'users' | 'spare_parts' | 'solutions', id: string) => {
    try {
      const path = type === 'spare_parts' ? 'spare-parts' : type === 'solutions' ? 'solutions-applied' : type;
      await axios.delete(`${API_URL}/${path}/${id}`, headers);
      setMessage('Elemento eliminato.');
      loadAll();
    } catch (err: any) {
      const usage = err?.response?.data?.usage_count;
      setMessage(err?.response?.data?.error ?? (usage ? `In uso da ${usage} casi` : 'Eliminazione non consentita.'));
    }
  };

  const requestDelete = (type: 'categories' | 'machines' | 'users' | 'spare_parts' | 'solutions', id: string) => {
    setPendingDeleteType(type);
    setPendingDeleteId(id);
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteType || !pendingDeleteId) return;
    setConfirmOpen(false);
    const type = pendingDeleteType;
    const id = pendingDeleteId;
    setPendingDeleteType(null);
    setPendingDeleteId(null);
    await deleteItem(type, id);
  };

  const tabLabels: Record<AdminTab, string> = {
    operatori: 'Operatori',
    problemi: 'Problemi',
    cause: 'Cause',
    macchine: 'Macchine',
    utenti: 'Utenti',
    ricambi: 'Pezzi di Ricambio',
    soluzioni: 'Soluzioni'
  };

  const listTitle = activeTab === 'operatori' ? 'operatori'
    : activeTab === 'problemi' ? 'problemi'
    : activeTab === 'cause' ? 'cause'
    : activeTab === 'macchine' ? 'macchine'
    : activeTab === 'utenti' ? 'utenti'
    : activeTab === 'ricambi' ? 'pezzi di ricambio'
    : 'soluzioni applicate';

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Admin Panel</h1>
        <p className="text-sm text-slate-400">Gestisci operatori, problemi, cause, macchine, utenti, ricambi e soluzioni.</p>
      </div>

      {message && <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">{message}</div>}

      <div className="flex flex-wrap gap-2 sm:gap-3">
        {(['operatori', 'problemi', 'cause', 'macchine', 'utenti', 'ricambi', 'soluzioni'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`rounded-full px-4 py-2.5 text-xs font-semibold transition sm:px-5 sm:py-3 sm:text-sm ${
              activeTab === tab ? 'bg-sky-500 text-slate-950' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
            }`}
          >
            {tabLabels[tab]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6 rounded-3xl bg-slate-950/80 p-5 shadow-xl shadow-slate-950/10 sm:p-6">
          {activeTab === 'operatori' && (
            <>
              <div>
                <h2 className="text-xl font-semibold text-slate-100">Nuovo operatore</h2>
                <p className="text-sm text-slate-400">Aggiungi una nuova categoria operatore.</p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="text-sm text-slate-300">Nome</label>
                  <input
                    value={categoryForm.name}
                    onChange={(e) => setCategoryForm((current) => ({ ...current, name: e.target.value }))}
                    placeholder="Nome operatore"
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
                  placeholder="Descrizione (opzionale)"
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none"
                />
              </div>

              <button type="button" className="w-full rounded-2xl bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 sm:w-auto hover:bg-sky-400 transition" onClick={submitCategory}>
                Aggiungi operatore
              </button>
            </>
          )}

          {activeTab === 'problemi' && (
            <>
              <div>
                <h2 className="text-xl font-semibold text-slate-100">Nuovo problema</h2>
                <p className="text-sm text-slate-400">Aggiungi una nuova tipologia di problema.</p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="text-sm text-slate-300">Nome</label>
                  <input
                    value={categoryForm.name}
                    onChange={(e) => setCategoryForm((current) => ({ ...current, name: e.target.value }))}
                    placeholder="Nome problema"
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
                  placeholder="Descrizione (opzionale)"
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none"
                />
              </div>

              <button type="button" className="w-full rounded-2xl bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 sm:w-auto hover:bg-sky-400 transition" onClick={submitCategory}>
                Aggiungi problema
              </button>
            </>
          )}

          {activeTab === 'cause' && (
            <>
              <div>
                <h2 className="text-xl font-semibold text-slate-100">Nuova causa</h2>
                <p className="text-sm text-slate-400">Aggiungi una nuova causa di guasto.</p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="text-sm text-slate-300">Nome</label>
                  <input
                    value={categoryForm.name}
                    onChange={(e) => setCategoryForm((current) => ({ ...current, name: e.target.value }))}
                    placeholder="Nome causa"
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
                  placeholder="Descrizione (opzionale)"
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none"
                />
              </div>

              <button type="button" className="w-full rounded-2xl bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 sm:w-auto hover:bg-sky-400 transition" onClick={submitCategory}>
                Aggiungi causa
              </button>
            </>
          )}

          {activeTab === 'macchine' && (
            <>
              <div>
                <h2 className="text-xl font-semibold text-slate-100">Nuova macchina</h2>
                <p className="text-sm text-slate-400">Aggiungi qui le macchine della linea.</p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <input value={machineForm.code} onChange={(e) => setMachineForm((c) => ({ ...c, code: e.target.value }))} placeholder="Codice macchina" className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
                <input value={machineForm.name} onChange={(e) => setMachineForm((c) => ({ ...c, name: e.target.value }))} placeholder="Nome macchina" className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
                <input value={machineForm.line} onChange={(e) => setMachineForm((c) => ({ ...c, line: e.target.value }))} placeholder="Linea" className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
                <input value={machineForm.tipologia} onChange={(e) => setMachineForm((c) => ({ ...c, tipologia: e.target.value }))} placeholder="Tipologia (es. nastro, assemblaggio, controllo, imballaggio)" className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none sm:col-span-2" />
              </div>
              <button type="button" className="w-full rounded-2xl bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 sm:w-auto hover:bg-sky-400 transition" onClick={submitMachine}>
                Aggiungi macchina
              </button>
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
              <div>
                <label className="text-sm text-slate-300">Operatore collegato</label>
                <select value={userForm.operator_category_id} onChange={(e) => setUserForm((c) => ({ ...c, operator_category_id: e.target.value }))} className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none">
                  <option value="">Nessuno / auto da username</option>
                  {categories.filter((c) => c.type === 'operator').map((op) => (
                    <option key={op.id} value={op.id}>{op.name}</option>
                  ))}
                </select>
              </div>
              <button type="button" className="w-full rounded-2xl bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 sm:w-auto hover:bg-sky-400 transition" onClick={submitUser}>
                Crea utente
              </button>
            </>
          )}

          {activeTab === 'ricambi' && (
            <>
              <div>
                <h2 className="text-xl font-semibold text-slate-100">Nuovo pezzo di ricambio</h2>
                <p className="text-sm text-slate-400">Aggiungi pezzi di ricambio collegati alle tipologie di macchine.</p>
              </div>

              <div className="space-y-4">
                <input value={sparePartForm.name} onChange={(e) => setSparePartForm((c) => ({ ...c, name: e.target.value }))} placeholder="Nome ricambio" className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
                
                <div>
                  <span className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Tipologie Macchine Collegate</span>
                  {availableTipologie.length === 0 ? (
                    <p className="text-sm text-slate-500 bg-slate-900/50 p-3 rounded-2xl border border-slate-800">
                      Nessuna tipologia trovata. Crea prima una macchina con una tipologia.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2 p-3 rounded-2xl border border-slate-800 bg-slate-900/30">
                      {availableTipologie.map((t) => {
                        const isChecked = sparePartForm.tipologie.includes(t);
                        return (
                          <label key={t} className="flex items-center gap-2 cursor-pointer bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800 hover:bg-slate-800/80 transition select-none">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                const nextTipologie = e.target.checked
                                  ? [...sparePartForm.tipologie, t]
                                  : sparePartForm.tipologie.filter((x) => x !== t);
                                setSparePartForm((c) => ({ ...c, tipologie: nextTipologie }));
                              }}
                              className="accent-sky-500 h-4 w-4 cursor-pointer"
                            />
                            <span className="text-sm text-slate-200">{t}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              <textarea value={sparePartForm.description} onChange={(e) => setSparePartForm((c) => ({ ...c, description: e.target.value }))} rows={3} placeholder="Descrizione (opzionale)" className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
              <button type="button" className="w-full rounded-2xl bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 sm:w-auto hover:bg-sky-400 transition" onClick={submitSparePart}>
                Aggiungi ricambio
              </button>
            </>
          )}

          {activeTab === 'soluzioni' && (
            <>
              <div>
                <h2 className="text-xl font-semibold text-slate-100">Nuova soluzione applicata</h2>
                <p className="text-sm text-slate-400">Aggiungi opzioni per le soluzioni applicate nei casi.</p>
              </div>

              <input value={solutionForm.name} onChange={(e) => setSolutionForm((c) => ({ ...c, name: e.target.value }))} placeholder="Nome soluzione" className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
              <textarea value={solutionForm.description} onChange={(e) => setSolutionForm((c) => ({ ...c, description: e.target.value }))} rows={4} placeholder="Descrizione (opzionale)" className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
              <button type="button" className="w-full rounded-2xl bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 sm:w-auto hover:bg-sky-400 transition" onClick={submitSolution}>
                Aggiungi soluzione
              </button>
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
              {categories.filter((c) => c.type === 'operator').map((category) => (
                <div key={category.id} className="flex flex-col gap-2 rounded-3xl border border-slate-800 bg-slate-900/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-semibold text-slate-100">{category.name}</div>
                    <div className="text-sm text-slate-500">{category.description || 'Nessuna descrizione'}</div>
                  </div>
                  <button type="button" className="rounded-2xl bg-rose-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-rose-400 transition" onClick={() => requestDelete('categories', category.id)}>
                    Elimina
                  </button>
                </div>
              ))}
              {categories.filter((c) => c.type === 'operator').length === 0 && (
                <p className="text-sm text-slate-500 italic text-center py-4">Nessun operatore configurato.</p>
              )}
            </div>
          )}

          {activeTab === 'problemi' && (
            <div className="space-y-4">
              {categories.filter((c) => c.type === 'problem').map((category) => (
                <div key={category.id} className="flex flex-col gap-2 rounded-3xl border border-slate-800 bg-slate-900/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-semibold text-slate-100">{category.name}</div>
                    <div className="text-sm text-slate-500">{category.description || 'Nessuna descrizione'}</div>
                  </div>
                  <button type="button" className="rounded-2xl bg-rose-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-rose-400 transition" onClick={() => requestDelete('categories', category.id)}>
                    Elimina
                  </button>
                </div>
              ))}
              {categories.filter((c) => c.type === 'problem').length === 0 && (
                <p className="text-sm text-slate-500 italic text-center py-4">Nessun problema configurato.</p>
              )}
            </div>
          )}

          {activeTab === 'cause' && (
            <div className="space-y-4">
              {categories.filter((c) => c.type === 'cause').map((category) => (
                <div key={category.id} className="flex flex-col gap-2 rounded-3xl border border-slate-800 bg-slate-900/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-semibold text-slate-100">{category.name}</div>
                    <div className="text-sm text-slate-500">{category.description || 'Nessuna descrizione'}</div>
                  </div>
                  <button type="button" className="rounded-2xl bg-rose-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-rose-400 transition" onClick={() => requestDelete('categories', category.id)}>
                    Elimina
                  </button>
                </div>
              ))}
              {categories.filter((c) => c.type === 'cause').length === 0 && (
                <p className="text-sm text-slate-500 italic text-center py-4">Nessuna causa configurata.</p>
              )}
            </div>
          )}

          {activeTab === 'macchine' && (
            <div className="space-y-4">
              {machines.map((machine) => (
                <div key={machine.id} className="flex flex-col gap-2 rounded-3xl border border-slate-800 bg-slate-900/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-semibold text-slate-100">{machine.code} - {machine.name}</div>
                    <div className="text-sm text-slate-500">{machine.line || 'Linea N/D'} · {machine.type || machine.tipologia || 'tipo N/D'} · {machine.location || 'Posizione N/D'}</div>
                  </div>
                  <button type="button" className="rounded-2xl bg-rose-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-rose-400 transition" onClick={() => requestDelete('machines', machine.id)}>
                    Elimina
                  </button>
                </div>
              ))}
              {machines.length === 0 && (
                <p className="text-sm text-slate-500 italic text-center py-4">Nessuna macchina configurata.</p>
              )}
            </div>
          )}

          {activeTab === 'utenti' && (
            <div className="space-y-4">
              {users.map((userItem) => (
                <div key={userItem.id} className="flex flex-col gap-2 rounded-3xl border border-slate-800 bg-slate-900/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-semibold text-slate-100">{userItem.username}</div>
                    <div className="text-sm text-slate-500">{userItem.email || 'Email non fornita'} · ruolo: {userItem.role}</div>
                  </div>
                  <button type="button" className="rounded-2xl bg-rose-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-rose-400 transition" onClick={() => requestDelete('users', userItem.id)}>
                    Elimina
                  </button>
                </div>
              ))}
              {users.length === 0 && (
                <p className="text-sm text-slate-500 italic text-center py-4">Nessun utente configurato.</p>
              )}
            </div>
          )}

          {activeTab === 'ricambi' && (
            <div className="space-y-4">
              {spareParts.map((part) => {
                const danger = (part.usage_count ?? 0) > 0;
                const partTipologie = part.tipologie && part.tipologie.length ? part.tipologie : (part.tipologia && part.tipologia.length ? part.tipologia : []);
                return (
                  <div key={part.id} className="flex flex-col gap-2 rounded-3xl border border-slate-800 bg-slate-900/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-semibold text-slate-100">{part.name}</div>
                      <div className="text-sm text-slate-500">
                        Tipologie: {partTipologie.length ? partTipologie.join(', ') : 'Nessuna'} · {part.description || 'Nessuna descrizione'}
                      </div>
                      {danger && <div className="text-xs text-amber-400">In uso da {part.usage_count} casi</div>}
                    </div>
                    {!danger ? (
                      <button type="button" className="rounded-2xl bg-rose-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-rose-400 transition" onClick={() => requestDelete('spare_parts', part.id)}>
                        Elimina
                      </button>
                    ) : (
                      <span className="text-xs text-slate-500 font-semibold bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">In uso (Non eliminabile)</span>
                    )}
                  </div>
                );
              })}
              {spareParts.length === 0 && (
                <p className="text-sm text-slate-500 italic text-center py-4">Nessun pezzo di ricambio configurato.</p>
              )}
            </div>
          )}

          {activeTab === 'soluzioni' && (
            <div className="space-y-4">
              {solutionsApplied.map((sol) => {
                const danger = (sol.usage_count ?? 0) > 0;
                return (
                  <div key={sol.id} className="flex flex-col gap-2 rounded-3xl border border-slate-800 bg-slate-900/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-semibold text-slate-100">{sol.name}</div>
                      <div className="text-sm text-slate-500">{sol.description || 'Nessuna descrizione'}</div>
                      {danger && <div className="text-xs text-amber-400">In uso da {sol.usage_count} casi</div>}
                    </div>
                    {!danger ? (
                      <button type="button" className="rounded-2xl bg-rose-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-rose-400 transition" onClick={() => requestDelete('solutions', sol.id)}>
                        Elimina
                      </button>
                    ) : (
                      <span className="text-xs text-slate-500 font-semibold bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">In uso (Non eliminabile)</span>
                    )}
                  </div>
                );
              })}
              {solutionsApplied.length === 0 && (
                <p className="text-sm text-slate-500 italic text-center py-4">Nessuna soluzione applicata configurata.</p>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirmOpen}
        title="Conferma eliminazione"
        message="Sei sicuro di cancellare?"
        confirmText="Elimina"
        cancelText="Annulla"
        danger
        onCancel={() => {
          setConfirmOpen(false);
          setPendingDeleteId(null);
          setPendingDeleteType(null);
        }}
        onConfirm={confirmDelete}
      />

      <Link to="/" className="inline-flex rounded-2xl bg-slate-800 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700 transition">
        Torna alla dashboard
      </Link>
    </div>
  );
}
