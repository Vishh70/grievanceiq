// src/components/ProtectedRoute.jsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Loader from './Loader';

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuth();

  if (loading) return <Loader text="Authenticating..." />;
  if (!user)   return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/complaints" replace />;

  return children;
}
