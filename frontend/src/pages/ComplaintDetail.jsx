import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import Skeleton from '../components/Skeleton';
import { useAuth } from '../context/AuthContext';
import { MapPin, Calendar, Clock, AlertTriangle, Layers, Building, MessageSquare, Maximize2, X, CheckCircle2, ChevronLeft, Map } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix leaflet default icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

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

  if (!complaint) return <div className="page container text-center" style={{ padding: '5rem 0' }}><h2>Complaint Not Found</h2></div>;

  const bColor = 
    complaint.priority === 'Critical' ? 'var(--danger)' :
    complaint.priority === 'High' ? 'var(--warning)' :
    complaint.priority === 'Medium' ? 'var(--info)' : 'var(--success)';

  return (
    <div className="page">
      <div className="container">
        
        {/* Back button */}
        <Link to="/complaints" className="flex items-center gap-1 text-muted mb-2 hover:text-accent" style={{ display: 'inline-flex', fontSize: '0.9rem', fontWeight: 600, textDecoration: 'none' }}>
          <ChevronLeft size={16} /> Back to My Complaints
        </Link>

        {/* Hero Header */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} 
          className="card mb-2"
          style={{ 
            background: 'linear-gradient(135deg, rgba(99,102,241,0.05), rgba(192,132,252,0.05))',
            borderLeft: `4px solid ${bColor}`,
            padding: '2rem'
          }}
        >
          <div className="flex items-center justify-between flex-wrap gap-1 mb-1">
            <div className="flex items-center gap-1">
              <span className={`badge badge-${complaint.priority.toLowerCase()}`}>{complaint.priority} Priority</span>
              <span className="badge badge-info">{complaint.status}</span>
              {complaint.isDuplicate && (
                <span className="badge badge-critical" style={{ marginLeft: '0.5rem' }}>DUPLICATE ISSUE</span>
              )}
            </div>
            {complaint.aiProcessed && (
               <span className="badge" style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)' }}>✨ AI Verified</span>
            )}
          </div>
          <h1 style={{ fontSize: '2.2rem', marginBottom: '0.5rem' }}>Complaint #{complaint._id.slice(-6).toUpperCase()}</h1>
          <p className="text-muted flex items-center gap-1">
            <Calendar size={14} /> Reported on {new Date(complaint.createdAt).toLocaleDateString()} by {complaint.citizenId?.name || 'Citizen'}
          </p>
        </motion.div>

        <div className="grid-responsive-sidebar" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '2rem', alignItems: 'start' }}>
          
          {/* Main Content (Left) */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex-col gap-2">
            <div className="card">
              <h3 className="flex items-center gap-1 mb-1 pb-1" style={{ borderBottom: '1px solid var(--border)' }}>
                <MessageSquare size={18} /> Description
              </h3>
              <p style={{ fontSize: '1.05rem', whiteSpace: 'pre-wrap', color: 'var(--text-primary)', lineHeight: 1.7 }}>{complaint.text}</p>
            </div>

            {(complaint.imageBase64 || complaint.imageUrl) && (
              <div className="card" style={{ padding: '0.5rem' }}>
                <div 
                  style={{ position: 'relative', cursor: 'zoom-in', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}
                  onClick={() => setLightbox(true)}
                >
                  <img src={complaint.imageBase64 || complaint.imageUrl} alt="Evidence" style={{ width: '100%', maxHeight: '450px', objectFit: 'cover', display: 'block', transition: 'transform 0.3s' }} onMouseOver={e => e.currentTarget.style.transform='scale(1.02)'} onMouseOut={e => e.currentTarget.style.transform='scale(1)'} />
                  <div style={{ position: 'absolute', bottom: 15, right: 15, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(10px)', padding: '0.5rem 1rem', borderRadius: '30px', color: '#fff', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                    <Maximize2 size={14} /> Click to Enlarge
                  </div>
                </div>
              </div>
            )}

            {/* Premium Timeline */}
            <div className="card mt-2">
              <h3 className="mb-2 flex items-center gap-1"><Clock size={18}/> Status Timeline</h3>
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
                      <div className="card" style={{ padding: '1rem', background: isLast ? 'rgba(99,102,241,0.03)' : 'transparent', border: isLast ? '1px solid var(--border-glow)' : '1px solid var(--border)', boxShadow: 'none' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1.05rem' }}>{h.status}</div>
                        <div className="text-sm text-muted mt-1" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Calendar size={12} /> {new Date(h.timestamp || complaint.createdAt).toLocaleString()}
                        </div>
                        {h.note && (
                          <div className="text-sm mt-1" style={{ background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--accent-light)', marginTop: '0.75rem' }}>
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

          {/* Sidebar (Right) */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex-col gap-2">
            
            <div className="card">
              <h3 className="mb-1 flex items-center gap-1"><Layers size={18}/> AI Metadata</h3>
              <div className="flex-col gap-1 mt-1">
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
                  <div className="py-2 border-b" style={{ borderColor: 'var(--border)' }}>
                    <span className="text-muted flex items-center gap-1 mb-1"><Layers size={14} /> Detected Keywords</span>
                    <div className="flex gap-1 flex-wrap">
                      {complaint.keywords.map((kw, i) => (
                        <span key={i} className="badge" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>{kw}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="text-sm text-center mt-2" style={{ background: 'var(--accent-glow)', padding: '0.5rem', borderRadius: 'var(--radius-sm)', color: 'var(--accent-dark)', fontWeight: 600 }}>
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
              {complaint.location?.coordinates?.length > 0 && (
                <div style={{ height: 220, borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border)', position: 'relative' }}>
                  <MapContainer 
                    center={[complaint.location.coordinates[1], complaint.location.coordinates[0]]} 
                    zoom={15} 
                    dragging={!L.Browser.mobile} tap={!L.Browser.mobile} 
                    style={{ height: '100%', width: '100%', zIndex: 1 }}
                  >
                    <TileLayer
                      url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                      attribution='&copy; OpenStreetMap'
                    />
                    <Marker position={[complaint.location.coordinates[1], complaint.location.coordinates[0]]} />
                  </MapContainer>
                </div>
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
