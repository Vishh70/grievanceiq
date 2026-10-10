// frontend/src/pages/Profile.jsx
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User, LogOut, ShieldAlert } from 'lucide-react';

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const handleSignOut = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: '800px', paddingBottom: '6rem' }}>
        <h1 className="mb-2">My Civic Profile</h1>

        <div className="mb-2">
          {/* Identity Card */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card" style={{ textAlign: 'center' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--accent-glow)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
              <User size={40} />
            </div>
            <h2 style={{ marginBottom: '0.25rem' }}>{user.name}</h2>
            <p className="text-muted" style={{ marginBottom: '1rem' }}>{user.email}</p>
          </motion.div>
        </div>

        {/* Account Controls */}
        <div className="card" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem' }}>Account Session</div>
            <div className="text-xs text-muted">Signed in as {user.email} ({user.role})</div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <a href="/admin/login" className="btn btn-secondary btn-sm" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <ShieldAlert size={14} color="#ef4444" /> Admin Portal
            </a>
            <button className="btn btn-danger btn-sm" onClick={handleSignOut} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <LogOut size={14} /> Sign Out
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
