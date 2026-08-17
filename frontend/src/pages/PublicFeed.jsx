// frontend/src/pages/PublicFeed.jsx
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import toast from 'react-hot-toast';
import Skeleton from '../components/Skeleton';
import { MapPin, Heart, Clock, Navigation, AlertTriangle, Layers, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

// Fix leaflet default icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

export default function PublicFeed() {
  const { user } = useAuth();
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPublicComplaints = async () => {
      try {
        const { data } = await api.get('/complaints/public?limit=100');
        // Ensure upvotedBy is always an array
        const sanitized = data.complaints.map(c => ({
          ...c,
          upvotedBy: c.upvotedBy || [],
          upvotes: c.upvotes || 0
        }));
        setComplaints(sanitized);
      } catch (err) {
        toast.error('Failed to load public feed.');
      } finally {
        setLoading(false);
      }
    };
    fetchPublicComplaints();
  }, []);

  const handleUpvote = async (id) => {
    try {
      const { data } = await api.post(`/complaints/${id}/upvote`);
      setComplaints(prev => prev.map(c => {
        if (c._id === id) {
          const newUpvotedBy = data.hasUpvoted 
            ? [...(c.upvotedBy || []), user.id] 
            : (c.upvotedBy || []).filter(uid => uid !== user.id);
            
          return {
            ...c,
            upvotes: data.upvotes,
            upvotedBy: newUpvotedBy,
            priority: data.priority
          };
        }
        return c;
      }));
      if (data.hasUpvoted) toast.success('Upvoted!');
    } catch (err) {
      toast.error('Failed to upvote.');
    }
  };

  if (loading) return (
    <div className="page container">
      <Skeleton style={{ height: 400, marginBottom: '2rem' }} />
      <div className="grid-responsive">
        <Skeleton style={{ height: 150 }} />
        <Skeleton style={{ height: 150 }} />
      </div>
    </div>
  );

  // Group trending by upvotes
  const trending = [...complaints].sort((a, b) => b.upvotes - a.upvotes).slice(0, 10);

  return (
    <div className="page">
      <div className="container">
        
        <div className="mb-2 text-center">
          <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>Civic Feed 🌍</h1>
          <p className="text-muted">See what's happening in your city. Upvote issues to raise their priority!</p>
        </div>

        {/* Massive Map */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card mb-2" style={{ padding: 0, overflow: 'hidden', height: '400px', border: '1px solid var(--border)' }}>
          <MapContainer 
            center={[18.6298, 73.7997]} // default approx PCMC/Pune
            zoom={12} 
            style={{ height: '100%', width: '100%', zIndex: 1 }}
          >
            <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
            {complaints.map(c => (
              c.location?.coordinates?.length > 1 && (
                <Marker key={c._id} position={[c.location.coordinates[1], c.location.coordinates[0]]}>
                  <Popup>
                    <div style={{ padding: '0.5rem', maxWidth: '200px' }}>
                      <div className="flex items-center gap-1 mb-1">
                        <span className={`badge badge-${c.priority.toLowerCase()}`} style={{ fontSize: '0.7rem' }}>{c.priority}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 600 }}>👍 {c.upvotes || 0}</span>
                      </div>
                      <p style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>{c.text.substring(0, 60)}...</p>
                      <Link to={`/complaints/${c._id}`} style={{ fontSize: '0.8rem', color: 'var(--accent)' }}>View Details</Link>
                    </div>
                  </Popup>
                </Marker>
              )
            ))}
          </MapContainer>
        </motion.div>

        {/* Trending Issues List */}
        <h2 className="mb-1">Trending Issues 🔥</h2>
        <div className="grid-responsive">
          {trending.map(c => {
            const hasUpvoted = c.upvotedBy?.includes(user.id);
            return (
              <motion.div 
                key={c._id} 
                initial={{ opacity: 0, scale: 0.95 }} 
                animate={{ opacity: 1, scale: 1 }} 
                className="card flex-col justify-between"
                style={{ 
                  borderTop: `4px solid ${c.priority === 'Critical' ? 'var(--danger)' : 'transparent'}`,
                  background: hasUpvoted ? 'linear-gradient(to bottom, rgba(99,102,241,0.05), transparent)' : 'var(--bg-card)'
                }}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`badge badge-${c.priority.toLowerCase()}`}>{c.priority}</span>
                    <span className="text-xs text-muted"><Clock size={12} style={{display:'inline', marginRight:2}}/> {new Date(c.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p style={{ fontWeight: 500, marginBottom: '0.5rem', fontSize: '1.05rem', lineHeight: 1.4 }}>
                    {c.text.length > 80 ? c.text.substring(0, 80) + '...' : c.text}
                  </p>
                  <div className="text-sm text-muted flex items-center gap-1 mb-1">
                    <MapPin size={14} /> {c.location?.address ? (c.location.address.length > 35 ? c.location.address.substring(0,35)+'...' : c.location.address) : 'No address'}
                  </div>
                </div>

                <div className="flex items-center justify-between mt-1 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                  <button 
                    onClick={() => handleUpvote(c._id)}
                    className="flex items-center gap-1"
                    style={{ 
                      background: hasUpvoted ? 'var(--accent)' : 'var(--bg-secondary)', 
                      color: hasUpvoted ? '#fff' : 'var(--text-primary)',
                      border: 'none', 
                      padding: '0.5rem 1rem', 
                      borderRadius: '30px', 
                      cursor: 'pointer',
                      fontWeight: 600,
                      transition: 'all 0.2s',
                      boxShadow: hasUpvoted ? '0 4px 12px rgba(99,102,241,0.3)' : 'none'
                    }}
                  >
                    <Heart size={16} fill={hasUpvoted ? '#fff' : 'none'} /> {c.upvotes || 0}
                  </button>

                  <Link to={`/complaints/${c._id}`} className="flex items-center gap-0.5 text-sm text-accent hover:text-accent-dark" style={{ textDecoration: 'none', fontWeight: 600 }}>
                    Details <ChevronRight size={16} />
                  </Link>
                </div>
              </motion.div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
