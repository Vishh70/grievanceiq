// src/components/Navbar.jsx
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, LayoutDashboard, FileText, PlusCircle, Globe, Trophy, User as UserIcon } from 'lucide-react';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      <nav className="navbar">
        <div className="nav-inner">
          <Link to="/" className="nav-brand">
            <span>⚡</span> GrievanceIQ
          </Link>

          {user && (
            <div className="nav-links desktop-nav-links">
              {user.role === 'admin' ? (
                <Link to="/admin" className="btn btn-secondary btn-sm">
                  <LayoutDashboard size={15} /> <span>Dashboard</span>
                </Link>
              ) : (
                <>
                  <Link to="/leaderboard" className="btn btn-secondary btn-sm" style={{ color: '#F59E0B' }}>
                    <Trophy size={15} /> <span>Leaderboard</span>
                  </Link>
                  <Link to="/feed" className="btn btn-secondary btn-sm" style={{ background: 'var(--accent-glow)', color: 'var(--accent-dark)', borderColor: 'var(--accent-light)' }}>
                    <Globe size={15} /> <span>Public Feed</span>
                  </Link>
                  <Link to="/complaints/new" className="btn btn-primary btn-sm">
                    <PlusCircle size={15} /> <span>New Complaint</span>
                  </Link>
                  <Link to="/complaints" className="btn btn-secondary btn-sm">
                    <FileText size={15} /> <span>My Complaints</span>
                  </Link>
                </>
              )}
              <Link to="/profile" className="text-sm text-muted" style={{ padding: '0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem', textDecoration: 'none' }}>
                <UserIcon size={16} /> <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{user.name}</span>
              </Link>
              <button className="btn btn-secondary btn-sm" onClick={handleLogout}>
                <LogOut size={15} /> <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Mobile Bottom Navigation */}
      {user && (
        <div className="mobile-bottom-nav">
          {user.role === 'admin' ? (
            <Link to="/admin" className={`mobile-nav-item ${location.pathname === '/admin' ? 'active' : ''}`}>
              <LayoutDashboard size={20} />
              <span>Dashboard</span>
            </Link>
          ) : (
            <>
              <Link to="/leaderboard" className={`mobile-nav-item ${location.pathname === '/leaderboard' ? 'active' : ''}`}>
                <Trophy size={20} />
                <span>Ranks</span>
              </Link>
              <Link to="/feed" className={`mobile-nav-item ${location.pathname === '/feed' ? 'active' : ''}`}>
                <Globe size={20} />
                <span>Feed</span>
              </Link>
              <Link to="/complaints" className={`mobile-nav-item ${location.pathname === '/complaints' ? 'active' : ''}`}>
                <FileText size={20} />
                <span>Mine</span>
              </Link>
              <Link to="/complaints/new" className={`mobile-nav-item mobile-nav-primary`}>
                <div className="icon-wrapper">
                  <PlusCircle size={24} />
                </div>
                <span style={{ marginTop: '2px' }}>New Issue</span>
              </Link>
            </>
          )}
          <Link to="/profile" className={`mobile-nav-item ${location.pathname === '/profile' ? 'active' : ''}`}>
            <UserIcon size={20} />
            <span>Profile</span>
          </Link>
        </div>
      )}
    </>
  );
}
