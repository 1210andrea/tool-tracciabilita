import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CreateCase from './pages/CreateCase';
import AdminPanel from './pages/AdminPanel';

function Protected({ children, role }: { children: React.ReactNode; role?: string }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <div className="p-6">Forbidden</div>;
  return <>{children}</>;
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
              <Dashboard />
            </Protected>
          }
        />
        <Route
          path="/cases/new"
          element={
            <Protected>
              <CreateCase />
            </Protected>
          }
        />
        <Route
          path="/admin"
          element={
            <Protected role="admin">
              <AdminPanel />
            </Protected>
          }
        />
      </Routes>
    </AuthProvider>
  );
}

