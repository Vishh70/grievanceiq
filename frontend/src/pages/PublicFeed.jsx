// frontend/src/pages/PublicFeed.jsx
import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import toast from 'react-hot-toast';
import Skeleton from '../components/Skeleton';
import { MapPin, Heart, Clock, Navigation, AlertTriangle, Layers, ChevronRight, Search, Compass, Flame, ShieldAlert, Globe } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getPriorityIcon, createUserLocationIcon } from '../utils/mapIcons';

/**
 * Calculates straight-line distance in kilometers using the Haversine formula.
 */
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

function MapViewController({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.flyTo(center, zoom || 12, { animate: true, duration: 1.2 });
    }
  }, [center, zoom, map]);
  return null;
}

export default function PublicFeed() {
  const { user } = useAuth();
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'near_me' | 'trending' | 'critical'
  const [searchFilter, setSearchFilter] = useState('');
  const [userLocation, setUserLocation] = useState(null); // { lat, lng }
  const [locating, setLocating] = useState(false);
  const [mapCenter, setMapCenter] = useState([18.5204, 73.8567]);
  const [mapZoom, setMapZoom] = useState(12);

  useEffect(() => {
    const fetchPublicComplaints = async () => {
      try {
        const { data } = await api.get('/complaints/public?limit=100');
        const sanitized = data.complaints.map(c => ({
          ...c,
          upvotedBy: c.upvotedBy || [],
          upvotes: c.upvotes || 0
        }));
        setComplaints(sanitized);

        // Auto-center map to average coordinates of complaints
        const withLoc = sanitized.filter(c => c.location?.lat && c.location?.lng);
        if (withLoc.length > 0) {
          const avgLat = withLoc.reduce((s, c) => s + c.location.lat, 0) / withLoc.length;
          const avgLng = withLoc.reduce((s, c) => s + c.location.lng, 0) / withLoc.length;
          setMapCenter([avgLat, avgLng]);
        }
      } catch (err) {
        toast.error('Failed to load public feed.');
      } finally {
        setLoading(false);
      }
    };
    fetchPublicComplaints();
  }, []);

  // Acquire User GPS Location
  const acquireLocation = (autoSwitchToNearMe = false) => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser.');
      return;
    }
    setLocating(true);
    const toastId = toast.loading('Finding your location...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(coords);
        setMapCenter([coords.lat, coords.lng]);
        setMapZoom(14);
        setLocating(false);
        toast.success(`Location acquired! (±${Math.round(pos.coords.accuracy || 10)}m)`, { id: toastId });
        if (autoSwitchToNearMe) setActiveTab('near_me');
      },
      (err) => {
        setLocating(false);
        toast.error('Could not access your location. Please check browser permissions.', { id: toastId });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleTabClick = (tab) => {
    if (tab === 'near_me' && !userLocation) {
      acquireLocation(true);
      return;
    }
    setActiveTab(tab);
  };

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

  // Process & Filter Complaints
  const processedComplaints = useMemo(() => {
    return complaints.map(c => {
      const dist = userLocation && c.location?.lat && c.location?.lng
        ? calculateDistanceKm(userLocation.lat, userLocation.lng, c.location.lat, c.location.lng)
        : null;
      return { ...c, distanceKm: dist };
    });
  }, [complaints, userLocation]);

  const filteredComplaints = useMemo(() => {
    let list = [...processedComplaints];

    // Search query filter
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      list = list.filter(c =>
        c.text.toLowerCase().includes(q) ||
        (c.location?.address && c.location.address.toLowerCase().includes(q)) ||
        (c.category && c.category.toLowerCase().includes(q)) ||
        (c.keywords && c.keywords.some(k => k.toLowerCase().includes(q)))
      );
    }

    // Tab filter
    if (activeTab === 'near_me' && userLocation) {
      // Sort by closest distance and filter within 30km
      list = list
        .filter(c => c.distanceKm !== null)
        .sort((a, b) => (a.distanceKm || 999) - (b.distanceKm || 999));
    } else if (activeTab === 'trending') {
      list = list.sort((a, b) => b.upvotes - a.upvotes);
    } else if (activeTab === 'critical') {
      list = list.filter(c => c.priority === 'Critical');
    }

    return list;
  }, [processedComplaints, searchFilter, activeTab, userLocation]);

  if (loading) return (
    <div className="page container">
      <Skeleton style={{ height: 400, marginBottom: '2rem' }} />
      <div className="grid-responsive-2">
        <Skeleton style={{ height: 150 }} />
        <Skeleton style={{ height: 150 }} />
      </div>
    </div>
  );

  return (
    <div className="page">
      <div className="container">
        
        {/* Header */}
        <div className="mb-2 text-center">
          <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>Civic Feed 🌍</h1>
          <p className="text-muted">Explore civic issues across your city. Upvote problems to raise municipal response priority!</p>
        </div>

        {/* Filter Tabs & Location Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1rem',
          padding: '0.75rem 1rem',
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)'
        }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => handleTabClick('all')}
              className={`btn ${activeTab === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Globe size={15} /> All Issues ({complaints.length})
            </button>

            <button
              onClick={() => handleTabClick('near_me')}
              className={`btn ${activeTab === 'near_me' ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                padding: '0.45rem 0.9rem',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: activeTab === 'near_me' ? 'var(--accent)' : (userLocation ? 'rgba(99,102,241,0.1)' : undefined),
                borderColor: userLocation ? 'var(--accent)' : undefined
              }}
            >
              <Compass size={15} /> Near Me 📍 {userLocation ? `(Live GPS)` : ''}
            </button>

            <button
              onClick={() => handleTabClick('trending')}
              className={`btn ${activeTab === 'trending' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Flame size={15} color={activeTab === 'trending' ? '#fff' : '#f97316'} /> Trending
            </button>

            <button
              onClick={() => handleTabClick('critical')}
              className={`btn ${activeTab === 'critical' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <ShieldAlert size={15} color={activeTab === 'critical' ? '#fff' : '#ef4444'} /> Critical ({complaints.filter(c => c.priority === 'Critical').length})
            </button>
          </div>

          {/* Search Filter Box */}
          <div style={{ position: 'relative', minWidth: '240px', flex: '1 1 240px', maxWidth: '380px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-input"
              placeholder="Search feed by issue or locality..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              style={{ paddingLeft: '36px', height: '38px', fontSize: '0.85rem' }}
            />
          </div>
        </div>

        {/* Interactive Map */}
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="card mb-2" style={{ padding: 0, overflow: 'hidden', height: '420px', border: '1px solid var(--border)', position: 'relative' }}>
          <MapContainer 
            center={mapCenter} 
            zoom={mapZoom} 
            style={{ height: '100%', width: '100%', zIndex: 1 }}
          >
            <MapViewController center={mapCenter} zoom={mapZoom} />
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
            
            {/* User Current Location Marker */}
            {userLocation && (
              <Marker position={[userLocation.lat, userLocation.lng]} icon={createUserLocationIcon()}>
                <Popup>
                  <div style={{ textAlign: 'center', padding: '4px' }}>
                    <strong style={{ color: '#2563eb' }}>📍 You Are Here</strong>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>GPS Coordinates Active</div>
                  </div>
                </Popup>
              </Marker>
            )}

            {/* Complaint Pins */}
            {filteredComplaints.map(c => (
              c.location?.lat && c.location?.lng && (
                <Marker key={c._id} position={[c.location.lat, c.location.lng]} icon={getPriorityIcon(c.priority)}>
                  <Popup>
                    <div style={{ padding: '0.5rem', maxWidth: '220px' }}>
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className={`badge badge-${c.priority.toLowerCase()}`} style={{ fontSize: '0.7rem' }}>{c.priority}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 600 }}>👍 {c.upvotes || 0}</span>
                      </div>
                      {c.distanceKm !== null && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--accent-light)', fontWeight: 600, marginBottom: '4px' }}>
                          📍 {c.distanceKm} km from you
                        </div>
                      )}
                      <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', fontWeight: 500, lineHeight: 1.4 }}>{c.text.substring(0, 70)}...</p>
                      <Link to={`/complaints/${c._id}`} style={{ fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 600 }}>View Details →</Link>
                    </div>
                  </Popup>
                </Marker>
              )
            ))}
          </MapContainer>

          {/* Floating Locate Me GPS Button on Map */}
          <button 
            type="button" 
            onClick={() => acquireLocation(false)} 
            disabled={locating}
            style={{
              position: 'absolute',
              bottom: '15px',
              right: '15px',
              zIndex: 1000,
              background: userLocation ? 'var(--accent)' : '#ffffff',
              color: userLocation ? '#ffffff' : 'var(--accent)',
              border: 'none',
              borderRadius: '30px',
              padding: '0.5rem 1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 15px rgba(0,0,0,0.25)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem',
              transition: 'transform 0.2s'
            }}
            onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
            title="Locate My Position"
          >
            <Navigation size={16} />
            <span>{locating ? 'Locating...' : (userLocation ? 'My GPS Active' : 'Locate Me')}</span>
          </button>
        </motion.div>

        {/* Complaints Feed List */}
        <div className="flex items-center justify-between mb-1">
          <h2 style={{ fontSize: '1.4rem' }}>
            {activeTab === 'near_me' ? '📍 Issues Near You (Sorted by Proximity)' :
             activeTab === 'trending' ? '🔥 Most Upvoted Issues' :
             activeTab === 'critical' ? '🚨 Critical Priority Alerts' :
             'Civic Issues Feed'}
          </h2>
          <span className="text-sm text-muted">{filteredComplaints.length} issue{filteredComplaints.length === 1 ? '' : 's'} displayed</span>
        </div>

        {filteredComplaints.length === 0 ? (
          <div className="card text-center py-4" style={{ background: 'var(--bg-card)', border: '1px dashed var(--border)' }}>
            <p className="text-muted" style={{ fontSize: '1.05rem', marginBottom: '0.5rem' }}>No grievances match the selected filter.</p>
            <button className="btn btn-secondary btn-sm" onClick={() => { setActiveTab('all'); setSearchFilter(''); }}>Clear Filters</button>
          </div>
        ) : (
          <div className="grid-responsive-2">
            {filteredComplaints.map(c => {
              const hasUpvoted = c.upvotedBy?.includes(user.id);
              return (
                <motion.div 
                  key={c._id} 
                  initial={{ opacity: 0, scale: 0.97 }} 
                  animate={{ opacity: 1, scale: 1 }} 
                  className="card flex-col justify-between"
                  style={{ 
                    borderTop: `4px solid ${c.priority === 'Critical' ? 'var(--danger)' : c.priority === 'High' ? 'var(--warning, #f97316)' : 'var(--accent)'}`,
                    background: hasUpvoted ? 'linear-gradient(to bottom, rgba(99,102,241,0.05), transparent)' : 'var(--bg-card)'
                  }}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1">
                        <span className={`badge badge-${c.priority.toLowerCase()}`}>{c.priority}</span>
                        {c.distanceKm !== null && (
                          <span className="badge" style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--accent)', border: '1px solid rgba(99,102,241,0.25)', fontWeight: 600 }}>
                            📍 {c.distanceKm} km away
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted"><Clock size={12} style={{display:'inline', marginRight:2}}/> {new Date(c.createdAt).toLocaleDateString()}</span>
                    </div>

                    <p style={{ fontWeight: 500, marginBottom: '0.5rem', fontSize: '1.05rem', lineHeight: 1.4 }}>
                      {c.text.length > 90 ? c.text.substring(0, 90) + '...' : c.text}
                    </p>

                    <div className="text-sm text-muted flex items-center gap-1 mb-1">
                      <MapPin size={14} style={{ flexShrink: 0 }} /> 
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.location?.address || 'No location address'}
                      </span>
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
                        padding: '0.45rem 0.9rem', 
                        borderRadius: '30px', 
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        transition: 'all 0.2s',
                        boxShadow: hasUpvoted ? '0 4px 12px rgba(99,102,241,0.3)' : 'none'
                      }}
                    >
                      <Heart size={15} fill={hasUpvoted ? '#fff' : 'none'} /> {c.upvotes || 0} Upvotes
                    </button>

                    <Link to={`/complaints/${c._id}`} className="flex items-center gap-0.5 text-sm text-accent hover:text-accent-dark" style={{ textDecoration: 'none', fontWeight: 600 }}>
                      Details <ChevronRight size={16} />
                    </Link>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}

