// src/pages/Login.jsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';

export default function Login() {
  const [form, setForm]       = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login }             = useAuth();
  const navigate              = useNavigate();

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const loadingToast = toast.loading('Authenticating...');
    try {
      const user = await login(form.email, form.password);
      toast.success('Welcome back!', { id: loadingToast });
      navigate(user.role === 'admin' ? '/admin' : '/complaints');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Invalid credentials. Please try again.', { id: loadingToast });
    } finally {
      setLoading(false);
    }
  };

  const handleMockSocial = (provider) => {
    toast.error(`${provider} login is not configured in this demo.`);
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
            <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '2rem', textDecoration: 'none' }}>
              <span>⚡</span> GrievanceIQ
            </Link>
            <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Welcome back</h1>
            <p className="text-muted">Enter your details to access your dashboard.</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group" style={{ position: 'relative' }}>
              <input
                id="login-email"
                className="form-input floating-input"
                type="email"
                name="email"
                placeholder=" "
                value={form.email}
                onChange={handleChange}
                required
              />
              <label className="floating-label" htmlFor="login-email">Email Address</label>
            </div>
            
            <div className="form-group" style={{ position: 'relative' }}>
              <input
                id="login-password"
                className="form-input floating-input"
                type={showPassword ? 'text' : 'password'}
                name="password"
                placeholder=" "
                value={form.password}
                onChange={handleChange}
                required
                style={{ paddingRight: '2.5rem' }}
              />
              <label className="floating-label" htmlFor="login-password">Password</label>
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <div className="flex items-center justify-between mb-2">
              <label className="flex items-center gap-1 text-sm text-muted cursor-pointer">
                <input type="checkbox" style={{ accentColor: 'var(--accent)' }} /> Remember me
              </label>
              <a href="#" className="text-sm" onClick={(e) => { e.preventDefault(); toast("Forgot password flow is disabled.", { icon: "ℹ️" }) }}>Forgot password?</a>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="btn btn-primary btn-lg w-full"
              type="submit"
              disabled={loading}
            >
              {loading ? 'Signing in…' : 'Sign in to your account'}
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
            Don't have an account?{' '}
            <Link to="/register" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Sign up</Link>
          </p>
        </motion.div>
      </div>

      {/* Right Visual Side */}
      <div className="auth-right">
        {/* Animated Background Elements */}
        <div style={{ position: 'absolute', top: '-10%', right: '-10%', width: '50vw', height: '50vw', background: 'rgba(255,255,255,0.1)', borderRadius: '50%', filter: 'blur(80px)' }}></div>
        <div style={{ position: 'absolute', bottom: '-20%', left: '-10%', width: '40vw', height: '40vw', background: 'rgba(0,0,0,0.1)', borderRadius: '50%', filter: 'blur(80px)' }}></div>
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          style={{ maxWidth: 460, position: 'relative', zIndex: 10, padding: '2rem' }}
        >
          <div style={{ display: 'inline-flex', padding: '1rem', background: 'rgba(255,255,255,0.1)', borderRadius: '16px', backdropFilter: 'blur(10px)', marginBottom: '1.5rem' }}>
            <ShieldCheck size={48} color="#fff" />
          </div>
          <h2 style={{ fontSize: '2.5rem', color: '#fff', marginBottom: '1rem', lineHeight: 1.1 }}>Transform your city with data-driven civic action.</h2>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '1.1rem' }}>
            GrievanceIQ uses advanced AI to automatically categorize and route citizen complaints to the correct municipal departments, cutting resolution times by up to 60%.
          </p>
          
          <div className="mt-2 flex items-center gap-1">
            <div style={{ display: 'flex' }}>
              {[1,2,3,4].map(i => (
                <div key={i} style={{ width: 32, height: 32, borderRadius: '50%', background: '#ccc', border: '2px solid var(--accent)', marginLeft: i > 1 ? '-10px' : '0', backgroundImage: `url(https://i.pravatar.cc/100?img=${i+10})`, backgroundSize: 'cover' }}></div>
              ))}
            </div>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.9)' }}>Trusted by 10,000+ citizens.</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
