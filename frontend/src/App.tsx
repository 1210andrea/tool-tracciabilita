import type { ReactNode } from 'react';
import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import UserHome from './pages/UserHome';
import CreateCase from './pages/CreateCase';
import AdminPanel from './pages/AdminPanel';
import AiAnalysis from './pages/AiAnalysis';

function Protected({ children, role }: { children: ReactNode; role?: string }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function HomeRoute() {
  const { user } = useAuth();
  if (user?.role === 'admin') return <Navigate to="/dashboard" replace />;
  return <UserHome />;
}

function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const isAdmin = user?.role === 'admin';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-700 bg-slate-900/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xl font-semibold">Machines App</div>
            <div className="text-sm text-slate-400">Gestione problemi macchine industriali</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin ? (
              <>
                <Link
                  className={`rounded border px-3 py-2 text-sm hover:bg-slate-700 ${location.pathname === '/dashboard' ? 'border-sky-500 bg-slate-800' : 'border-slate-700 bg-slate-800'}`}
                  to="/dashboard"
                >
                  Dashboard
                </Link>
                <Link className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700" to="/admin">
                  Admin
                </Link>
              </>
            ) : (
              <Link
                className={`rounded border px-3 py-2 text-sm hover:bg-slate-700 ${location.pathname === '/' ? 'border-sky-500 bg-slate-800' : 'border-slate-700 bg-slate-800'}`}
                to="/"
              >
                I miei casi
              </Link>
            )}
            <Link
              className={`rounded border px-3 py-2 text-sm hover:bg-slate-700 ${location.pathname === '/ai' ? 'border-violet-500 bg-slate-800' : 'border-slate-700 bg-slate-800'}`}
              to="/ai"
            >
              Analisi IA
            </Link>
            <Link className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700" to="/cases/new">
              Nuovo caso
            </Link>
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
      <main className="mx-auto w-full max-w-7xl px-4 py-6">{children}</main>
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
                <HomeRoute />
              </Layout>
            </Protected>
          }
        />
        <Route
          path="/dashboard"
          element={
            <Protected role="admin">
              <Layout>
                <Dashboard />
              </Layout>
            </Protected>
          }
        />
        <Route
          path="/ai"
          element={
            <Protected>
              <Layout>
                <AiAnalysis />
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
