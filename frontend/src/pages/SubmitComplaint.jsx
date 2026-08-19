// src/pages/SubmitComplaint.jsx
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Upload, MapPin, Send, Loader2, Navigation, Camera, X, Image as ImageIcon, Search } from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import 'leaflet/dist/leaflet.css';
import { createPinIcon } from '../utils/mapIcons';

function LocationPicker({ position, setPosition, setAddress }) {
  const map = useMap();
  const markerRef = useRef(null);

  useEffect(() => {
    if (position) {
      map.flyTo(position, 16, { animate: true, duration: 1 });
    }
  }, [position, map]);

  const updateAddress = async (lat, lng) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
      const data = await res.json();
      if (data && data.address) {
        const addr = data.address;
        const cleanParts = [addr.road, addr.neighbourhood, addr.suburb, addr.city || addr.town, addr.postcode].filter(Boolean);
        const cleanAddress = cleanParts.length > 0 ? cleanParts.join(', ') : data.display_name;
        setAddress(cleanAddress);
        toast.success('Address auto-filled from map!');
      }
    } catch (err) {
      console.error("Geocoding failed", err);
    }
  };

  useMapEvents({
    click(e) {
      setPosition(e.latlng);
      updateAddress(e.latlng.lat, e.latlng.lng);
    },
  });

  const eventHandlers = {
    dragend() {
      const marker = markerRef.current;
      if (marker != null) {
        const latlng = marker.getLatLng();
        setPosition(latlng);
        updateAddress(latlng.lat, latlng.lng);
      }
    },
  };

  const dragPinIcon = createPinIcon('#6366f1', 40);

  return position ? (
    <Marker 
      draggable={true}
      eventHandlers={eventHandlers}
      position={position} 
      icon={dragPinIcon}
      ref={markerRef} 
    />
  ) : null;
}

