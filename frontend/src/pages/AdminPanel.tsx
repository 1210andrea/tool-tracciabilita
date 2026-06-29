import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { AdminCategoriesTabs } from '../components/AdminCategoriesTabs';
import { ConfirmModal } from '../components/ConfirmModal';

type Category = { id: string; type: string; name: string; description?: string; usage_count?: number };
type Machine = { id: string; code: string; name: string; line?: string; location?: string; type?: string };
type User = { id: string; username: string; email?: string; role: string; case_count?: number };
type SparePart = { id: string; name: string; type: string; description?: string; usage_count?: number };
type SolutionApplied = { id: string; name: string; description?: string; usage_count?: number };

const API_URL = '/api';

export default function AdminPanel() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<'categories' | 'machines' | 'users' | 'spare_solutions'>('categories');
  const [activeCategoryType, setActiveCategoryType] = useState<'operator' | 'problem' | 'cause'>('operator');
  const [spareSolutionsSubTab, setSpareSolutionsSubTab] = useState<'spare_parts' | 'solutions'>('spare_parts');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingDeleteType, setPendingDeleteType] = useState<'categories' | 'machines' | 'users' | 'spare_parts' | 'solutions' | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [spareParts, setSpareParts] = useState<SparePart[]>([]);
  const [solutionsApplied, setSolutionsApplied] = useState<SolutionApplied[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const [categoryForm, setCategoryForm] = useState({ type: 'operator', name: '', description: '' });
  const [machineForm, setMachineForm] = useState({ code: '', name: '', line: '', location: '', type: '' });
  const [userForm, setUserForm] = useState({ username: '', email: '', password: '', role: 'user', operator_category_id: '' });
  const [sparePartForm, setSparePartForm] = useState({ name: '', type: '', description: '' });
  // selectedMachineTypes: array di tipologie macchina selezionate per il ricambio
  const [selectedMachineTypes, setSelectedMachineTypes] = useState<string[]>([]);
  const [solutionForm, setSolutionForm] = useState({ name: '', description: '' });

  const headers = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);

  // Tutte le tipologie macchina uniche disponibili
  const allMachineTypes = useMemo(() => {
    const types = machines
      .map((m) => m.type)
      .filter((t): t is string => !!t && t.trim() !== '');
    return [...new Set(types)].sort();
  }, [machines]);

  const loadAll = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [categoriesResp, machinesResp, usersResp, spareResp, solutionsResp] = await Promise.all([
        axios.get(`${API_URL}/categories`, headers),
        axios.get(`${API_URL}/machines`, headers),
        axios.get(`${API_URL}/users`, headers),
        axios.get(`${API_URL}/spare-parts`, headers),
        axios.get(`${API_URL}/solutions-applied`, headers)
      ]);
      setCategories(categoriesResp.data.items || []);
      setMachines(machinesResp.data.items || []);
      setUsers(usersResp.data.items || []);
      setSpareParts(spareResp.data.items || []);
      setSolutionsApplied(solutionsResp.data.items || []);
    } catch {
      setCategories([]);
      setMachines([]);
      setUsers([]);
      setSpareParts([]);
      setSolutionsApplied([]);
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
      setMachineForm({ code: '', name: '', line: '', location: '', type: '' });
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
      // Salva le tipologie selezionate come stringa separata da virgola nel campo type
      const typeValue = selectedMachineTypes.join(',');
      await axios.post(`${API_URL}/spare-parts`, { ...sparePartForm, type: typeValue }, headers);
      setMessage('Ricambio aggiunto.');
      setSparePartForm({ name: '', type: '', description: '' });
      setSelectedMachineTypes([]);
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

  // Toggle selezione singola tipologia macchina
  const toggleMachineType = (t: string) => {
    setSelectedMachineTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  };

  // Seleziona tutte le tipologie SR
  const selectSR = () => {
    const srTypes = allMachineTypes.filter((t) => t.toUpperCase().startsWith('SR'));
    setSelectedMachineTypes((prev) => {
      const others = prev.filter((t) => !t.toUpperCase().startsWith('SR'));
      return [...others, ...srTypes];
    });
  };

  // Seleziona tutte le tipologie SIMM
  const selectSIMM = () => {
    const simmTypes = allMachineTypes.filter((t) => t.toUpperCase().startsWith('SIMM'));
    setSelectedMachineTypes((prev) => {
      const others = prev.filter((t) => !t.toUpperCase().startsWith('SIMM'));
      return [...others, ...simmTypes];
    });
  };

  // Toggle Tutti: se già tutto selezionato svuota, altrimenti seleziona tutto
  const toggleAll = () => {
    if (selectedMachineTypes.length === allMachineTypes.length && allMachineTypes.length > 0) {
      setSelectedMachineTypes([]);
    } else {
      setSelectedMachineTypes([...allMachineTypes]);
    }
  };

  const tabLabels: Record<typeof activeTab, string> = {
    categories: 'Categorie',
    machines: 'Macchine',
    users: 'Utenti',
    spare_solutions: 'Ricambi e Soluzioni'
  };

  const listTitle = activeTab === 'spare_solutions'
    ? (spareSolutionsSubTab === 'spare_parts' ? 'ricambi' : 'soluzioni applicate')
    : activeTab === 'categories' ? 'categorie' : activeTab === 'machines' ? 'macchine' : 'utenti';

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Admin Panel</h1>
        <p className="text-sm text-slate-400">Gestisci categorie, macchine, utenti, ricambi e soluzioni.</p>
      </div>

      {message && <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">{message}</div>}

      <div className="flex flex-wrap gap-2 sm:gap-3">
        {(['categories', 'machines', 'users', 'spare_solutions'] as const).map((tab) => (
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
        {/* COLONNA SINISTRA: form */}
        <div className="space-y-6 rounded-3xl bg-slate-950/80 p-5 shadow-xl shadow-slate-950/10 sm:p-6">
          {activeTab === 'categories' && (
            <>
              <div>
                <h2 className="text-xl font-semibold text-slate-100">Categorie</h2>
                <p className="text-sm text-slate-400">Gestisci operatori, problemi e cause.</p>
              </div>

              <AdminCategoriesTabs
                activeType={activeCategoryType}
                onChange={(t) => {
                  setActiveCategoryType(t);
                  setCategoryForm({ type: t, name: '', description: '' });
                }}
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

              <button type="button" className="w-full rounded-2xl bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 sm:w-auto" onClick={submitCategory}>
                Aggiungi {activeCategoryType === 'operator' ? 'operatore' : activeCategoryType === 'problem' ? 'problema' : 'causa'}
              </button>
            </>
          )}

          {activeTab === 'machines' && (
            <>
              <div>
                <h2 className="text-xl font-semibold text-slate-100">Nuova macchina</h2>
                <p className="text-sm text-slate-400">Aggiungi qui le macchine della linea.</p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <input value={machineForm.code} onChange={(e) => setMachineForm((c) => ({ ...c, code: e.target.value }))} placeholder="Codice macchina" className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
                <input value={machineForm.name} onChange={(e) => setMachineForm((c) => ({ ...c, name: e.target.value }))} placeholder="Nome macchina" className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
                <input value={machineForm.line} onChange={(e) => setMachineForm((c) => ({ ...c, line: e.target.value }))} placeholder="Linea" className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
                <input value={machineForm.location} onChange={(e) => setMachineForm((c) => ({ ...c, location: e.target.value }))} placeholder="Posizione" className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
                <input value={machineForm.type} onChange={(e) => setMachineForm((c) => ({ ...c, type: e.target.value }))} placeholder="Tipologia macchina" className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none sm:col-span-2" />
              </div>
              <button type="button" className="w-full rounded-2xl bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 sm:w-auto" onClick={submitMachine}>
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
              <button type="button" className="w-full rounded-2xl bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 sm:w-auto" onClick={submitUser}>
                Crea utente
              </button>
            </>
          )}

          {activeTab === 'spare_solutions' && (
            <>
              <div>
                <h2 className="text-xl font-semibold text-slate-100">Ricambi e Soluzioni</h2>
                <p className="text-sm text-slate-400">Gestisci pezzi di ricambio e soluzioni applicate.</p>
              </div>

              <div className="flex flex-wrap gap-2">
                {(['spare_parts', 'solutions'] as const).map((sub) => (
                  <button
                    key={sub}
                    type="button"
                    onClick={() => setSpareSolutionsSubTab(sub)}
                    className={`rounded-full px-4 py-2 text-xs font-semibold sm:text-sm ${
                      spareSolutionsSubTab === sub ? 'bg-sky-500 text-slate-950' : 'bg-slate-900 text-slate-300'
                    }`}
                  >
                    {sub === 'spare_parts' ? 'PEZZI DI RICAMBIO' : 'SOLUZIONI APPLICATE'}
                  </button>
                ))}
              </div>

              {spareSolutionsSubTab === 'spare_parts' ? (
                <>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <input
                      value={sparePartForm.name}
                      onChange={(e) => setSparePartForm((c) => ({ ...c, name: e.target.value }))}
                      placeholder="Nome ricambio"
                      className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none sm:col-span-2"
                    />
                  </div>

                  {/* Selettore tipologie macchine compatibili */}
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <label className="text-sm text-slate-300">Tipologie macchine compatibili</label>
                      {/* Bottoni selezione rapida */}
                      <button
                        type="button"
                        onClick={selectSR}
                        className="rounded-full bg-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-600"
                      >SR</button>
                      <button
                        type="button"
                        onClick={selectSIMM}
                        className="rounded-full bg-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-600"
                      >SIMM</button>
                      <button
                        type="button"
                        onClick={toggleAll}
                        className="rounded-full bg-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-600"
                      >Tutti</button>
                    </div>
                    {allMachineTypes.length === 0 ? (
                      <p className="text-xs text-slate-500">Nessuna tipologia macchina disponibile. Aggiungi prima le macchine.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {allMachineTypes.map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => toggleMachineType(t)}
                            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                              selectedMachineTypes.includes(t)
                                ? 'bg-sky-500 text-slate-950'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    )}
                    {selectedMachineTypes.length > 0 && (
                      <p className="mt-2 text-xs text-slate-500">
                        Selezionate: {selectedMachineTypes.join(', ')}
                      </p>
                    )}
                  </div>

                  <textarea
                    value={sparePartForm.description}
                    onChange={(e) => setSparePartForm((c) => ({ ...c, description: e.target.value }))}
                    rows={3}
                    placeholder="Descrizione (opzionale)"
                    className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none"
                  />
                  <button type="button" className="w-full rounded-2xl bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 sm:w-auto" onClick={submitSparePart}>
                    Aggiungi ricambio
                  </button>
                </>
              ) : (
                <>
                  <input value={solutionForm.name} onChange={(e) => setSolutionForm((c) => ({ ...c, name: e.target.value }))} placeholder="Nome soluzione" className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
                  <textarea value={solutionForm.description} onChange={(e) => setSolutionForm((c) => ({ ...c, description: e.target.value }))} rows={4} placeholder="Descrizione" className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
                  <button type="button" className="w-full rounded-2xl bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 sm:w-auto" onClick={submitSolution}>
                    Aggiungi soluzione
                  </button>
                </>
              )}
            </>
          )}
        </div>

        {/* COLONNA DESTRA: elenco */}
        <div className="space-y-6 rounded-3xl bg-slate-950/95 p-5 shadow-xl shadow-slate-950/10 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-100">Elenco {listTitle}</h2>
            {loading && <span className="text-sm text-slate-500">Caricamento...</span>}
          </div>

          {activeTab === 'categories' && (
            <div className="space-y-4">
              {categories.filter((c) => c.type === activeCategoryType).map((category) => {
                const inUse = (category.usage_count ?? 0) > 0;
                return (
                  <div key={category.id} className="flex flex-col gap-2 rounded-3xl border border-slate-800 bg-slate-900/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-semibold text-slate-100">{category.name}</div>
                      <div className="text-sm text-slate-500">{category.description || 'Nessuna descrizione'}</div>
                      {inUse && <div className="text-xs text-amber-400">In uso da {category.usage_count} {activeCategoryType === 'operator' ? 'utenti' : 'casi'}</div>}
                    </div>
                    {!inUse ? (
                      <button type="button" className="rounded-2xl bg-rose-500 px-4 py-2 text-sm font-semibold text-slate-950" onClick={() => requestDelete('categories', category.id)}>
                        Elimina
                      </button>
                    ) : (
                      <span className="text-xs text-slate-500">Non eliminabile</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'machines' && (
            <div className="space-y-4">
              {machines.map((machine) => (
                <div key={machine.id} className="flex flex-col gap-2 rounded-3xl border border-slate-800 bg-slate-900/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-semibold text-slate-100">{machine.code} - {machine.name}</div>
                    <div className="text-sm text-slate-500">{machine.line || 'Linea N/D'} · {machine.type || 'tipo N/D'} · {machine.location || 'Posizione N/D'}</div>
                  </div>
                  <button type="button" className="rounded-2xl bg-rose-500 px-4 py-2 text-sm font-semibold text-slate-950" onClick={() => requestDelete('machines', machine.id)}>
                    Elimina
                  </button>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'users' && (
            <div className="space-y-4">
              {users.map((userItem) => {
                const isAdmin = userItem.username === 'admin';
                const hasCases = (userItem.case_count ?? 0) > 0;
                const canDelete = !isAdmin && !hasCases;
                return (
                  <div key={userItem.id} className="flex flex-col gap-2 rounded-3xl border border-slate-800 bg-slate-900/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-semibold text-slate-100">{userItem.username}</div>
                      <div className="text-sm text-slate-500">{userItem.email || 'Email non fornita'} · ruolo: {userItem.role}</div>
                      {hasCases && <div className="text-xs text-amber-400">Ha {userItem.case_count} casi registrati</div>}
                    </div>
                    {canDelete ? (
                      <button type="button" className="rounded-2xl bg-rose-500 px-4 py-2 text-sm font-semibold text-slate-950" onClick={() => requestDelete('users', userItem.id)}>
                        Elimina
                      </button>
                    ) : (
                      <span className="text-xs text-slate-500">Non eliminabile</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'spare_solutions' && spareSolutionsSubTab === 'spare_parts' && (
            <div className="space-y-4">
              {spareParts.map((part) => {
                const inUse = (part.usage_count ?? 0) > 0;
                return (
                  <div key={part.id} className="flex flex-col gap-2 rounded-3xl border border-slate-800 bg-slate-900/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-semibold text-slate-100">{part.name}</div>
                      <div className="text-sm text-slate-500">Tipo: {part.type} · {part.description || 'Nessuna descrizione'}</div>
                      {inUse && <div className="text-xs text-amber-400">In uso da {part.usage_count} casi</div>}
                    </div>
                    {!inUse ? (
                      <button type="button" className="rounded-2xl bg-rose-500 px-4 py-2 text-sm font-semibold text-slate-950" onClick={() => requestDelete('spare_parts', part.id)}>
                        Elimina
                      </button>
                    ) : (
                      <span className="text-xs text-slate-500">Non eliminabile</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'spare_solutions' && spareSolutionsSubTab === 'solutions' && (
            <div className="space-y-4">
              {solutionsApplied.map((sol) => {
                const inUse = (sol.usage_count ?? 0) > 0;
                return (
                  <div key={sol.id} className="flex flex-col gap-2 rounded-3xl border border-slate-800 bg-slate-900/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-semibold text-slate-100">{sol.name}</div>
                      <div className="text-sm text-slate-500">{sol.description || 'Nessuna descrizione'}</div>
                      {inUse && <div className="text-xs text-amber-400">In uso da {sol.usage_count} casi</div>}
                    </div>
                    {!inUse ? (
                      <button type="button" className="rounded-2xl bg-rose-500 px-4 py-2 text-sm font-semibold text-slate-950" onClick={() => requestDelete('solutions', sol.id)}>
                        Elimina
                      </button>
                    ) : (
                      <span className="text-xs text-slate-500">Non eliminabile</span>
                    )}
                  </div>
                );
              })}
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

      <Link to="/" className="inline-flex rounded-2xl bg-slate-800 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700">
        Torna alla dashboard
      </Link>
    </div>
  );
}
