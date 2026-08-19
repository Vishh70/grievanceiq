import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import Skeleton from '../components/Skeleton';
import { useAuth } from '../context/AuthContext';
import { MapPin, Calendar, Clock, AlertTriangle, Layers, Building, MessageSquare, Maximize2, X, CheckCircle2, ChevronLeft, Map, Globe, PlusCircle, Zap, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import ComplaintMap from '../components/ComplaintMap';

export default function ComplaintDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [complaint, setComplaint] = useState(null);
  const [similar, setSimilar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState(false);

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        const { data } = await api.get(`/complaints/${id}`);
        setComplaint(data.complaint);
        if (data.complaint.similarGroupId) {
          const simRes = await api.get(`/complaints/${id}/similar`);
          setSimilar(simRes.data.similar || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [id]);

  if (loading) return (
    <div className="page container">
      <Skeleton style={{ height: 180, borderRadius: 'var(--radius-md)', marginBottom: '2rem' }} />
      <div className="grid-responsive-sidebar" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '2rem' }}>
        <Skeleton style={{ height: 400, borderRadius: 'var(--radius-md)' }} />
        <Skeleton style={{ height: 400, borderRadius: 'var(--radius-md)' }} />
      </div>
    </div>
  );

  if (!complaint) return (
    <div className="page container" style={{ minHeight: '65vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="card text-center" 
        style={{ 
          maxWidth: '480px', 
          width: '100%',
          padding: '2.5rem 2rem', 
          background: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
          borderRadius: 'var(--radius-md)'
        }}
      >
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 1.25rem',
          color: '#ef4444'
        }}>
          <AlertTriangle size={32} />
        </div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.5rem', color: '#f8fafc' }}>
          Complaint Not Found
        </h2>
        <p className="text-muted text-sm" style={{ marginBottom: '1.5rem', lineHeight: 1.6 }}>
          The requested complaint ID does not exist or may have been removed. Explore the community feed to view active civic issues.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <Link to="/feed" className="btn btn-primary" style={{ textDecoration: 'none', justifyContent: 'center', gap: '0.4rem', padding: '0.65rem' }}>
            <Globe size={16} /> Explore Public Civic Feed
          </Link>
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <Link to="/complaints" className="btn btn-secondary" style={{ textDecoration: 'none', flex: 1, justifyContent: 'center', fontSize: '0.85rem' }}>
              My Complaints
            </Link>
            <Link to="/submit" className="btn btn-secondary" style={{ textDecoration: 'none', flex: 1, justifyContent: 'center', fontSize: '0.85rem', gap: '0.3rem' }}>
              <PlusCircle size={14} /> New Issue
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );

  const bColor = complaint.priority === 'Critical' ? 'var(--danger)' :
                 complaint.priority === 'High' ? 'var(--warning)' :
                 complaint.priority === 'Medium' ? 'var(--accent)' : 'var(--success)';

  return (
    <div className="page">
      <div className="container">
        
        {/* Navigation Breadcrumb */}
        <Link to="/complaints" className="flex items-center gap-1 text-muted mb-2" style={{ textDecoration: 'none', fontSize: '0.9rem' }}>
          <ChevronLeft size={16} /> Back to My Complaints
        </Link>

        {/* Hero Banner (Light Theme) */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card mb-2"
          style={{ 
            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
            borderLeft: `5px solid ${bColor}`,
            padding: '1.5rem 1.25rem',
            borderRadius: '16px',
            borderTop: '1px solid rgba(226, 232, 240, 0.9)',
            borderRight: '1px solid rgba(226, 232, 240, 0.9)',
            borderBottom: '1px solid rgba(226, 232, 240, 0.9)',
            boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)'
          }}
        >
          <div className="flex items-center justify-between flex-wrap gap-1 mb-1">
            <div className="flex items-center gap-1 flex-wrap">
              <span className={`badge badge-${complaint.priority.toLowerCase()}`}>{complaint.priority} Priority</span>
              <span className="badge badge-info">{complaint.status}</span>
              {complaint.severityScore != null && (
                <span className="badge" style={{
                  background: complaint.severityScore >= 8 ? '#fef2f2' : complaint.severityScore >= 6 ? '#fffbeb' : '#eff6ff',
                  color: complaint.severityScore >= 8 ? '#b91c1c' : complaint.severityScore >= 6 ? '#b45309' : '#1d4ed8',
                  border: `1px solid ${complaint.severityScore >= 8 ? '#fecaca' : complaint.severityScore >= 6 ? '#fde68a' : '#bfdbfe'}`,
                  fontWeight: 700,
                  gap: '4px'
                }}>
                  <Zap size={12} fill="currentColor" /> Hazard {complaint.severityScore}/10
                </span>
              )}
              {complaint.isDuplicate && (
                <span className="badge badge-critical">DUPLICATE ISSUE</span>
              )}
            </div>
            {complaint.aiProcessed && (
               <span className="badge" style={{ background: '#eef2ff', color: '#4338ca', border: '1px solid #c7d2fe' }}>✨ AI Verified</span>
            )}
          </div>
          <h1 style={{ fontSize: 'clamp(1.4rem, 3.5vw, 2rem)', fontWeight: 800, margin: '0.6rem 0 0.35rem', letterSpacing: '-0.02em', color: '#0f172a' }}>
            Complaint #{complaint._id.slice(-6).toUpperCase()}
          </h1>
          <p className="flex items-center gap-1 text-sm" style={{ color: '#64748b', flexWrap: 'wrap' }}>
            <Calendar size={14} /> Reported on {new Date(complaint.createdAt).toLocaleDateString()} by <strong style={{ color: '#334155' }}>{complaint.citizenId?.name || 'Citizen'}</strong>
          </p>
        </motion.div>

        <div className="grid-responsive-sidebar" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.5rem', alignItems: 'start', paddingBottom: '6rem' }}>
          
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex-col gap-2">
            <div className="card" style={{ background: '#ffffff', border: '1px solid rgba(226, 232, 240, 0.9)', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
              <h3 className="flex items-center gap-1 mb-1 pb-1" style={{ borderBottom: '1px solid var(--border)', color: '#0f172a' }}>
                <MessageSquare size={18} color="#4f46e5" /> Description
              </h3>
              <p style={{ fontSize: '1rem', whiteSpace: 'pre-wrap', color: '#1e293b', lineHeight: 1.7 }}>{complaint.text}</p>
            </div>

            {(complaint.imageBase64 || complaint.imageUrl) && (
              <div className="card" style={{ padding: '0.5rem', background: '#ffffff', border: '1px solid rgba(226, 232, 240, 0.9)' }}>
                <div 
                  style={{ position: 'relative', cursor: 'zoom-in', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}
                  onClick={() => setLightbox(true)}
                >
                  <img src={complaint.imageBase64 || complaint.imageUrl} alt="Evidence" style={{ width: '100%', maxHeight: '450px', objectFit: 'cover', display: 'block', transition: 'transform 0.3s' }} onMouseOver={e => e.currentTarget.style.transform='scale(1.02)'} onMouseOut={e => e.currentTarget.style.transform='scale(1)'} />
                  <div style={{ position: 'absolute', bottom: 15, right: 15, background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(10px)', padding: '0.5rem 1rem', borderRadius: '30px', color: '#fff', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                    <Maximize2 size={14} /> Click to Enlarge
                  </div>
                </div>
              </div>
            )}

            <div className="card mt-2" style={{ background: '#ffffff', border: '1px solid rgba(226, 232, 240, 0.9)', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
              <h3 className="mb-2 flex items-center gap-1" style={{ color: '#0f172a' }}><Clock size={18} color="#4f46e5"/> Status Timeline</h3>
              <div style={{ position: 'relative', paddingLeft: '1.5rem', marginTop: '1rem' }}>
                <div style={{ position: 'absolute', left: '11px', top: '24px', bottom: '24px', width: '2px', background: 'var(--border)' }}></div>
                {complaint.statusHistory.map((h, i) => {
                  const isLast = i === complaint.statusHistory.length - 1;
                  const isResolved = h.status === 'Resolved';
                  return (
                    <div key={i} style={{ position: 'relative', paddingLeft: '2.5rem', paddingBottom: isLast ? 0 : '2rem' }}>
                      <div style={{ 
                        position: 'absolute', left: '-5px', top: 0, width: '34px', height: '34px', 
                        borderRadius: '50%', background: isResolved ? 'var(--success)' : (isLast ? 'var(--accent)' : 'var(--bg-secondary)'), 
                        border: `4px solid var(--bg-card)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: isLast || isResolved ? '#fff' : 'var(--text-muted)' 
                      }}>
                        {isResolved ? <CheckCircle2 size={16} /> : <Clock size={16} />}
                      </div>
                      <div className="card" style={{ padding: '1rem', background: isLast ? '#f8fafc' : 'transparent', border: isLast ? '1px solid #cbd5e1' : '1px solid var(--border)', boxShadow: 'none' }}>
                        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '1rem' }}>{h.status}</div>
                        <div className="text-sm text-muted mt-1" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Calendar size={12} /> {new Date(h.date || complaint.createdAt).toLocaleString()}
                        </div>
                        {h.note && (
                          <div className="text-sm mt-1" style={{ background: '#f1f5f9', padding: '0.75rem', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--accent-light)', marginTop: '0.75rem', color: '#334155' }}>
                            {h.note}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex-col gap-2">
            
            {/* AI Triage & Metadata Card (Light Theme) */}
            <div className="card" style={{ background: '#ffffff', border: '1px solid rgba(226, 232, 240, 0.9)', boxShadow: '0 4px 15px rgba(0,0,0,0.04)' }}>
              <h3 className="mb-1 flex items-center gap-1" style={{ color: '#0f172a', fontSize: '1.05rem', fontWeight: 700 }}>
                <Layers size={18} color="#4f46e5"/> AI Triage & Metadata
              </h3>
              <div className="flex-col gap-1 mt-1">
                <div className="flex justify-between items-center py-1 border-b" style={{ borderColor: 'rgba(226, 232, 240, 0.8)' }}>
                  <span className="flex items-center gap-1 text-sm" style={{ color: '#64748b' }}><Layers size={14} /> Category</span>
                  <span style={{ fontWeight: 600, color: '#0f172a' }}>{complaint.category || 'Pending AI'}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b" style={{ borderColor: 'rgba(226, 232, 240, 0.8)' }}>
                  <span className="flex items-center gap-1 text-sm" style={{ color: '#64748b' }}><AlertTriangle size={14} /> Priority</span>
                  <span className={`badge badge-${(complaint.priority || 'medium').toLowerCase()}`}>{complaint.priority}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b" style={{ borderColor: 'rgba(226, 232, 240, 0.8)' }}>
                  <span className="flex items-center gap-1 text-sm" style={{ color: '#64748b' }}><Zap size={14} color="#d97706" /> Hazard Index</span>
                  {complaint.severityScore != null ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}>
                      <span style={{
                        fontWeight: 800,
                        fontSize: '0.88rem',
                        color: complaint.severityScore >= 8 ? '#dc2626' : complaint.severityScore >= 6 ? '#d97706' : '#2563eb',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px'
                      }}>
                        ⚡ {complaint.severityScore}/10
                      </span>
                      <div style={{ width: '80px', height: '5px', background: '#e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                        <div style={{
                          width: `${(complaint.severityScore / 10) * 100}%`,
                          height: '100%',
                          background: complaint.severityScore >= 8 ? '#dc2626' : complaint.severityScore >= 6 ? '#d97706' : '#2563eb',
                          borderRadius: '10px'
                        }} />
                      </div>
                    </div>
                  ) : (
                    <span style={{ color: '#94a3b8', fontSize: '0.82rem', fontStyle: 'italic' }}>Not assessed</span>
                  )}
                </div>
                <div className="flex justify-between items-center py-1 border-b" style={{ borderColor: 'rgba(226, 232, 240, 0.8)' }}>
                  <span className="flex items-center gap-1 text-sm" style={{ color: '#64748b' }}><Building size={14} /> Dept.</span>
                  <span style={{ fontWeight: 600, textAlign: 'right', fontSize: '0.88rem', color: '#0f172a' }}>{complaint.recommendedDepartment || 'Pending AI'}</span>
                </div>
                {complaint.safetyHazards && complaint.safetyHazards.length > 0 && (
                  <div className="py-2 border-b" style={{ borderColor: 'rgba(226, 232, 240, 0.8)' }}>
                    <div className="text-xs flex items-center gap-1 mb-1 font-bold" style={{ color: '#dc2626' }}>
                      <ShieldAlert size={14} color="#dc2626" /> Detected Physical Hazards
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {complaint.safetyHazards.map((hazard, hi) => (
                        <span key={hi} style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '3px 9px',
                          borderRadius: '6px',
                          background: '#fef2f2',
                          color: '#b91c1c',
                          border: '1px solid #fecaca',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px'
                        }}>
                          ⚠️ {hazard}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {complaint.keywords && complaint.keywords.length > 0 && (
                  <div className="py-2 border-b" style={{ borderColor: 'rgba(226, 232, 240, 0.8)' }}>
                    <div className="text-xs flex items-center gap-1 mb-1 font-semibold" style={{ color: '#64748b' }}>
                      <Layers size={14} /> Detected Keywords
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {complaint.keywords.map((kw, i) => (
                        <span key={i} className="badge" style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #e2e8f0', fontSize: '0.7rem' }}>{kw}</span>
                      ))}
                    </div>
                  </div>
                )}
                {complaint.suggestedAction && (
                  <div className="mt-2" style={{
                    background: '#f8fafc',
                    borderRadius: '8px',
                    borderLeft: '4px solid #4f46e5',
                    borderTop: '1px solid #e2e8f0',
                    borderRight: '1px solid #e2e8f0',
                    borderBottom: '1px solid #e2e8f0',
                    padding: '0.85rem 1rem',
                    fontSize: '0.85rem'
                  }}>
                    <div style={{ fontWeight: 700, color: '#1e1b4b', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                      <ShieldAlert size={15} color="#4f46e5" /> Recommended Municipal Action
                    </div>
                    <p style={{ color: '#334155', margin: 0, lineHeight: 1.5, fontSize: '0.84rem' }}>
                      {complaint.suggestedAction}
                    </p>
                  </div>
                )}
                <div className="text-xs text-center mt-2" style={{ background: '#eef2ff', padding: '0.45rem', borderRadius: '6px', color: '#4338ca', fontWeight: 600, border: '1px solid #c7d2fe' }}>
                  ✨ Analyzed via Gemini Vision & NLP
                </div>
              </div>
            </div>

            <div className="card">
              <h3 className="mb-1 flex items-center gap-1"><MapPin size={18}/> Location</h3>
              {complaint.location?.address ? (
                <p className="text-sm mb-1" style={{ fontWeight: 500 }}>{complaint.location.address}</p>
              ) : (
                <div className="flex flex-col items-center justify-center text-center py-2 mt-1" style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--border)' }}>
                  <Map size={24} color="var(--text-muted)" className="mb-1" />
                  <p className="text-sm text-muted">No precise GPS data provided</p>
                </div>
              )}
              {complaint.location?.lat && complaint.location?.lng && (
                <ComplaintMap 
                  lat={complaint.location.lat} 
                  lng={complaint.location.lng} 
                  address={complaint.location.address}
                  priority={complaint.priority}
                />
              )}
            </div>

            {similar.length > 0 && (
              <div className="card">
                <h3 className="mb-1">Similar Issues</h3>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {similar.map(s => (
                    <li key={s._id} className="text-sm mb-1 pb-1 border-b" style={{ borderColor: 'var(--border)' }}>
                      <a href={`/complaints/${s._id}`} style={{ color: 'var(--text-primary)', textDecoration: 'none' }}>
                        <span style={{ color: 'var(--accent-light)', fontWeight: 600 }}>#{s._id.slice(-4).toUpperCase()}</span> — {s.text.substring(0, 50)}...
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

          </motion.div>
        </div>
      </div>

      {/* Lightbox Modal */}
      <AnimatePresence>
        {lightbox && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => setLightbox(false)}
          >
            <button style={{ position: 'absolute', top: 20, right: 20, background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}><X size={32}/></button>
            <motion.img 
              initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              src={complaint.imageBase64 || complaint.imageUrl} 
              alt="Evidence Fullscreen" 
              style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }} 
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
