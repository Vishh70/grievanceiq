// src/pages/Register.jsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Eye, EyeOff, Users } from 'lucide-react';

export default function Register() {
  const [form, setForm]       = useState({ name: '', email: '', password: '', phone: '' });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { register }          = useAuth();
  const navigate              = useNavigate();

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const loadingToast = toast.loading('Creating account...');
    try {
      const user = await register(form.name, form.email, form.password, form.phone);
      toast.success('Registration successful!', { id: loadingToast });
      navigate(user.role === 'admin' ? '/admin' : '/complaints');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Registration failed. Please try again.', { id: loadingToast });
    } finally {
      setLoading(false);
    }
  };

  const handleMockSocial = (provider) => {
    toast.error(`${provider} registration is not configured in this demo.`);
  };

  return (
    <div className="auth-split-layout">
      {/* Left Form Side */}
      <div className="auth-left">
        <motion.div 
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, type: 'spring', bounce: 0.2 }}
          className="auth-form-container"
        >
          <div className="mb-2">
            <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '1.5rem', textDecoration: 'none' }}>
              <span>⚡</span> GrievanceIQ
            </Link>
            <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Create an account</h1>
            <p className="text-muted">Join your city's digital platform to start reporting.</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group" style={{ position: 'relative' }}>
              <input
                id="reg-name"
                className="form-input floating-input"
                type="text"
                name="name"
                placeholder=" "
                value={form.name}
                onChange={handleChange}
                required
              />
              <label className="floating-label" htmlFor="reg-name">Full Name</label>
            </div>
            
            <div className="form-group" style={{ position: 'relative' }}>
              <input
                id="reg-email"
                className="form-input floating-input"
                type="email"
                name="email"
                placeholder=" "
                value={form.email}
                onChange={handleChange}
                required
              />
              <label className="floating-label" htmlFor="reg-email">Email Address</label>
            </div>

            <div className="form-group" style={{ position: 'relative' }}>
              <input
                id="reg-phone"
                className="form-input floating-input"
                type="tel"
                name="phone"
                placeholder=" "
                value={form.phone}
                onChange={handleChange}
              />
              <label className="floating-label" htmlFor="reg-phone">Phone Number (optional)</label>
            </div>

            <div className="form-group" style={{ position: 'relative' }}>
              <input
                id="reg-password"
                className="form-input floating-input"
                type={showPassword ? 'text' : 'password'}
                name="password"
                placeholder=" "
                value={form.password}
                onChange={handleChange}
                required
                style={{ paddingRight: '2.5rem' }}
              />
              <label className="floating-label" htmlFor="reg-password">Password</label>
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="btn btn-primary btn-lg w-full mt-1"
              type="submit"
              disabled={loading}
            >
              {loading ? 'Creating Account…' : 'Sign up'}
            </motion.button>
          </form>

          <div className="divider">OR</div>

          <div className="flex gap-1 mb-2">
            <button type="button" className="social-btn" onClick={() => handleMockSocial('Google')}>
              <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" width="20" height="20" /> Google
            </button>
            <button type="button" className="social-btn" onClick={() => handleMockSocial('GitHub')}>
              <img src="https://www.svgrepo.com/show/512317/github-142.svg" alt="GitHub" width="20" height="20" /> GitHub
            </button>
          </div>

          <p className="text-center text-sm text-muted mt-2">
            Already have an account?{' '}
            <Link to="/login" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Sign in</Link>
          </p>
        </motion.div>
      </div>

      {/* Right Visual Side */}
      <div className="auth-right">
        {/* Animated Background Elements */}
        <div style={{ position: 'absolute', top: '20%', left: '-10%', width: '40vw', height: '40vw', background: 'rgba(255,255,255,0.1)', borderRadius: '50%', filter: 'blur(80px)' }}></div>
        <div style={{ position: 'absolute', bottom: '-10%', right: '-10%', width: '50vw', height: '50vw', background: 'rgba(0,0,0,0.15)', borderRadius: '50%', filter: 'blur(80px)' }}></div>
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          style={{ maxWidth: 460, position: 'relative', zIndex: 10, padding: '2rem' }}
        >
          <div style={{ display: 'inline-flex', padding: '1rem', background: 'rgba(255,255,255,0.1)', borderRadius: '16px', backdropFilter: 'blur(10px)', marginBottom: '1.5rem' }}>
            <Users size={48} color="#fff" />
          </div>
          <h2 style={{ fontSize: '2.5rem', color: '#fff', marginBottom: '1rem', lineHeight: 1.1 }}>Join a community of proactive citizens.</h2>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '1.1rem' }}>
            Report issues, track progress in real-time, and help administrators make data-driven decisions to improve your city's infrastructure.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
