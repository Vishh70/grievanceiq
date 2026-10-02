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

// --- New Civic Intelligence Pipeline Component ---
const PipelineVisualization = () => {
  return (
    <motion.section 
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-100px" }}
      variants={containerVariants}
      style={{ marginTop: '6rem', marginBottom: '4rem', width: '100%' }}
    >
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Civic Intelligence Pipeline</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>
          From a citizen's report to a coordinated, trackable civic issue.
        </p>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '600px', margin: '0.5rem auto 0' }}>
          GrievanceIQ combines semantic AI, complaint relationship analysis, issue aggregation, department mapping, and dependency-aware workflows.
        </p>
      </div>

      <div style={{
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        borderRadius: '24px',
        padding: '2rem',
        maxWidth: '1000px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        position: 'relative'
      }}>
        {/* Floating Badge */}
        <div style={{
          position: 'absolute', top: '-12px', right: '24px',
          background: 'var(--accent)', color: '#fff', fontSize: '0.75rem',
          padding: '4px 12px', borderRadius: '12px', fontWeight: 'bold',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}>
          Illustrative Example
        </div>

        {/* 1. Citizen Report */}
        <motion.div variants={itemVariants} className="card card-glass" style={{ textAlign: 'left', borderLeft: '4px solid var(--info)' }}>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span style={{ background: 'var(--info)', color: '#fff', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 'bold' }}>1</span>
            Citizen Report
          </h4>
          <p style={{ fontStyle: 'italic', color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '0.75rem' }}>
            "Road surface is badly damaged near the junction, water is leaking from the roadside pipeline, and the traffic signal is not working."
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px' }}>📍 Location detected</span>
            <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px' }}>📸 Evidence supported</span>
          </div>
        </motion.div>

        {/* 2. AI Issue Detection */}
        <motion.div variants={itemVariants} className="card card-glass" style={{ textAlign: 'left', borderLeft: '4px solid var(--accent)' }}>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span style={{ background: 'var(--accent)', color: '#fff', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 'bold' }}>2</span>
            AI Issue Detection
          </h4>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>Multi-label semantic analysis</p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', background: 'var(--danger)', color: '#fff', padding: '4px 10px', borderRadius: '12px' }}>Road Damage</span>
            <span style={{ fontSize: '0.8rem', background: 'var(--info)', color: '#fff', padding: '4px 10px', borderRadius: '12px' }}>Water Leakage</span>
            <span style={{ fontSize: '0.8rem', background: 'var(--warning)', color: '#000', padding: '4px 10px', borderRadius: '12px' }}>Traffic Signal</span>
          </div>
        </motion.div>

        {/* 3. Relationship Analysis */}
        <motion.div variants={itemVariants} className="card card-glass" style={{ textAlign: 'left', borderLeft: '4px solid var(--success)' }}>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span style={{ background: 'var(--success)', color: '#fff', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 'bold' }}>3</span>
            Relationship Analysis
          </h4>
          <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
            <span>Semantic similarity +</span>
            <span>Location proximity +</span>
            <span>Time proximity</span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', opacity: 0.5, border: '1px solid rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '4px' }}>Duplicate</span>
            <span style={{ fontSize: '0.75rem', opacity: 0.5, border: '1px solid rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '4px' }}>Similar</span>
            <span style={{ fontSize: '0.75rem', background: 'rgba(46, 204, 113, 0.2)', color: 'var(--success)', border: '1px solid var(--success)', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>Related</span>
            <span style={{ fontSize: '0.75rem', opacity: 0.5, border: '1px solid rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '4px' }}>Independent</span>
          </div>
        </motion.div>

        {/* 4. Civic Issue Aggregation */}
        <motion.div variants={itemVariants} className="card card-glass" style={{ textAlign: 'left', background: 'rgba(255,255,255,0.03)', borderLeft: '4px solid #fff' }}>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span style={{ background: '#fff', color: '#000', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 'bold' }}>4</span>
            Civic Issue Aggregation
          </h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px' }}>Complaint A</span>
              <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px' }}>Complaint B</span>
              <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px' }}>Complaint C</span>
            </div>
            <span style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>→</span>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.08)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <h5 style={{ margin: 0 }}>Unified Civic Issue</h5>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0 0' }}>Road + Water + Traffic issue</p>
              <p style={{ fontSize: '0.7rem', color: 'var(--accent)', margin: '0.5rem 0 0 0', fontWeight: 'bold', textTransform: 'uppercase' }}>Issue-level aggregation</p>
            </div>
          </div>
        </motion.div>

        {/* 5. Department Coordination */}
        <motion.div variants={itemVariants} className="card card-glass" style={{ textAlign: 'left', borderLeft: '4px solid var(--warning)' }}>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span style={{ background: 'var(--warning)', color: '#000', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 'bold' }}>5</span>
            Department Coordination
          </h4>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>AI-assisted department mapping</p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--danger)' }}></span>
              <span style={{ fontSize: '0.85rem' }}>Road Dept</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--info)' }}></span>
              <span style={{ fontSize: '0.85rem' }}>Water Dept</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--warning)' }}></span>
              <span style={{ fontSize: '0.85rem' }}>Public Safety</span>
            </div>
          </div>
        </motion.div>

        {/* 6. Dependency-Aware Workflow */}
        <motion.div variants={itemVariants} className="card card-glass" style={{ textAlign: 'left', borderLeft: '4px solid var(--accent)' }}>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span style={{ background: 'var(--accent)', color: '#fff', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 'bold' }}>6</span>
            Dependency-Aware Workflow
          </h4>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>Dependency-aware task ordering (Workflow coordination)</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><span style={{ color: 'var(--success)' }}>✓</span> Inspect Pipeline</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: '1rem', color: 'var(--text-secondary)' }}>↳ Repair Leakage</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: '2rem', color: 'var(--text-secondary)' }}>↳ Repair Road Surface</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}><span style={{ color: 'var(--success)' }}>✓</span> Verify Traffic Safety</div>
          </div>
        </motion.div>

        {/* 7. Resolution Tracking */}
        <motion.div variants={itemVariants} className="card card-glass" style={{ textAlign: 'left', borderLeft: '4px solid var(--success)' }}>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span style={{ background: 'var(--success)', color: '#fff', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 'bold' }}>7</span>
            Resolution Tracking
          </h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.8rem' }}>
            <span style={{ color: 'var(--success)' }}>Reported ✓</span> <span style={{ opacity: 0.5 }}>→</span>
            <span style={{ color: 'var(--success)' }}>Analyzed ✓</span> <span style={{ opacity: 0.5 }}>→</span>
            <span style={{ color: 'var(--success)' }}>Coordinated ✓</span> <span style={{ opacity: 0.5 }}>→</span>
            <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>In Progress ●</span> <span style={{ opacity: 0.5 }}>→</span>
            <span style={{ opacity: 0.5 }}>Resolved ○</span>
          </div>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: '0.5rem 0 0 0', textTransform: 'uppercase' }}>Illustrative status flow</p>
        </motion.div>
      </div>
    </motion.section>
  );
};

