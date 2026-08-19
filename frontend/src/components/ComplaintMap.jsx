import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { Map } from 'lucide-react';
import L from 'leaflet';

export default function ComplaintMap({ lat, lng, address, height = 220 }) {
  if (!lat || !lng) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-2 mt-1" style={{ height, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--border)' }}>
        <Map size={24} color="var(--text-muted)" className="mb-1" />
        <p className="text-sm text-muted">No precise GPS data provided</p>
      </div>
    );
  }

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
          <Marker position={[lat, lng]}>
            <Popup>{address || `Coordinates: ${lat.toFixed(5)}, ${lng.toFixed(5)}`}</Popup>
          </Marker>
        </MapContainer>
      </div>
      <a 
        href={mapLink} 
        target="_blank" 
        rel="noreferrer" 
        style={{ fontSize: '0.9rem', color: 'var(--accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.25rem', alignSelf: 'flex-start' }}
      >
        <Map size={14} /> Open in Google Maps
      </a>
    </div>
  );
}
