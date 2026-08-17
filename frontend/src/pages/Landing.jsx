// src/pages/Landing.jsx
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, Zap, BarChart3, MapPin } from 'lucide-react';
import { motion } from 'framer-motion';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.15 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
};

export default function Landing() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (user) return <Navigate to={user.role === 'admin' ? '/admin' : '/complaints'} replace />;

  return (
    <div className="landing-page" style={{ overflow: 'hidden' }}>
      {/* Animated Background Blobs */}
      <div className="blob blob-1"></div>
      <div className="blob blob-2"></div>

      <nav className="navbar" style={{ background: 'transparent', border: 'none' }}>
        <div className="nav-inner">
          <div className="nav-brand">
            <span>⚡</span> GrievanceIQ
          </div>
          <div className="nav-links">
            <Link to="/login" className="btn btn-secondary">Sign In</Link>
            <Link to="/register" className="btn btn-primary">Get Started</Link>
          </div>
        </div>
      </nav>

      <main className="container" style={{ position: 'relative', zIndex: 10, textAlign: 'center', paddingTop: '8vh' }}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: 'easeOut' }}>
          <h1 style={{ fontSize: 'clamp(2.5rem, 6vw, 4rem)', lineHeight: 1.1, marginBottom: '1.5rem', background: 'linear-gradient(135deg, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Next-Gen Civic <br/> Intelligence Platform
          </h1>
          <p style={{ fontSize: '1.15rem', color: 'var(--text-secondary)', maxWidth: 600, margin: '0 auto 3rem' }}>
            Submit, track, and manage civic issues. Powered by AI to automatically route your complaints to the right department for faster resolution.
          </p>
          <div className="flex gap-1" style={{ justifyContent: 'center' }}>
            <Link to="/register" className="btn btn-primary btn-lg">Report an Issue</Link>
            <Link to="/login" className="btn btn-secondary btn-lg">Track Complaint</Link>
          </div>
        </motion.div>

        <motion.div 
          className="features-grid" 
          variants={containerVariants}
          initial="hidden"
          animate="show"
          style={{ marginTop: '5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '2rem' }}
        >
          {[
            { icon: <Zap size={24} color="var(--accent)" />, title: 'AI Classification', desc: 'Automatically categorizes issues using Gemini AI.' },
            { icon: <MapPin size={24} color="var(--warning)" />, title: 'Precision Mapping', desc: 'Pinpoint exact locations for rapid civic response.' },
            { icon: <ShieldCheck size={24} color="var(--success)" />, title: 'Smart Routing', desc: 'Issues are sent straight to the correct department.' },
            { icon: <BarChart3 size={24} color="var(--info)" />, title: 'Admin Analytics', desc: 'Real-time dashboard for city administrators.' },
          ].map((f, i) => (
            <motion.div 
              key={i} 
              variants={itemVariants}
              whileHover={{ y: -8, scale: 1.02, boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.2), 0 8px 10px -6px rgb(0 0 0 / 0.2)' }}
              className="card card-glass" 
              style={{ textAlign: 'left', transition: 'box-shadow 0.3s ease' }}
            >
              <div style={{ background: 'rgba(255,255,255,0.05)', display: 'inline-flex', padding: '0.75rem', borderRadius: '12px', marginBottom: '1rem' }}>
                {f.icon}
              </div>
              <h3 style={{ marginBottom: '0.5rem' }}>{f.title}</h3>
              <p className="text-sm">{f.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </main>
    </div>
  );
}
