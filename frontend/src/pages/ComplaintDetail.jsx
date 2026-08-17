// src/pages/ComplaintDetail.jsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../services/api';
import Skeleton from '../components/Skeleton';
import { useAuth } from '../context/AuthContext';
import { MapPin, Calendar, Clock, AlertTriangle, Layers, Building, MessageSquare, Maximize2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

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
          setSimilar(simRes.data.complaints);
        }
      } catch (err) {
        toast.error('Failed to load complaint details.');
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [id]);

  if (loading) return (
    <div className="page container">
      <Skeleton style={{ height: 40, width: '40%', marginBottom: '1rem' }} />
      <Skeleton style={{ height: 20, width: '20%', marginBottom: '2rem' }} />
      <div style={{ display: 'flex', gap: '2rem' }}>
        <Skeleton style={{ height: 400, flex: 2 }} />
        <Skeleton style={{ height: 400, flex: 1 }} />
      </div>
    </div>
  );

  if (!complaint) return <div className="page container text-center"><h2>Complaint Not Found</h2></div>;

  const bColor = 
    complaint.priority === 'Critical' ? 'var(--danger)' :
    complaint.priority === 'High' ? 'var(--warning)' :
    complaint.priority === 'Medium' ? 'var(--info)' : 'var(--success)';

  return (
    <div className="page">
      <div className="container">
        
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} 
          className="mb-2 flex items-center justify-between"
        >
          <div>
            <div className="flex items-center gap-1 mb-1">
              <span className={`badge badge-${complaint.priority.toLowerCase()}`}>{complaint.priority} Priority</span>
              <span className="badge badge-info">{complaint.status}</span>
              {complaint.isDuplicate && (
                <span className="badge badge-critical" style={{ marginLeft: '0.5rem' }}>DUPLICATE ISSUE</span>
              )}
            </div>
            <h1 style={{ fontSize: '2rem' }}>Complaint #{complaint._id.slice(-6).toUpperCase()}</h1>
            <p className="text-muted flex items-center gap-1 mt-1">
              <Calendar size={14} /> Reported on {new Date(complaint.createdAt).toLocaleDateString()} by {complaint.citizenId?.name || 'Citizen'}
            </p>
          </div>
        </motion.div>

        <div className="grid-responsive-sidebar" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '2rem', alignItems: 'start' }}>
          
          {/* Main Content (Left) */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex-col gap-2">
            <div className="card">
              <h3 className="flex items-center gap-1 mb-1 border-b pb-1" style={{ borderColor: 'var(--border)' }}>
                <MessageSquare size={18} /> Description
              </h3>
              <p style={{ fontSize: '1.05rem', whiteSpace: 'pre-wrap' }}>{complaint.text}</p>
            </div>

            {(complaint.imageBase64 || complaint.imageUrl) && (
              <div className="card" style={{ padding: '0.5rem' }}>
                <div 
                  style={{ position: 'relative', cursor: 'zoom-in', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}
                  onClick={() => setLightbox(true)}
                >
                  <img src={complaint.imageBase64 || complaint.imageUrl} alt="Evidence" style={{ width: '100%', maxHeight: '400px', objectFit: 'cover', display: 'block' }} />
                  <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.6)', padding: '0.4rem', borderRadius: '50%' }}>
                    <Maximize2 size={16} color="#fff" />
                  </div>
                </div>
              </div>
            )}

            {/* Timeline */}
            <div className="card mt-2">
              <h3 className="mb-2">Status Timeline</h3>
              <div style={{ position: 'relative', paddingLeft: '1rem' }}>
                <div style={{ position: 'absolute', left: '4px', top: 0, bottom: 0, width: '2px', background: 'var(--border)' }}></div>
                {complaint.statusHistory.map((h, i) => (
                  <div key={i} style={{ position: 'relative', paddingLeft: '1.5rem', paddingBottom: '1.5rem' }}>
                    <div style={{ position: 'absolute', left: '-5px', top: '4px', width: '12px', height: '12px', borderRadius: '50%', background: i === complaint.statusHistory.length - 1 ? 'var(--accent)' : 'var(--bg-secondary)', border: '2px solid var(--border)' }}></div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{h.status}</div>
                    <div className="text-sm text-muted">{new Date(h.timestamp || complaint.createdAt).toLocaleString()}</div>
                    {h.note && <div className="text-sm mt-1" style={{ background: 'rgba(255,255,255,0.03)', padding: '0.5rem', borderRadius: '4px' }}>{h.note}</div>}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Sidebar (Right) */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex-col gap-2">
            
            <div className="card" style={{ borderTop: `3px solid ${bColor}` }}>
              <h3 className="mb-1">Metadata</h3>
              <div className="flex-col gap-1">
                <div className="flex justify-between items-center py-1 border-b" style={{ borderColor: 'var(--border)' }}>
                  <span className="text-muted flex items-center gap-1"><Layers size={14} /> Category</span>
                  <span style={{ fontWeight: 600 }}>{complaint.category || 'Pending AI'}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b" style={{ borderColor: 'var(--border)' }}>
                  <span className="text-muted flex items-center gap-1"><AlertTriangle size={14} /> Priority</span>
                  <span style={{ fontWeight: 600 }}>{complaint.priority || 'Pending AI'}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b" style={{ borderColor: 'var(--border)' }}>
                  <span className="text-muted flex items-center gap-1"><Building size={14} /> Dept.</span>
                  <span style={{ fontWeight: 600, textAlign: 'right' }}>{complaint.recommendedDepartment || 'Pending AI'}</span>
                </div>
                {complaint.keywords && complaint.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1 py-1 border-b" style={{ borderColor: 'var(--border)' }}>
                    <span className="text-muted flex items-center gap-1 w-full"><Layers size={14} /> Keywords</span>
                    <div className="flex gap-1 flex-wrap mt-1">
                      {complaint.keywords.map((kw, i) => (
                        <span key={i} className="badge" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>{kw}</span>
                      ))}
                    </div>
                  </div>
                )}
                {complaint.aiProcessed && (
                  <div className="text-sm text-center mt-1" style={{ color: 'var(--accent-light)', fontWeight: 600 }}>✨ NLP & Computer Vision Analysis</div>
                )}
              </div>
            </div>

            <div className="card">
              <h3 className="mb-1 flex items-center gap-1"><MapPin size={16}/> Location</h3>
              {complaint.location?.address ? (
                <p className="text-sm">{complaint.location.address}</p>
              ) : (
                <p className="text-sm text-muted">No address provided</p>
              )}
              {complaint.location?.coordinates?.length > 0 && (
                <div className="text-xs text-muted mt-1 bg-black p-1 rounded" style={{ fontFamily: 'monospace' }}>
                  Lat: {complaint.location.coordinates[1]} <br/>
                  Lng: {complaint.location.coordinates[0]}
                </div>
              )}
            </div>

            {similar.length > 0 && (
              <div className="card">
                <h3 className="mb-1">Similar Issues</h3>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {similar.map(s => (
                    <li key={s._id} className="text-sm mb-1 pb-1 border-b" style={{ borderColor: 'var(--border)' }}>
                      <a href={`/complaints/${s._id}`} style={{ color: 'var(--text-primary)' }}>
                        <span style={{ color: 'var(--accent-light)' }}>#{s._id.slice(-4)}</span> — {s.text.substring(0, 40)}...
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
              style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px' }} 
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