export default function Landing() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (user) return <Navigate to={user.role === 'admin' ? '/admin' : '/complaints'} replace />;

  const features = [
    { icon: <MapPin size={24} color="var(--info)" />, title: '01 Report', desc: 'Citizen submits the issue with description and location.' },
    { icon: <Zap size={24} color="var(--accent)" />, title: '02 Understand', desc: 'AI identifies relevant civic issue types.' },
    { icon: <ShieldCheck size={24} color="var(--success)" />, title: '03 Connect', desc: 'Related complaints are analyzed using semantic and contextual signals.' },
    { icon: <BarChart3 size={24} color="var(--warning)" />, title: '04 Aggregate', desc: 'Related reports are represented as a unified civic issue.' },
    { icon: <ShieldCheck size={24} color="var(--info)" />, title: '05 Coordinate', desc: 'Departments and dependent tasks are mapped.' },
    { icon: <Zap size={24} color="var(--danger)" />, title: '06 Track', desc: 'Progress is monitored through the resolution workflow.' },
  ];

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

      <main className="container" style={{ position: 'relative', zIndex: 10, textAlign: 'center', paddingTop: '8vh', paddingBottom: '4rem' }}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: 'easeOut' }}>
          <h1 style={{ fontSize: 'clamp(2.5rem, 6vw, 4rem)', lineHeight: 1.1, marginBottom: '1.5rem', background: 'linear-gradient(135deg, var(--text-primary), var(--accent))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Report → Understand → Connect<br />Aggregate → Coordinate → Track
          </h1>
          <p style={{ fontSize: '1.15rem', color: 'var(--text-secondary)', maxWidth: 700, margin: '0 auto 3rem' }}>
            GrievanceIQ is a complete Civic Intelligence Platform. From precision reporting to semantic vector deduplication and multi-department task orchestration, we turn chaotic civic feedback into coordinated action.
          </p>
          <div className="flex gap-1" style={{ justifyContent: 'center' }}>
            <Link to="/register" className="btn btn-primary btn-lg">Report an Issue</Link>
            <Link to="/login" className="btn btn-secondary btn-lg">Track Complaint</Link>
          </div>
        </motion.div>

        {/* --- Civic Intelligence Pipeline Visualization --- */}
        <PipelineVisualization />

        <motion.div 
          className="features-grid" 
          variants={containerVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          style={{ marginTop: '2rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}
        >
          {features.map((f, i) => (
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
