import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { AdminCategoriesTabs } from '../components/AdminCategoriesTabs';
import { ConfirmModal } from '../components/ConfirmModal';

type Category = { id: string; type: string; name: string; description?: string };
type Machine = { id: string; code: string; name: string; line?: string; location?: string; tipologia?: string; type?: string; posizione?: string };
type User = { id: string; username: string; email?: string; role: string };
type SparePart = { id: string; name: string; tipologia?: string[]; tipologie?: string[]; type?: string; description?: string; usage_count?: number };
type SolutionApplied = { id: string; name: string; description?: string; usage_count?: number };

const API_URL = '/api';
const TIPologie_TYPES = ['nastro', 'assemblaggio', 'controllo', 'imballaggio'];


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
      // back-compat BE: se manca tipologia, ma c'era type/posizione, li risolve via SQL
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
                <select value={machineForm.tipologia} onChange={(e) => setMachineForm((c) => ({ ...c, tipologia: e.target.value }))} className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none sm:col-span-2">
                  {TIPologie_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
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

        <div className="space-y-6 rounded-3xl bg-slate-950/95 p-5 shadow-xl shadow-slate-950/10 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-100">Elenco {listTitle}</h2>
            {loading && <span className="text-sm text-slate-500">Caricamento...</span>}
          </div>

          {activeTab === 'categories' && (
            <div className="space-y-4">
              {categories.filter((c) => c.type === activeCategoryType).map((category) => (
                <div key={category.id} className="flex flex-col gap-2 rounded-3xl border border-slate-800 bg-slate-900/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-semibold text-slate-100">{category.name}</div>
                    <div className="text-sm text-slate-500">{category.description || 'Nessuna descrizione'}</div>
                  </div>
                  <button type="button" className="rounded-2xl bg-rose-500 px-4 py-2 text-sm font-semibold text-slate-950" onClick={() => requestDelete('categories', category.id)}>
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
              {users.map((userItem) => (
                <div key={userItem.id} className="flex flex-col gap-2 rounded-3xl border border-slate-800 bg-slate-900/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-semibold text-slate-100">{userItem.username}</div>
                    <div className="text-sm text-slate-500">{userItem.email || 'Email non fornita'} · ruolo: {userItem.role}</div>
                  </div>
                  <button type="button" className="rounded-2xl bg-rose-500 px-4 py-2 text-sm font-semibold text-slate-950" onClick={() => requestDelete('users', userItem.id)}>
                    Elimina
                  </button>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'spare_solutions' && spareSolutionsSubTab === 'spare_parts' && (
            <div className="space-y-4">
              {spareParts.map((part) => {
                const inUse = (part.usage_count ?? 0) > 0;
                const partTipologie = part.tipologie && part.tipologie.length ? part.tipologie : (part.tipologia && part.tipologia.length ? part.tipologia : []);
                return (
                  <div key={part.id} className="flex flex-col gap-2 rounded-3xl border border-slate-800 bg-slate-900/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-semibold text-slate-100">{part.name}</div>
                      <div className="text-sm text-slate-500">
                        Tipologie: {partTipologie.length ? partTipologie.join(', ') : 'Nessuna'} · {part.description || 'Nessuna descrizione'}
                      </div>
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
