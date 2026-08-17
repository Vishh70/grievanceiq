// src/components/Navbar.jsx
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, LayoutDashboard, FileText, PlusCircle } from 'lucide-react';

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
                  <Link to="/complaints/new" className="btn btn-primary btn-sm">
                    <PlusCircle size={15} /> <span>New Complaint</span>
                  </Link>
                  <Link to="/complaints" className="btn btn-secondary btn-sm">
                    <FileText size={15} /> <span>My Complaints</span>
                  </Link>
                </>
              )}
              <span className="text-sm text-muted" style={{ padding: '0 0.5rem' }}>
                {user.name}
              </span>
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
              <Link to="/complaints" className={`mobile-nav-item ${location.pathname === '/complaints' ? 'active' : ''}`}>
                <FileText size={20} />
                <span>My Complaints</span>
              </Link>
              <Link to="/complaints/new" className={`mobile-nav-item mobile-nav-primary`}>
                <div className="icon-wrapper">
                  <PlusCircle size={24} />
                </div>
                <span style={{ marginTop: '2px' }}>New Issue</span>
              </Link>
            </>
          )}
          <button className="mobile-nav-item" onClick={handleLogout}>
            <LogOut size={20} />
            <span>Logout</span>
          </button>
        </div>
      )}
    </>
  );
}
