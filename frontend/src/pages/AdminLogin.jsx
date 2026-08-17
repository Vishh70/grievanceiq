// src/pages/AdminLogin.jsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Eye, EyeOff, ShieldAlert } from 'lucide-react';

export default function AdminLogin() {
  const [form, setForm]       = useState({ email: 'system@grievanceiq.com', password: 'admin123' });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login, logout }     = useAuth();
  const navigate              = useNavigate();

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const loadingToast = toast.loading('Authenticating Admin...');
    try {
      const user = await login(form.email, form.password);
      
      // Strict Admin Check
      if (user.role !== 'admin') {
        logout(); // Force logout if a citizen tries to login here
        toast.error('Access Denied. You are not an administrator.', { id: loadingToast });
        return;
      }

      toast.success('Admin authentication successful.', { id: loadingToast });
      navigate('/admin');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Invalid credentials. Please try again.', { id: loadingToast });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-split-layout" style={{ background: '#0f172a' }}>
      {/* Left Form Side */}
      <div className="auth-left" style={{ background: '#0f172a', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
        <motion.div 
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, type: 'spring', bounce: 0.2 }}
          className="auth-form-container"
        >
          <div className="mb-2 text-center">
            <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.2rem', fontWeight: 800, color: '#fff', marginBottom: '1.5rem', textDecoration: 'none' }}>
              <span style={{ color: '#ef4444' }}>⚡</span> GrievanceIQ
            </Link>
            <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem', color: '#ef4444' }}>Admin Portal</h1>
            <p style={{ color: '#94a3b8' }}>Authorized Personnel Only</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group" style={{ position: 'relative' }}>
              <input
                id="admin-email"
                className="form-input floating-input"
                type="email"
                name="email"
                placeholder=" "
                value={form.email}
                onChange={handleChange}
                required
                style={{ background: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
              />
              <label className="floating-label" htmlFor="admin-email" style={{ color: '#94a3b8' }}>Administrator Email</label>
            </div>
            
            <div className="form-group" style={{ position: 'relative', marginTop: '1rem' }}>
              <input
                id="admin-password"
                className="form-input floating-input"
                type={showPassword ? 'text' : 'password'}
                name="password"
                placeholder=" "
                value={form.password}
                onChange={handleChange}
                required
                style={{ paddingRight: '2.5rem', background: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
              />
              <label className="floating-label" htmlFor="admin-password" style={{ color: '#94a3b8' }}>Password</label>
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="btn btn-lg w-full"
              type="submit"
              disabled={loading}
              style={{ background: '#ef4444', color: 'white', border: 'none', marginTop: '2rem' }}
            >
              {loading ? 'Authenticating…' : 'Secure Login'}
            </motion.button>
          </form>

          <p className="text-center text-sm mt-2" style={{ color: '#94a3b8' }}>
            Are you a citizen? <Link to="/login" style={{ fontWeight: 600, color: '#ef4444' }}>Go to Citizen Login</Link>
          </p>
        </motion.div>
      </div>

      {/* Right Visual Side */}
      <div className="auth-right mobile-hidden flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)' }}>
        {/* Background dark blobs */}
        <div style={{ position: 'absolute', top: '10%', right: '10%', width: '30vw', height: '30vw', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '50%', filter: 'blur(80px)' }}></div>
        <div style={{ position: 'absolute', bottom: '10%', left: '10%', width: '30vw', height: '30vw', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '50%', filter: 'blur(80px)' }}></div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          style={{ maxWidth: 460, position: 'relative', zIndex: 10, padding: '2rem', textAlign: 'center' }}
        >
          <div style={{ display: 'inline-flex', padding: '1.5rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '50%', marginBottom: '1.5rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
            <ShieldAlert size={64} color="#ef4444" />
          </div>
          <h2 style={{ fontSize: '2.5rem', color: '#fff', marginBottom: '1rem', lineHeight: 1.1 }}>Restricted Access</h2>
          <p style={{ color: '#cbd5e1', fontSize: '1.1rem' }}>
            This portal is strictly for authorized municipal administrators to review, categorize, and resolve citizen grievances. All actions are logged.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
