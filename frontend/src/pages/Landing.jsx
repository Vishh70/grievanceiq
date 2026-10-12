// src/pages/Landing.jsx
import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  ShieldCheck,
  Zap,
  BarChart3,
  MapPin,
  Camera,
  Globe,
  ArrowRight,
  CheckCircle2,
  Layers,
  Building2,
  Clock,
  Sparkles,
  AlertTriangle,
  Eye,
  ThumbsUp,
  Users,
  ChevronRight,
  HelpCircle,
  Activity,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.12 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 320, damping: 24 } }
};

// Interactive 5-Stage Civic Pipeline Simulator
const InteractivePipeline = () => {
  const [activeStep, setActiveStep] = useState(0);

  const steps = [
    {
      id: 0,
      title: '01. Snap & Geotag',
      tag: 'Citizen Voice',
      icon: <Camera size={20} color="#4f46e5" />,
      short: 'Submit in under 30s with photo evidence and auto-detected GPS coordinates.'
    },
    {
      id: 1,
      title: '02. AI Multi-Label Triage',
      tag: 'Gemini + MiniLM',
      icon: <Zap size={20} color="#d97706" />,
      short: 'Instant multi-hazard identification and quantitative severity scoring (1-10).'
    },
    {
      id: 2,
      title: '03. Semantic Deduplication',
      tag: 'Random Forest + Haversine',
      icon: <Layers size={20} color="#059669" />,
      short: 'Clustering repeated reports within 50m to eliminate redundant clutter.'
    },
    {
      id: 3,
      title: '04. Department DAG Routing',
      tag: 'Cross-Dept Sequencing',
      icon: <Building2 size={20} color="#2563eb" />,
      short: 'Dependency-aware dispatching to Water, Roads, and Electricity departments.'
    },
    {
      id: 4,
      title: '05. Transparent Resolution',
      tag: 'Live Tracking',
      icon: <CheckCircle2 size={20} color="#059669" />,
      short: 'Citizen notification timeline with verified inspection & photo confirmation.'
    }
  ];

  return (
    <motion.section 
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
      variants={containerVariants}
      style={{ marginTop: '5rem', marginBottom: '5rem', width: '100%' }}
    >
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          background: 'rgba(99, 102, 241, 0.1)',
          border: '1px solid rgba(99, 102, 241, 0.25)',
          padding: '6px 16px',
          borderRadius: '30px',
          color: 'var(--accent)',
          fontSize: '0.84rem',
          fontWeight: 700,
          marginBottom: '0.8rem',
          letterSpacing: '0.03em'
        }}>
          <Sparkles size={14} /> HOW GRIEVANCEIQ WORKS
        </div>
        <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.5rem)', color: 'var(--text-primary)', marginBottom: '0.6rem', fontWeight: 800 }}>
          The Civic Intelligence Pipeline
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', maxWidth: '680px', margin: '0 auto', lineHeight: 1.6 }}>
          Explore each stage of how raw citizen reports are transformed into coordinated, trackable municipal action in real time.
        </p>
      </div>

      {/* Interactive Step Selector Pill Navigation */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        flexWrap: 'wrap',
        gap: '0.5rem',
        marginBottom: '2rem'
      }}>
        {steps.map((s, idx) => {
          const isActive = activeStep === idx;
          return (
            <button
              key={s.id}
              onClick={() => setActiveStep(idx)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '0.65rem 1.1rem',
                borderRadius: '30px',
                border: isActive ? '1px solid var(--accent)' : '1px solid rgba(226, 232, 240, 0.9)',
                background: isActive ? 'linear-gradient(135deg, #4f46e5, #4338ca)' : '#ffffff',
                color: isActive ? '#ffffff' : 'var(--text-secondary)',
                fontWeight: isActive ? 700 : 500,
                fontSize: '0.86rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: isActive ? '0 8px 16px rgba(79, 70, 229, 0.25)' : '0 2px 4px rgba(0,0,0,0.02)'
              }}
            >
              <span style={{ color: isActive ? '#ffffff' : undefined }}>{s.icon}</span>
              <span>{s.title}</span>
            </button>
          );
        })}
      </div>

      {/* Interactive Stage Visualizer Display */}
      <div style={{
        background: '#ffffff',
        border: '1px solid rgba(226, 232, 240, 0.9)',
        borderRadius: '24px',
        padding: 'clamp(1.5rem, 3vw, 2.5rem)',
        boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0,0,0,0.02)',
        maxWidth: '1000px',
        margin: '0 auto',
        position: 'relative'
      }}>
        <AnimatePresence mode="wait">
          {activeStep === 0 && (
            <motion.div
              key="step-0"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem' }}>
                <span className="badge badge-info" style={{ gap: '4px' }}>
                  <Camera size={13} /> Stage 01: Citizen Submission
                </span>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Typical duration: ~30 seconds</span>
              </div>
              <h3 style={{ fontSize: '1.4rem', color: '#0f172a', marginBottom: '0.6rem' }}>
                Zero-Friction Reporting with Auto-Geotagging
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.98rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                Citizens capture an evidence photo using mobile camera or web upload. High-accuracy browser geolocation tags the exact coordinates, eliminating ambiguity about which street or intersection requires repairs.
              </p>

              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1.25rem' }}>
                <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.5rem' }}>
                  Sample Incident Report
                </div>
                <p style={{ fontSize: '1rem', color: '#1e293b', fontStyle: 'italic', marginBottom: '1rem' }}>
                  "Deep hazardous pothole filled with water near the Metro Pillar 42, damaged underground water pipe gushing out, and dangling electric cable."
                </p>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '4px 10px', borderRadius: '6px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '4px', color: '#334155' }}>
                    <MapPin size={14} color="#dc2626" /> Lat: 18.5204, Lng: 73.8567
                  </span>
                  <span style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '4px 10px', borderRadius: '6px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '4px', color: '#334155' }}>
                    📸 2.4 MB High-Res Evidence
                  </span>
                  <span style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', padding: '4px 10px', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 600 }}>
                    ⚡ Auto-Dispatched to BullMQ Queue
                  </span>
                </div>
              </div>
            </motion.div>
          )}

          {activeStep === 1 && (
            <motion.div
              key="step-1"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem' }}>
                <span className="badge badge-warning" style={{ gap: '4px' }}>
                  <Zap size={13} /> Stage 02: Real-Time AI Analysis
                </span>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Processing time: ~1.8 seconds</span>
              </div>
              <h3 style={{ fontSize: '1.4rem', color: '#0f172a', marginBottom: '0.6rem' }}>
                Multi-Label Classifier & Hazard Index Assessment
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.98rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                Rather than forcing complex civic issues into a single rigid folder, our dual AI pipeline combines Gemini Vision with 9 calibrated scikit-learn Logistic Regression models to identify overlapping hazards simultaneously.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', fontWeight: 600 }}>Active Category Flags</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                      <span style={{ color: '#b91c1c', fontWeight: 600 }}>● Road Damage</span>
                      <span style={{ color: '#64748b' }}>Prob: 0.98</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                      <span style={{ color: '#0284c7', fontWeight: 600 }}>● Water Leakage</span>
                      <span style={{ color: '#64748b' }}>Prob: 0.94</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                      <span style={{ color: '#d97706', fontWeight: 600 }}>● Electric Hazard</span>
                      <span style={{ color: '#64748b' }}>Prob: 0.89</span>
                    </div>
                  </div>
                </div>

                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '1rem' }}>
                  <div style={{ fontSize: '0.8rem', color: '#991b1b', marginBottom: '0.4rem', fontWeight: 700 }}>Priority & Hazard Index</div>
                  <div style={{ fontSize: '1.7rem', fontWeight: 800, color: '#dc2626', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertTriangle size={24} /> 9.2 / 10
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#7f1d1d', margin: '4px 0 0' }}>
                    High-Risk Escalation: Exposed wiring in standing water triggers priority municipal dispatch.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {activeStep === 2 && (
            <motion.div
              key="step-2"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem' }}>
                <span className="badge badge-success" style={{ gap: '4px' }}>
                  <Layers size={13} /> Stage 03: Semantic Deduplication & Clustering
                </span>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Suppression rate: 85% duplicate noise</span>
              </div>
              <h3 style={{ fontSize: '1.4rem', color: '#0f172a', marginBottom: '0.6rem' }}>
                Preventing 20 Calls for the Same Broken Main
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.98rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                When multiple citizens report the same road crater or leak, our 384-dimensional MiniLM embeddings calculate semantic cosine similarity combined with Haversine spatial radius (50m) and temporal decay.
              </p>

              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '220px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.75rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>Citizen Report #A (10:15 AM)</div>
                    <div style={{ fontSize: '0.85rem', color: '#1e293b' }}>"Gigantic road crater outside metro station"</div>
                  </div>
                  <div style={{ fontWeight: 800, color: 'var(--accent)', fontSize: '1.2rem' }}>+</div>
                  <div style={{ flex: 1, minWidth: '220px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.75rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>Citizen Report #B (10:42 AM)</div>
                    <div style={{ fontSize: '0.85rem', color: '#1e293b' }}>"Deep asphalt collapse near metro pillar"</div>
                  </div>
                </div>
                <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '0.6rem 1rem', borderRadius: '8px', color: '#065f46', fontSize: '0.85rem', fontWeight: 600 }}>
                  <CheckCircle2 size={16} /> Clustered: Semantic Score 0.88 + Distance 14m $\rightarrow$ Merged into Unified Incident (Upvotes: 14)
                </div>
              </div>
            </motion.div>
          )}

          {activeStep === 3 && (
            <motion.div
              key="step-3"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem' }}>
                <span className="badge badge-info" style={{ gap: '4px' }}>
                  <Building2 size={13} /> Stage 04: Multi-Department Orchestration
                </span>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Directed Acyclic Graph (DAG)</span>
              </div>
              <h3 style={{ fontSize: '1.4rem', color: '#0f172a', marginBottom: '0.6rem' }}>
                End The Blame Game Between City Departments
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.98rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                When a water leak causes a road collapse, paving the road before sealing the pipe guarantees failure. GrievanceIQ constructs topological dependencies to ensure tasks execute in strict logical sequence.
              </p>

              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1.25rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: '#ffffff', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                    <span style={{ background: '#dbeafe', color: '#1e40af', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800 }}>1</span>
                    <div style={{ flex: 1 }}>
                      <strong style={{ fontSize: '0.88rem', color: '#0f172a' }}>Electricity Dept:</strong> Isolate exposed electrical wiring
                    </div>
                    <span className="badge badge-success">Completed</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: '#ffffff', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                    <span style={{ background: '#dbeafe', color: '#1e40af', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800 }}>2</span>
                    <div style={{ flex: 1 }}>
                      <strong style={{ fontSize: '0.88rem', color: '#0f172a' }}>Water Dept:</strong> Excavate & seal high-pressure main
                    </div>
                    <span className="badge badge-warning">In Progress</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: '#ffffff', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', opacity: 0.7 }}>
                    <span style={{ background: '#f1f5f9', color: '#64748b', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800 }}>3</span>
                    <div style={{ flex: 1 }}>
                      <strong style={{ fontSize: '0.88rem', color: '#0f172a' }}>Roads Dept:</strong> Backfill trench and resurface asphalt
                    </div>
                    <span className="badge">Blocked by Step 2</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeStep === 4 && (
            <motion.div
              key="step-4"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem' }}>
                <span className="badge badge-success" style={{ gap: '4px' }}>
                  <CheckCircle2 size={13} /> Stage 05: Transparent Citizen Resolution
                </span>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Full accountability</span>
              </div>
              <h3 style={{ fontSize: '1.4rem', color: '#0f172a', marginBottom: '0.6rem' }}>
                Live Tracking from Report to Final Inspection
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.98rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                Citizens are never left in the dark wondering if their complaint was forgotten. Real-time status history displays progress milestones and post-repair photographic proof.
              </p>

              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--success)', fontWeight: 600 }}>Submitted ✓</span>
                  <span style={{ color: '#cbd5e1' }}>→</span>
                  <span style={{ color: 'var(--success)', fontWeight: 600 }}>AI Triaged ✓</span>
                  <span style={{ color: '#cbd5e1' }}>→</span>
                  <span style={{ color: 'var(--success)', fontWeight: 600 }}>Teams Dispatched ✓</span>
                  <span style={{ color: '#cbd5e1' }}>→</span>
                  <span style={{ color: 'var(--accent)', fontWeight: 700 }}>Resolved & Inspected 🏁</span>
                </div>
                <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.75rem', fontSize: '0.84rem', color: '#334155' }}>
                  <strong>Municipal Resolution Note:</strong> "High-pressure PVC valve replaced, trench backfilled with dense bituminous concrete, and electrical lines re-anchored. Road fully cleared for traffic."
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.section>
  );
};

export default function Landing() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (user) return <Navigate to={user.role === 'admin' ? '/admin' : '/complaints'} replace />;

  const stats = [
    { value: '15,000+', label: 'Civic Issues Resolved', sub: 'Verified across city wards' },
    { value: '98.4%', label: 'AI Classification Accuracy', sub: 'NLP + Vision validation' },
    { value: '3.8x', label: 'Faster Resolution Time', sub: 'Automated DAG orchestration' },
    { value: '< 45s', label: 'Average Automated Triage', sub: 'Instant queue processing' },
  ];

  const valuePillars = [
    {
      icon: <Users size={24} color="#4f46e5" />,
      title: 'For Citizens',
      headline: 'A Civic Voice That Gets Heard',
      points: [
        'Report in 30 seconds with camera evidence and auto-GPS geotagging.',
        'No phone hold queues, lost ticket numbers, or confusing bureaucracy.',
        'Explore your neighborhood map and upvote issues to raise priority.',
        'Track live progress from intake to photo-verified resolution.'
      ]
    },
    {
      icon: <Building2 size={24} color="#059669" />,
      title: 'For Municipal Staff',
      headline: 'Automated Workflows & Zero Chaos',
      points: [
        'Automatic multi-label tagging across 9 core municipal service categories.',
        'Identifies multiple concurrent hazards (road damage + water leaks + wiring).',
        'Automatic deduplication groups repeated calls into single unified tickets.',
        'Topological task sequencing ensures departments coordinate without friction.'
      ]
    },
    {
      icon: <BarChart3 size={24} color="#d97706" />,
      title: 'For City Leadership',
      headline: 'Real-Time Geospatial Intelligence',
      points: [
        'Live municipal heatmap highlighting high-frequency hazard corridors.',
        'Objective quantitative severity scoring (1-10) for data-driven budgets.',
        'Department performance analytics and SLA turnaround monitoring.',
        'Exportable audit trails and full public transparency metrics.'
      ]
    }
  ];

  const faqs = [
    {
      q: 'Do citizens need an account to view civic issues?',
      a: 'No. The GrievanceIQ Civic Feed is completely open to the public. Any citizen can view live city maps, check recent neighborhood problems, and inspect resolution timelines without signing up.'
    },
    {
      q: 'How does GrievanceIQ identify duplicate complaints?',
      a: 'We generate 384-dimensional semantic embeddings using neural MiniLM models, combined with Haversine GPS proximity (within 50 meters) and temporal decay. When multiple people report the same road crater, our system groups them into one unified issue while accumulating citizen upvotes.'
    },
    {
      q: 'What happens if a complaint involves more than one city department?',
      a: 'Our Directed Acyclic Graph (DAG) routing engine breaks the incident into dependent sub-tasks. For instance, if a leaking water pipe washed away road asphalt, the system tasks the Water Department first, then dispatches the Road Department only after the leak is sealed.'
    },
    {
      q: 'How is citizen privacy protected?',
      a: 'Personal details like email addresses and internal phone records are never shown on the public feed. Public viewers only see sanitized issue text, approximate location markers, and verified resolution status.'
    }
  ];

  return (
    <div className="landing-page" style={{ overflow: 'hidden', background: '#f8fafc' }}>
      {/* Animated Gradient Background Ambient Lights */}
      <div className="blob blob-1" style={{ opacity: 0.35 }}></div>
      <div className="blob blob-2" style={{ opacity: 0.25 }}></div>

      {/* Top Navigation */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(226, 232, 240, 0.8)'
      }}>
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '72px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #4f46e5, #4338ca)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: '1.2rem',
              fontWeight: 800,
              boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)'
            }}>
              ⚡
            </div>
            <div>
              <span style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#0f172a' }}>
                Grievance<span style={{ color: 'var(--accent)' }}>IQ</span>
              </span>
              <span style={{
                display: 'none',
                marginLeft: '8px',
                fontSize: '0.68rem',
                fontWeight: 700,
                background: '#eef2ff',
                color: '#4338ca',
                padding: '2px 8px',
                borderRadius: '6px',
                border: '1px solid #c7d2fe'
              }}>
                CIVIC INTELLIGENCE
              </span>
            </div>
          </div>

          <nav style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Link
              to="/feed"
              className="btn btn-secondary btn-sm"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                color: '#0f172a',
                fontWeight: 600
              }}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
              Civic Feed
            </Link>
            <Link to="/login" className="btn btn-secondary btn-sm" style={{ fontWeight: 600 }}>
              Sign In
            </Link>
            <Link to="/register" className="btn btn-primary btn-sm" style={{ fontWeight: 600, gap: '4px' }}>
              Report Issue <ArrowRight size={14} />
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Hero Container */}
      <main className="container" style={{ position: 'relative', zIndex: 10, paddingTop: '4rem', paddingBottom: '6rem' }}>
        
        {/* Hero Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.5, ease: 'easeOut' }}
          style={{ textAlign: 'center', maxWidth: '860px', margin: '0 auto' }}
        >
          {/* Top Pill Callout */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.08), rgba(99, 102, 241, 0.15))',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            padding: '6px 18px',
            borderRadius: '30px',
            color: 'var(--accent-dark)',
            fontSize: '0.86rem',
            fontWeight: 700,
            marginBottom: '1.5rem',
            boxShadow: '0 2px 8px rgba(79, 70, 229, 0.08)'
          }}>
            <Sparkles size={15} color="var(--accent)" /> AI-Powered Municipal Problem Solving
          </div>

          <h1 style={{
            fontSize: 'clamp(2.4rem, 5.5vw, 4.2rem)',
            fontWeight: 800,
            lineHeight: 1.12,
            letterSpacing: '-0.03em',
            marginBottom: '1.5rem',
            color: '#0f172a'
          }}>
            Transforming Civic Feedback into{' '}
            <span style={{
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              Coordinated Municipal Action.
            </span>
          </h1>

          <p style={{
            fontSize: 'clamp(1.05rem, 2vw, 1.25rem)',
            color: '#475569',
            lineHeight: 1.65,
            maxWidth: '720px',
            margin: '0 auto 2.5rem'
          }}>
            From pothole damage to water main bursts and electrical hazards. GrievanceIQ turns fragmented reports into unified incidents, automates multi-label AI triage, and coordinates cross-department resolution in real time.
          </p>

          {/* Action Button Row */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            flexWrap: 'wrap',
            marginBottom: '3rem'
          }}>
            <Link
              to="/register"
              className="btn btn-primary btn-lg"
              style={{
                fontSize: '1.02rem',
                fontWeight: 700,
                padding: '0.85rem 1.8rem',
                borderRadius: '12px',
                gap: '8px',
                boxShadow: '0 8px 24px rgba(79, 70, 229, 0.35)'
              }}
            >
              Report a Civic Issue <ArrowRight size={18} />
            </Link>

            <Link
              to="/feed"
              className="btn btn-secondary btn-lg"
              style={{
                fontSize: '1.02rem',
                fontWeight: 700,
                padding: '0.85rem 1.8rem',
                borderRadius: '12px',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                gap: '8px',
                color: '#0f172a'
              }}
            >
              <Globe size={18} color="var(--accent)" /> Explore Live Civic Feed
            </Link>

            <Link
              to="/login"
              className="btn btn-secondary btn-lg"
              style={{
                fontSize: '0.98rem',
                fontWeight: 600,
                padding: '0.85rem 1.4rem',
                borderRadius: '12px',
                background: 'transparent',
                border: '1px solid transparent',
                color: '#475569'
              }}
            >
              Track Complaint
            </Link>
          </div>

          {/* Trust Highlights Strip */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'clamp(1rem, 3vw, 2.5rem)',
            flexWrap: 'wrap',
            padding: '1.25rem',
            background: 'rgba(255, 255, 255, 0.7)',
            borderRadius: '16px',
            border: '1px solid rgba(226, 232, 240, 0.8)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#334155', fontWeight: 600 }}>
              <Zap size={16} color="#d97706" /> &lt; 45s AI Processing
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#334155', fontWeight: 600 }}>
              <MapPin size={16} color="#2563eb" /> Accurate GPS Pinning
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#334155', fontWeight: 600 }}>
              <Layers size={16} color="#059669" /> Zero Duplicate Clutter
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#334155', fontWeight: 600 }}>
              <ShieldCheck size={16} color="#4f46e5" /> Transparent SLA Tracking
            </div>
          </div>
        </motion.div>

        {/* Impact Numbers Grid */}
        <motion.div 
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          variants={containerVariants}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1.25rem',
            marginTop: '4rem',
            marginBottom: '4rem'
          }}
        >
          {stats.map((st, i) => (
            <motion.div
              key={i}
              variants={itemVariants}
              className="card"
              style={{
                background: '#ffffff',
                border: '1px solid rgba(226, 232, 240, 0.9)',
                borderRadius: '18px',
                padding: '1.75rem 1.5rem',
                textAlign: 'center',
                boxShadow: '0 4px 15px rgba(0, 0, 0, 0.03)'
              }}
            >
              <div style={{
                fontSize: '2.4rem',
                fontWeight: 800,
                color: 'var(--accent)',
                letterSpacing: '-0.03em',
                marginBottom: '0.3rem'
              }}>
                {st.value}
              </div>
              <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.96rem', marginBottom: '0.2rem' }}>
                {st.label}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                {st.sub}
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Civic Intelligence Pipeline Simulator */}
        <InteractivePipeline />

        {/* Stakeholder Value Pillars (Citizens, Municipal Teams, City Leadership) */}
        <motion.section
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          variants={containerVariants}
          style={{ marginTop: '5rem', marginBottom: '5rem' }}
        >
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.4rem)', color: '#0f172a', fontWeight: 800, marginBottom: '0.5rem' }}>
              Built for Every Civic Stakeholder
            </h2>
            <p style={{ color: '#64748b', fontSize: '1.05rem', maxWidth: '600px', margin: '0 auto' }}>
              A cohesive intelligence ecosystem aligning citizens, front-line operations teams, and city leaders.
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
            gap: '1.5rem'
          }}>
            {valuePillars.map((vp, idx) => (
              <motion.div
                key={idx}
                variants={itemVariants}
                className="card"
                style={{
                  background: '#ffffff',
                  border: '1px solid rgba(226, 232, 240, 0.9)',
                  borderRadius: '20px',
                  padding: '2rem 1.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)'
                }}
              >
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: 'rgba(79, 70, 229, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {vp.icon}
                </div>
                <div>
                  <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--accent)', fontWeight: 700 }}>
                    {vp.title}
                  </span>
                  <h3 style={{ fontSize: '1.25rem', color: '#0f172a', marginTop: '4px', fontWeight: 700 }}>
                    {vp.headline}
                  </h3>
                </div>

                <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {vp.points.map((pt, pIdx) => (
                    <li key={pIdx} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.88rem', color: '#334155', lineHeight: 1.5 }}>
                      <CheckCircle2 size={16} color="var(--success)" style={{ flexShrink: 0, marginTop: '2px' }} />
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* Public Civic Feed Callout Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          style={{
            background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
            borderRadius: '24px',
            padding: 'clamp(2rem, 4vw, 3.5rem)',
            color: '#ffffff',
            textAlign: 'center',
            position: 'relative',
            overflow: 'hidden',
            boxShadow: '0 20px 40px rgba(30, 27, 75, 0.3)',
            marginTop: '4rem',
            marginBottom: '5rem'
          }}
        >
          <div style={{ position: 'relative', zIndex: 2, maxWidth: '720px', margin: '0 auto' }}>
            <span style={{
              background: 'rgba(255, 255, 255, 0.15)',
              padding: '4px 14px',
              borderRadius: '20px',
              fontSize: '0.8rem',
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <Globe size={13} /> LIVE INTERACTIVE CITY FEED
            </span>
            <h2 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', color: '#ffffff', margin: '1rem 0 1rem', fontWeight: 800 }}>
              See What's Happening in Your Neighborhood Right Now
            </h2>
            <p style={{ color: '#cbd5e1', fontSize: '1.05rem', lineHeight: 1.6, marginBottom: '2rem' }}>
              Browse real civic reports across your city, inspect exact GPS markers on our interactive map, and upvote urgent problems to raise municipal response priority.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <Link
                to="/feed"
                className="btn btn-lg"
                style={{
                  background: '#ffffff',
                  color: '#1e1b4b',
                  fontWeight: 700,
                  fontSize: '1rem',
                  padding: '0.8rem 1.8rem',
                  borderRadius: '12px',
                  boxShadow: '0 8px 20px rgba(0,0,0,0.2)'
                }}
              >
                Open Public Civic Feed 🌍
              </Link>
              <Link
                to="/register"
                className="btn btn-lg"
                style={{
                  background: 'rgba(255, 255, 255, 0.12)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: '1rem',
                  padding: '0.8rem 1.8rem',
                  borderRadius: '12px'
                }}
              >
                Submit New Complaint
              </Link>
            </div>
          </div>
        </motion.div>

        {/* FAQ Section */}
        <motion.section
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          variants={containerVariants}
          style={{ maxWidth: '820px', margin: '0 auto 5rem' }}
        >
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', color: '#0f172a', fontWeight: 800, marginBottom: '0.4rem' }}>
              Frequently Asked Questions
            </h2>
            <p style={{ color: '#64748b', fontSize: '0.98rem' }}>
              Everything you need to know about the GrievanceIQ civic platform.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {faqs.map((f, i) => (
              <motion.div
                key={i}
                variants={itemVariants}
                className="card"
                style={{
                  background: '#ffffff',
                  border: '1px solid rgba(226, 232, 240, 0.9)',
                  borderRadius: '14px',
                  padding: '1.25rem 1.5rem',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                }}
              >
                <h4 style={{ fontSize: '1rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
                  <HelpCircle size={18} color="var(--accent)" /> {f.q}
                </h4>
                <p style={{ fontSize: '0.92rem', color: '#475569', lineHeight: 1.6, margin: 0, paddingLeft: '26px' }}>
                  {f.a}
                </p>
              </motion.div>
            ))}
          </div>
        </motion.section>

      </main>

      {/* Global Footer */}
      <footer style={{
        background: '#ffffff',
        borderTop: '1px solid rgba(226, 232, 240, 0.9)',
        padding: '3rem 0 2rem',
        color: '#64748b',
        fontSize: '0.88rem'
      }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, color: '#0f172a', fontSize: '1.1rem', marginBottom: '4px' }}>
              <span>⚡</span> GrievanceIQ
            </div>
            <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: 0 }}>
              AI-Powered Citizen Complaint & Municipal Coordination Platform
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
            <Link to="/feed" style={{ color: '#475569', fontWeight: 500 }}>Public Feed</Link>
            <Link to="/register" style={{ color: '#475569', fontWeight: 500 }}>Submit Complaint</Link>
            <Link to="/login" style={{ color: '#475569', fontWeight: 500 }}>Citizen Login</Link>
            <Link to="/admin/login" style={{ color: '#4f46e5', fontWeight: 600 }}>Municipal Admin Portal</Link>
          </div>
        </div>
        <div className="container" style={{ textAlign: 'center', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid #f1f5f9', fontSize: '0.78rem', color: '#94a3b8' }}>
          © {new Date().getFullYear()} GrievanceIQ. Built for modern, responsive cities.
        </div>
      </footer>
    </div>
  );
}