export default function SubmitComplaint() {
  const [form, setForm]         = useState({ text: '', address: '' });
  const [position, setPosition] = useState(null); // {lat, lng}
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [image, setImage]       = useState(null);
  const [preview, setPreview]   = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const navigate                = useNavigate();

  const handleLocationSearch = async (e) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5`);
      const data = await res.json();
      setSearchResults(data || []);
      if (!data || data.length === 0) {
        toast.error('No locations found for this query.');
      }
    } catch (err) {
      toast.error('Location search failed.');
    } finally {
      setSearching(false);
    }
  };

  const selectSearchResult = (item) => {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    setPosition({ lat, lng });
    setForm(f => ({ ...f, address: item.display_name }));
    setSearchResults([]);
    setSearchQuery('');
    toast.success('Exact location selected!');
  };

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleImage = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5MB'); return; }
    setImage(file);
    setPreview(URL.createObjectURL(file));
  };

  // ── Camera Functions ──
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } 
      });
      streamRef.current = stream;
      setCameraActive(true);
      // Wait for next render so videoRef is mounted
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      }, 100);
    } catch (err) {
      toast.error('Camera access denied. Please allow camera permission.');
      console.error('Camera error:', err);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d').drawImage(videoRef.current, 0, 0);
    canvas.toBlob((blob) => {
      const file = new File([blob], `camera_${Date.now()}.jpg`, { type: 'image/jpeg' });
      setImage(file);
      setPreview(URL.createObjectURL(file));
      stopCamera();
      toast.success('Photo captured!');
    }, 'image/jpeg', 0.9);
  };

  const removeImage = () => {
    setImage(null);
    setPreview('');
  };

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const getLocation = () => {
    if (!navigator.geolocation) return toast.error('Geolocation not supported by your browser.');
    
    const loadingToast = toast.loading('Acquiring high-precision GPS coordinates...');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = Math.round(pos.coords.accuracy || 10);
        setPosition({ lat, lng });
        toast.success(`GPS Found! (Accuracy: ±${accuracy}m)`, { id: loadingToast });
        
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
          const data = await res.json();
          if (data && data.address) {
            const addr = data.address;
            const cleanParts = [addr.road, addr.neighbourhood, addr.suburb, addr.city || addr.town, addr.postcode].filter(Boolean);
            const cleanAddress = cleanParts.length > 0 ? cleanParts.join(', ') : data.display_name;
            setForm(f => ({ ...f, address: cleanAddress }));
            toast.success('Address auto-filled from GPS!');
          }
        } catch (err) {
          console.error("Geocoding failed", err);
        }
      },
      () => {
        toast.error('Could not acquire high-precision GPS. Please search or click on the map.', { id: loadingToast });
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };


  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.text.trim()) return toast.error('Please describe your complaint.');

    setLoading(true);
    const loadingToast = toast.loading('Submitting and analyzing with AI...');
    try {
      const fd = new FormData();
      fd.append('text', form.text);
      fd.append('address', form.address);
      if (position) {
        fd.append('lat', position.lat);
        fd.append('lng', position.lng);
      }
      if (image) fd.append('image', image);

      const { data } = await api.post('/complaints', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      toast.success('Complaint submitted successfully!', { id: loadingToast });
      navigate('/complaints');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Submission failed. Please try again.', { id: loadingToast });
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="page">
      <div className="container" style={{ maxWidth: 720 }}>
        <div className="mb-2">
          <h1>Submit a Complaint</h1>
          <p>Describe your civic issue. Our AI will automatically classify it and route it to the correct department.</p>
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card">
          <form onSubmit={handleSubmit}>
            <div className="form-group" style={{ position: 'relative' }}>
              <label className="form-label">Describe the Issue *</label>
              <textarea
                className="form-textarea"
                name="text"
                placeholder="e.g. There is a large pothole on MG Road near the bus stop..."
                value={form.text}
                onChange={handleChange}
                style={{ minHeight: 140, paddingBottom: '2rem' }}
                maxLength={500}
                required
              />
              <span style={{ position: 'absolute', bottom: '12px', right: '12px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                {form.text.length}/500
              </span>
            </div>

            <div className="form-group">
              <label className="form-label flex items-center gap-1">
                <Camera size={16} /> Attach Photo (Camera or Upload)
              </label>
              
              {/* Camera Active — Live Viewfinder */}
              {cameraActive && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                  style={{ 
                    borderRadius: 'var(--radius-md)', overflow: 'hidden', 
                    border: '2px solid var(--accent)', position: 'relative', background: '#000' 
                  }}
                >
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    style={{ width: '100%', maxHeight: 300, objectFit: 'cover', display: 'block' }} 
                  />
                  <div style={{ 
                    display: 'flex', justifyContent: 'center', gap: '1rem', 
                    padding: '1rem', background: 'rgba(0,0,0,0.7)' 
                  }}>
                    <button 
                      type="button" onClick={capturePhoto}
                      style={{
                        width: 60, height: 60, borderRadius: '50%', border: '3px solid white',
                        background: 'var(--danger)', cursor: 'pointer', display: 'flex', 
                        alignItems: 'center', justifyContent: 'center', transition: 'transform 0.2s'
                      }}
                      onMouseOver={e => e.currentTarget.style.transform = 'scale(1.1)'}
                      onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
                      title="Capture Photo"
                    >
                      <Camera size={24} color="white" />
                    </button>
                    <button 
                      type="button" onClick={stopCamera}
                      style={{
                        width: 44, height: 44, borderRadius: '50%', border: 'none',
                        background: 'rgba(255,255,255,0.2)', cursor: 'pointer', display: 'flex', 
                        alignItems: 'center', justifyContent: 'center', alignSelf: 'center'
                      }}
                      title="Cancel Camera"
                    >
                      <X size={20} color="white" />
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Preview — After Capture or Upload */}
              {preview && !cameraActive && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                  style={{ position: 'relative', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border)' }}
                >
                  <img src={preview} alt="Preview" style={{ display: 'block', width: '100%', maxHeight: 260, objectFit: 'cover' }} />
                  <button 
                    type="button" onClick={removeImage}
                    style={{
                      position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', 
                      color: 'white', border: 'none', borderRadius: '50%', width: 32, height: 32,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                    }}
                    title="Remove Photo"
                  >
                    <X size={16} />
                  </button>
                  <div style={{ 
                    padding: '0.5rem 1rem', background: 'rgba(5, 150, 105, 0.1)', 
                    borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.5rem' 
                  }}>
                    <span style={{ color: 'var(--success)', fontSize: '0.85rem', fontWeight: 600 }}>✓ Photo attached</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>({(image?.size / 1024).toFixed(0)} KB)</span>
                  </div>
                </motion.div>
              )}

              {/* Dual Option Buttons — Camera + Upload */}
              {!preview && !cameraActive && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  {/* Camera Option */}
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={startCamera}
                    style={{
                      border: '2px dashed var(--border)', borderRadius: 'var(--radius-md)',
                      padding: '1.5rem 1rem', textAlign: 'center', cursor: 'pointer',
                      backgroundColor: 'var(--bg-secondary)', transition: 'border-color 0.2s, background 0.2s',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem'
                    }}
                    onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'rgba(99,102,241,0.05)'; }}
                    onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-secondary)'; }}
                  >
                    <div style={{ 
                      background: 'linear-gradient(135deg, var(--accent), var(--accent-light))', 
                      padding: '0.75rem', borderRadius: '50%', display: 'flex' 
                    }}>
                      <Camera size={24} color="white" />
                    </div>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>Take Photo</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Open camera</span>
                  </motion.button>

                  {/* Upload Option */}
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => document.getElementById('file-upload').click()}
                    style={{
                      border: '2px dashed var(--border)', borderRadius: 'var(--radius-md)',
                      padding: '1.5rem 1rem', textAlign: 'center', cursor: 'pointer',
                      backgroundColor: 'var(--bg-secondary)', transition: 'border-color 0.2s, background 0.2s',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem'
                    }}
                    onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--success)'; e.currentTarget.style.background = 'rgba(5,150,105,0.05)'; }}
                    onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-secondary)'; }}
                  >
                    <div style={{ 
                      background: 'linear-gradient(135deg, var(--success), #34d399)', 
                      padding: '0.75rem', borderRadius: '50%', display: 'flex' 
                    }}>
                      <ImageIcon size={24} color="white" />
                    </div>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>Upload Photo</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>From gallery</span>
                  </motion.button>
                </div>
              )}

              <input
                id="file-upload"
                type="file"
                accept="image/*"
                onChange={handleImage}
                style={{ display: 'none' }}
              />
            </div>

            <div className="form-group">
              <label className="form-label flex items-center justify-between">
                <span className="flex items-center gap-1"><MapPin size={16} /> Precise Incident Location</span>
                {position && (
                  <span className="badge badge-primary" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                    🎯 GPS: {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
                  </span>
                )}
              </label>

              {/* Quick Address Search Box */}
              <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                      type="text"
                      className="form-input"
                      style={{ paddingLeft: '36px', height: '42px', fontSize: '0.9rem' }}
                      placeholder="Search landmark, street, or locality (e.g. Shivaji Road Pune, Connaught Place)..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleLocationSearch(e)}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleLocationSearch}
                    disabled={searching}
                    style={{ height: '42px', padding: '0 1rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    {searching ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={16} />}
                    <span>{searching ? 'Searching...' : 'Find'}</span>
                  </button>
                </div>

                {/* Search Suggestions Dropdown */}
                <AnimatePresence>
                  {searchResults.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      style={{
                        position: 'absolute',
                        top: '46px',
                        left: 0,
                        right: 0,
                        zIndex: 2000,
                        background: 'var(--bg-card, #ffffff)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-md)',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                        overflow: 'hidden',
                        maxHeight: '220px',
                        overflowY: 'auto'
                      }}
                    >
                      {searchResults.map((item, idx) => (
                        <div
                          key={idx}
                          onClick={() => selectSearchResult(item)}
                          style={{
                            padding: '10px 14px',
                            borderBottom: idx < searchResults.length - 1 ? '1px solid var(--border)' : 'none',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'background 0.15s'
                          }}
                          onMouseOver={(e) => e.currentTarget.style.background = 'rgba(99,102,241,0.08)'}
                          onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          <MapPin size={14} color="var(--accent)" style={{ flexShrink: 0 }} />
                          <span style={{ color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.display_name}
                          </span>
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Leaflet Map with Custom High-Contrast Marker */}
              <div style={{ height: 280, borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border)', position: 'relative' }}>
                <MapContainer center={position || [18.5204, 73.8567]} zoom={12} dragging={!L.Browser.mobile} tap={!L.Browser.mobile} style={{ height: '100%', width: '100%', zIndex: 1 }}>
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; OpenStreetMap'
                  />
                  <LocationPicker position={position} setPosition={setPosition} setAddress={(addr) => setForm(f => ({ ...f, address: addr }))} />
                </MapContainer>
                
                {/* Floating GPS Button Overlay */}
                <button 
                  type="button" 
                  onClick={getLocation} 
                  style={{
                    position: 'absolute',
                    bottom: '15px',
                    right: '15px',
                    zIndex: 1000,
                    background: 'white',
                    border: 'none',
                    borderRadius: '50%',
                    width: '44px',
                    height: '44px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                    cursor: 'pointer',
                    color: 'var(--accent)',
                    transition: 'transform 0.2s'
                  }}
                  onMouseOver={e => e.currentTarget.style.transform = 'scale(1.08)'}
                  onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
                  title="Use High-Precision GPS"
                >
                  <Navigation size={20} style={{ transform: 'translate(-1px, 1px)' }} />
                </button>
              </div>
              <p className="text-sm text-muted mt-1">💡 Click or drag the pulsing pin on the map to pinpoint the exact location.</p>
              
              <div style={{ position: 'relative', marginTop: '1rem' }}>
                <MapPin size={18} style={{ position: 'absolute', left: '1rem', top: '1rem', color: 'var(--text-secondary)' }} />
                <textarea
                  className="form-textarea"
                  name="address"
                  placeholder="Street address or area name (Auto-fills on map pin selection, or edit manually)"
                  value={form.address}
                  onChange={handleChange}
                  style={{ paddingLeft: '2.5rem', minHeight: '75px', backgroundColor: '#ffffff', border: '1px solid var(--border)' }}
                />
              </div>
            </div>


            <style>{`
              @keyframes spin { 100% { transform: rotate(360deg); } }
            `}</style>
            <button className="btn btn-primary btn-lg w-full mt-2" type="submit" disabled={loading} style={{ position: 'relative', overflow: 'hidden' }}>
              {loading ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={18} />}
              {loading ? 'Submitting & Analyzing...' : 'Submit Complaint'}
            </button>
          </form>
        </motion.div>
      </div>
    </motion.div>
  );
}
