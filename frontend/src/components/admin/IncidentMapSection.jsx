// src/components/admin/IncidentMapSection.jsx
import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapPin, Compass, Link2, AlertTriangle, Layers } from 'lucide-react';
import { createPinIcon } from '../../utils/mapIcons';

export default function IncidentMapSection({
  mapPins = [],
  similarGroups = [],
  onSelectComplaint
}) {
  const validMapPins = (mapPins || []).filter(
    (p) => p.location?.lat != null && p.location?.lng != null && !isNaN(p.location.lat) && !isNaN(p.location.lng)
  );

  const defaultCenter = validMapPins.length > 0
    ? [validMapPins[0].location.lat, validMapPins[0].location.lng]
    : [12.9716, 77.5946]; // Fallback coordinates

  return (
    <div>
      {/* Map Card */}
      <div className="admin-card" style={{ marginBottom: '1.5rem' }}>
        <div className="admin-card-header">
          <h3 className="admin-card-title">
            <MapPin size={20} color="var(--admin-primary)" />
            <span>Geographic Incident Hotspot Map</span>
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Compass size={14} />
              <span>Color: 🔴 Severe (&ge;8) | 🟠 Moderate (&ge;6) | 🔵 Standard (&lt;6)</span>
            </span>
            <span className="admin-badge admin-badge-medium" style={{ textTransform: 'none' }}>
              {validMapPins.length} Geotagged Pins (Max 200)
            </span>
          </div>
        </div>

        {validMapPins.length === 0 ? (
          <div style={{ height: 350, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', borderRadius: 'var(--admin-radius-md)', border: '1px dashed var(--admin-border)', color: 'var(--admin-text-muted)' }}>
            <MapPin size={32} color="#94a3b8" style={{ marginBottom: '0.5rem' }} />
            <p style={{ margin: 0, fontWeight: 600 }}>No Geotagged Complaints Available</p>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem' }}>Complaints with valid GPS coordinates will automatically appear on this incident map.</p>
          </div>
        ) : (
          <div style={{ height: 460, borderRadius: 'var(--admin-radius-md)', overflow: 'hidden', border: '1px solid var(--admin-border)' }}>
            <MapContainer
              center={defaultCenter}
              zoom={12}
              dragging={!L.Browser.mobile}
              tap={!L.Browser.mobile}
              style={{ height: '100%', width: '100%', zIndex: 1 }}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="&copy; OpenStreetMap"
              />

              {validMapPins.map((pin) => {
                const score = pin.severityScore;
                const markerColor =
                  score >= 8 ? '#dc2626' :
                  score >= 6 ? '#ea580c' :
                  '#2563eb';

                const icon = createPinIcon(markerColor, 32);

                return (
                  <Marker
                    key={pin._id}
                    position={[pin.location.lat, pin.location.lng]}
                    icon={icon}
                  >
                    <Popup>
                      <div style={{ minWidth: 220, padding: '2px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '1px 6px', borderRadius: 4, background: markerColor, color: '#ffffff' }}>
                            {pin.priority || 'Medium'}
                          </span>
                          {score != null && (
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: markerColor }}>
                              ⚡ {score}/10
                            </span>
                          )}
                        </div>

                        <div style={{ fontWeight: 700, fontSize: '0.875rem', marginBottom: '4px', color: '#0f172a' }}>
                          {pin.category}
                        </div>

                        <p style={{ fontSize: '0.8rem', color: '#475569', marginBottom: '6px', lineHeight: 1.4, maxHeight: 60, overflow: 'hidden' }}>
                          {pin.text}
                        </p>

                        {pin.location?.address && (
                          <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: '8px' }}>
                            📍 {pin.location.address}
                          </div>
                        )}

                        {onSelectComplaint && (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm w-full"
                            style={{ padding: '0.35rem 0.5rem', fontSize: '0.78rem' }}
                            onClick={() => onSelectComplaint(pin)}
                          >
                            Inspect Triage Details →
                          </button>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
          </div>
        )}
      </div>

      {/* Similar Issue Groups & Duplicate Clusters */}
      <div className="admin-card">
        <div className="admin-card-header">
          <h3 className="admin-card-title">
            <Link2 size={20} color="var(--admin-warning)" />
            <span>AI Detected Similar Issue Clusters (Deduplication)</span>
          </h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>
            {similarGroups.length} Active Multi-Issue Clusters
          </span>
        </div>

        <p style={{ fontSize: '0.8125rem', color: 'var(--admin-text-muted)', marginBottom: '1rem', lineHeight: 1.5 }}>
          The semantic similarity and relationship models cluster complaints describing the same physical disruption to prevent redundant municipal dispatches.
        </p>

        {similarGroups.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem 1rem', background: '#f8fafc', borderRadius: 'var(--admin-radius-sm)', border: '1px dashed var(--admin-border)', color: 'var(--admin-text-muted)', fontSize: '0.85rem' }}>
            No multi-complaint duplicate clusters currently detected.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
            {similarGroups.map((group, idx) => (
              <div
                key={idx}
                style={{
                  background: '#f8fafc',
                  border: '1px solid var(--admin-border)',
                  borderLeft: '4px solid var(--admin-warning)',
                  borderRadius: 'var(--admin-radius-sm)',
                  padding: '1rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--admin-text-main)' }}>
                    Cluster #{String(group._id || '').slice(-6)}
                  </span>
                  <span className="admin-badge admin-badge-high" style={{ fontSize: '0.7rem' }}>
                    {group.count} Linked Issues
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>
                  Categories: <strong style={{ color: 'var(--admin-text-main)' }}>{(group.categories || []).join(', ')}</strong>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
