import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { Map, Navigation } from 'lucide-react';
import L from 'leaflet';
import { createPinIcon, PRIORITY_MAP_COLORS } from '../utils/mapIcons';

export default function ComplaintMap({ lat, lng, address, priority = 'Medium', height = 240 }) {
  if (!lat || !lng) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-2 mt-1" style={{ height, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--border)' }}>
        <Map size={24} color="var(--text-muted)" className="mb-1" />
        <p className="text-sm text-muted">No precise GPS data provided</p>
      </div>
    );
  }

  const markerColor = PRIORITY_MAP_COLORS[priority] || '#ef4444';
  const customIcon = createPinIcon(markerColor, 38);
  const mapLink = `https://www.google.com/maps?q=${lat},${lng}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ height, borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border)', position: 'relative' }}>
        <MapContainer 
          key={`${lat}-${lng}`}
          center={[lat, lng]} 
          zoom={16} 
          dragging={!L.Browser.mobile} 
          tap={!L.Browser.mobile} 
          style={{ height: '100%', width: '100%', zIndex: 1 }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OpenStreetMap'
          />
          <Marker position={[lat, lng]} icon={customIcon}>
            <Popup>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '4px' }}>
                📍 {address || 'Incident Location'}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                GPS: {Number(lat).toFixed(6)}, {Number(lng).toFixed(6)}
              </div>
            </Popup>
          </Marker>
        </MapContainer>
        
        {/* Floating Precision GPS Badge */}
        <div style={{
          position: 'absolute',
          bottom: '10px',
          left: '10px',
          zIndex: 1000,
          background: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(6px)',
          color: '#f8fafc',
          padding: '4px 10px',
          borderRadius: '20px',
          fontSize: '0.75rem',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          border: '1px solid rgba(255,255,255,0.15)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
        }}>
          <Navigation size={12} color={markerColor} />
          <span>{Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}</span>
        </div>
      </div>
      
      <a 
        href={mapLink} 
        target="_blank" 
        rel="noreferrer" 
        style={{ fontSize: '0.9rem', color: 'var(--accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.25rem', alignSelf: 'flex-start', fontWeight: 500 }}
      >
        <Map size={14} /> Open in Google Maps
      </a>
    </div>
  );
}

