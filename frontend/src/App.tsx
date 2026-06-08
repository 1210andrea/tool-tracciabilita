import type { ReactNode } from 'react';
import { Routes, Route, Navigate, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CreateCase from './pages/CreateCase';
import AdminPanel from './pages/AdminPanel';

function Protected({ children, role }: { children: ReactNode; role?: string }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <div className="p-6 rounded bg-white text-slate-900">Forbidden</div>;
  return <>{children}</>;
}

function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-700 bg-slate-900/95 backdrop-blur">
        <div className="mx-auto flex flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between max-w-6xl">
          <div>
            <div className="text-xl font-semibold">Machines App</div>
            <div className="text-sm text-slate-400">Gestione problemi macchine industriali</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700" to="/">
              Dashboard
            </Link>
            <Link className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700" to="/cases/new">
              Nuovo caso
            </Link>
            {user?.role === 'admin' && (
              <Link className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700" to="/admin">
                Admin
              </Link>
            )}
            <button
              type="button"
              className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
              onClick={logout}
            >
              Logout
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <Protected>
              <Layout>
                <Dashboard />
              </Layout>
            </Protected>
          }
        />
        <Route
          path="/cases/new"
          element={
            <Protected>
              <Layout>
                <CreateCase />
              </Layout>
            </Protected>
          }
        />
        <Route
          path="/admin"
          element={
            <Protected role="admin">
              <Layout>
                <AdminPanel />
              </Layout>
            </Protected>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}

