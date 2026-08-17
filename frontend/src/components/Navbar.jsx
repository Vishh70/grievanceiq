// src/components/Navbar.jsx
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, LayoutDashboard, FileText, PlusCircle } from 'lucide-react';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <div className="nav-inner">
        <Link to="/" className="nav-brand">
          <span>⚡</span> GrievanceIQ
        </Link>

        {user && (
          <div className="nav-links">
            {user.role === 'admin' ? (
              <Link to="/admin" className="btn btn-secondary btn-sm">
                <LayoutDashboard size={15} /> <span className="nav-text-hide-mobile">Dashboard</span>
              </Link>
            ) : (
              <>
                <Link to="/complaints/new" className="btn btn-primary btn-sm">
                  <PlusCircle size={15} /> <span className="nav-text-hide-mobile">New Complaint</span>
                </Link>
                <Link to="/complaints" className="btn btn-secondary btn-sm">
                  <FileText size={15} /> <span className="nav-text-hide-mobile">My Complaints</span>
                </Link>
              </>
            )}
            <span className="text-sm text-muted nav-text-hide-mobile" style={{ padding: '0 0.5rem' }}>
              {user.name}
            </span>
            <button className="btn btn-secondary btn-sm" onClick={handleLogout}>
              <LogOut size={15} /> <span className="nav-text-hide-mobile">Logout</span>
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
