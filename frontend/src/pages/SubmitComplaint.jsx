// src/pages/SubmitComplaint.jsx
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Upload, MapPin, Send } from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix leaflet default icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function LocationPicker({ position, setPosition }) {
  const map = useMap();

  useEffect(() => {
    if (position) {
      map.flyTo(position, 14); // fly to the position and zoom in
    }
  }, [position, map]);

  useMapEvents({
    click(e) {
      setPosition(e.latlng);
    },
  });
  return position ? <Marker position={position} /> : null;
}

export default function SubmitComplaint() {
  const [form, setForm]       = useState({ text: '', address: '' });
  const [position, setPosition] = useState(null); // {lat, lng}
  const [image, setImage]     = useState(null);
  const [preview, setPreview] = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const navigate              = useNavigate();

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleImage = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImage(file);
    setPreview(URL.createObjectURL(file));
  };

  const getLocation = () => {
    if (!navigator.geolocation) return toast.error('Geolocation not supported by your browser.');
    
    const loadingToast = toast.loading('Locating your position...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        toast.success('Location found!', { id: loadingToast });
      },
      () => {
        toast.error('Could not get GPS location. Please click on the map to drop a pin.', { id: loadingToast });
      }
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
            <div className="form-group">
              <label className="form-label">Describe the Issue *</label>
              <textarea
                className="form-textarea"
                name="text"
                placeholder="e.g. There is a large pothole on MG Road near the bus stop..."
                value={form.text}
                onChange={handleChange}
                style={{ minHeight: 140 }}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label flex items-center gap-1">
                <Upload size={16} /> Attach Photo
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImage}
                style={{ color: 'var(--text-secondary)' }}
              />
              {preview && (
                <div style={{ marginTop: '0.75rem', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <img src={preview} alt="Preview" style={{ display: 'block', width: '100%', maxHeight: 240, objectFit: 'cover' }} />
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label flex items-center justify-between">
                <span className="flex items-center gap-1"><MapPin size={16} /> Location Map</span>
                <button type="button" onClick={getLocation} style={{ background: 'none', border: 'none', color: 'var(--accent-light)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                  📍 Use My GPS
                </button>
              </label>
              <div style={{ height: 260, borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border)' }}>
                <MapContainer center={position || [28.6139, 77.2090]} zoom={11} dragging={!L.Browser.mobile} tap={!L.Browser.mobile} style={{ height: '100%', width: '100%' }}>
                  <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  />
                  <LocationPicker position={position} setPosition={setPosition} />
                </MapContainer>
              </div>
              <p className="text-sm text-muted mt-1">Click on the map to drop a pin.</p>
              
              <input
                className="form-input mt-1"
                name="address"
                placeholder="Street address or area name (Optional)"
                value={form.address}
                onChange={handleChange}
              />
            </div>

            <button className="btn btn-primary btn-lg w-full mt-2" type="submit" disabled={loading}>
              <Send size={18} />
              {loading ? 'Submitting & Analyzing...' : 'Submit Complaint'}
            </button>
          </form>
        </motion.div>
      </div>
    </motion.div>
  );
}
