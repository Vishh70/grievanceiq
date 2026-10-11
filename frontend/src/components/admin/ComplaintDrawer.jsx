// src/components/admin/ComplaintDrawer.jsx
import React, { useState, useEffect } from 'react';
import {
  X, AlertTriangle, ShieldAlert, Cpu, Sparkles, MapPin, Clock,
  User, CheckCircle2, Building, Tag, ExternalLink, Edit3, RefreshCw
} from 'lucide-react';
import ComplaintMap from '../ComplaintMap';

// Canonical thresholds from backend/ml/models/multilabel_thresholds.csv
const MODEL_THRESHOLDS = {
  'Road Damage': 0.59,
  'Roadside Flooding': 0.61,
  'Water Leakage': 0.51,
  'Electric Pole': 0.58,
  'Streetlight': 0.58,
  'Traffic Signal': 0.60,
  'Garbage': 0.65,
  'Tree Hazard': 0.43,
  'Drainage': 0.66
};

export default function ComplaintDrawer({
  complaint,
  isOpen,
  onClose,
  onOpenStatusModal,
  onRetryProcessing
}) {
  const [activeTab, setActiveTab] = useState('triage');
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !complaint) return null;

  const priorityLower = (complaint.priority || 'medium').toLowerCase();
  const statusSlug = (complaint.status || 'pending').toLowerCase().replace(/\s+/g, '');
  const shortId = (complaint._id || '').slice(-6);

  const isActiveWorkload = ['Pending', 'In Review', 'Assigned'].includes(complaint.status);
  const hoursPending = complaint.createdAt
    ? (Date.now() - new Date(complaint.createdAt).getTime()) / (1000 * 60 * 60)
    : 0;
  const isSlaBreached = isActiveWorkload && hoursPending > 48;

  const mlLabels = complaint.mlLabels || [];
  const mlProbabilities = complaint.mlProbabilities || {};
  const mlDepartments = complaint.mlDepartments || [];
  const statusHistory = complaint.statusHistory || [];

  return (
    <div className="admin-drawer-overlay" onClick={onClose}>
      <aside
        className="admin-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Complaint #${shortId} details`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="admin-drawer-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '1.1rem', color: 'var(--admin-primary)' }}>
                #{shortId}
              </span>
              <span className={`admin-badge admin-badge-${priorityLower}`}>
                {complaint.priority}
              </span>
              <span className={`admin-badge admin-badge-status-${statusSlug}`}>
                {complaint.status}
              </span>
              <span className={`admin-badge ${
                complaint.processingStatus === 'PROCESSED' ? 'admin-badge-success' :
                complaint.processingStatus === 'PROCESSING' ? 'admin-badge-warning' :
                complaint.processingStatus === 'FAILED' ? 'admin-badge-critical' : 'admin-badge-info'
              }`} style={{ fontSize: '0.72rem' }}>
                AI: {complaint.processingStatus || 'PENDING'}
              </span>
              {isSlaBreached && (
                <span className="admin-badge admin-badge-critical" style={{ fontSize: '0.7rem' }}>
                  <AlertTriangle size={12} /> SLA Breach ({hoursPending.toFixed(1)}h)
                </span>
              )}
            </div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--admin-text-main)' }}>
              {complaint.category} Grievance
            </h2>
          </div>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClose}
            aria-label="Close drawer"
            style={{ borderRadius: '50%', width: 34, height: 34, padding: 0 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* AI Processing Failure Alert */}
        {complaint.processingStatus === 'FAILED' && (
          <div style={{
            margin: '0.75rem 1.5rem',
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
              <AlertTriangle size={16} color="#dc2626" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#991b1b' }}>
                  AI Background Processing Failed
                </div>
                <div style={{ fontSize: '0.75rem', color: '#b91c1c', marginTop: '1px' }}>
                  {complaint.processingError || 'Stage execution failed. Triage was preserved where available.'}
                </div>
              </div>
            </div>
            {onRetryProcessing && (
              <button
                type="button"
                disabled={retrying}
                onClick={async () => {
                  setRetrying(true);
                  try {
                    await onRetryProcessing(complaint._id);
                  } finally {
                    setRetrying(false);
                  }
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  background: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  cursor: retrying ? 'not-allowed' : 'pointer',
                  flexShrink: 0
                }}
              >
                <RefreshCw size={12} className={retrying ? 'spin' : ''} />
                {retrying ? 'Retrying...' : 'Retry AI'}
              </button>
            )}
          </div>
        )}

        {/* Tab Switcher inside Drawer */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--admin-border)', background: '#f8fafc', padding: '0 1.5rem' }}>
          <button
            type="button"
            onClick={() => setActiveTab('triage')}
            style={{
              padding: '0.75rem 1rem',
              border: 'none',
              background: 'transparent',
              fontWeight: 600,
              fontSize: '0.8125rem',
              color: activeTab === 'triage' ? 'var(--admin-primary)' : 'var(--admin-text-muted)',
              borderBottom: activeTab === 'triage' ? '2px solid var(--admin-primary)' : '2px solid transparent',
              cursor: 'pointer'
            }}
          >
            Triage & Overview
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ai-models')}
            style={{
              padding: '0.75rem 1rem',
              border: 'none',
              background: 'transparent',
              fontWeight: 600,
              fontSize: '0.8125rem',
              color: activeTab === 'ai-models' ? 'var(--admin-primary)' : 'var(--admin-text-muted)',
              borderBottom: activeTab === 'ai-models' ? '2px solid var(--admin-primary)' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
          >
            <Cpu size={14} />
            <span>ML Multi-Label Models</span>
            {mlLabels.length > 0 && (
              <span style={{ fontSize: '0.68rem', padding: '1px 5px', borderRadius: 999, background: 'var(--admin-primary-light)', color: 'var(--admin-primary)', fontWeight: 700 }}>
                {mlLabels.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('timeline')}
            style={{
              padding: '0.75rem 1rem',
              border: 'none',
              background: 'transparent',
              fontWeight: 600,
              fontSize: '0.8125rem',
              color: activeTab === 'timeline' ? 'var(--admin-primary)' : 'var(--admin-text-muted)',
              borderBottom: activeTab === 'timeline' ? '2px solid var(--admin-primary)' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
          >
            <Clock size={14} />
            <span>Timeline</span>
          </button>
        </div>

        {/* Drawer Body */}
        <div className="admin-drawer-body">
          {activeTab === 'triage' && (
            <>
              {/* Full Description */}
              <div className="admin-drawer-section">
                <div className="admin-drawer-section-title">
                  <Tag size={15} color="var(--admin-primary)" />
                  <span>Reported Description</span>
                </div>
                <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: 'var(--admin-radius-sm)', border: '1px solid var(--admin-border)', fontSize: '0.9rem', lineHeight: 1.6, color: 'var(--admin-text-main)' }}>
                  {complaint.text}
                </div>
                {complaint.imageUrl && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <img
                      src={complaint.imageUrl}
                      alt="Citizen grievance attachment"
                      style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 'var(--admin-radius-sm)', objectFit: 'cover', border: '1px solid var(--admin-border)' }}
                    />
                  </div>
                )}
              </div>

              {/* Generative AI Assessment (Gemini Triage) */}
              <div className="admin-drawer-section">
                <div className="admin-drawer-section-title">
                  <Sparkles size={15} color="#d97706" />
                  <span>Generative AI Triage Assessment</span>
                </div>

                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 'var(--admin-radius-sm)', padding: '1rem', marginBottom: '1rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: '#b45309', fontWeight: 600, textTransform: 'uppercase' }}>Assessed Severity</span>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: complaint.severityScore >= 8 ? '#dc2626' : '#d97706' }}>
                        {complaint.severityScore != null ? `⚡ ${complaint.severityScore} / 10` : 'Unrated'}
                      </div>
                    </div>

                    <div>
                      <span style={{ fontSize: '0.72rem', color: '#b45309', fontWeight: 600, textTransform: 'uppercase' }}>Assigned Department</span>
                      <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
                        {complaint.recommendedDepartment || 'General Municipal Pool'}
                      </div>
                    </div>
                  </div>

                  {complaint.safetyHazards && complaint.safetyHazards.length > 0 && (
                    <div style={{ marginBottom: '0.75rem' }}>
                      <span style={{ fontSize: '0.72rem', color: '#b45309', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                        Physical Safety Hazards Identified
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                        {complaint.safetyHazards.map((hazard, hIdx) => (
                          <span
                            key={hIdx}
                            style={{
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background: '#fef2f2',
                              color: '#b91c1c',
                              border: '1px solid #fecaca'
                            }}
                          >
                            ⚠️ {hazard}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {complaint.suggestedAction && (
                    <div style={{ marginTop: '0.5rem', borderTop: '1px dashed #fde68a', paddingTop: '0.5rem' }}>
                      <span style={{ fontSize: '0.72rem', color: '#b45309', fontWeight: 700, textTransform: 'uppercase' }}>
                        Recommended Operational Action:
                      </span>
                      <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#78350f', lineHeight: 1.5 }}>
                        {complaint.suggestedAction}
                      </p>
                    </div>
                  )}

                  <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', color: '#92400e', fontStyle: 'italic' }}>
                    * AI assessment assists human operators; operational authority remains with municipal coordinators.
                  </div>
                </div>

                {complaint.keywords && complaint.keywords.length > 0 && (
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                      Extracted Incident Keywords
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {complaint.keywords.map((kw, i) => (
                        <span key={i} style={{ fontSize: '0.72rem', background: '#f1f5f9', color: '#334155', padding: '2px 8px', borderRadius: 999, border: '1px solid #e2e8f0' }}>
                          #{kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Geographic Coordinates & Location */}
              <div className="admin-drawer-section">
                <div className="admin-drawer-section-title">
                  <MapPin size={15} color="var(--admin-primary)" />
                  <span>Geographic Location</span>
                </div>

                <div style={{ marginBottom: '0.75rem', fontSize: '0.875rem' }}>
                  <strong>Address:</strong> {complaint.location?.address || 'No street address specified'}
                </div>

                {complaint.location?.lat != null && complaint.location?.lng != null ? (
                  <ComplaintMap
                    lat={complaint.location.lat}
                    lng={complaint.location.lng}
                    address={complaint.location.address}
                    priority={complaint.priority}
                    height={200}
                  />
                ) : (
                  <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: 'var(--admin-radius-sm)', border: '1px dashed var(--admin-border)', textAlign: 'center', color: 'var(--admin-text-muted)', fontSize: '0.85rem' }}>
                    No precise GPS latitude/longitude coordinates available for this complaint.
                  </div>
                )}
              </div>

              {/* Citizen Details */}
              <div className="admin-drawer-section">
                <div className="admin-drawer-section-title">
                  <User size={15} color="var(--admin-info)" />
                  <span>Citizen Information</span>
                </div>
                <div style={{ background: '#f8fafc', padding: '0.85rem 1rem', borderRadius: 'var(--admin-radius-sm)', border: '1px solid var(--admin-border)', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <span style={{ color: 'var(--admin-text-muted)' }}>Name:</span>
                    <strong>{typeof complaint.citizenId === 'object' ? complaint.citizenId?.name || 'Anonymous Citizen' : 'Citizen User'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <span style={{ color: 'var(--admin-text-muted)' }}>Email:</span>
                    <span>{typeof complaint.citizenId === 'object' ? complaint.citizenId?.email || 'N/A' : 'N/A'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--admin-text-muted)' }}>Public Upvotes:</span>
                    <span>👍 {complaint.upvotes || 0}</span>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'ai-models' && (
            <>
              {/* Python ML Multi-Label Predictions */}
              <div className="admin-drawer-section">
                <div className="admin-drawer-section-title">
                  <Cpu size={15} color="var(--admin-primary)" />
                  <span>9-Label Logistic Regression Predictions</span>
                </div>

                <p style={{ fontSize: '0.8125rem', color: 'var(--admin-text-muted)', marginBottom: '1rem', lineHeight: 1.5 }}>
                  The backend inference engine runs 9 calibrated Logistic Regression binary estimators over 384-dimensional MiniLM embeddings.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {Object.entries(MODEL_THRESHOLDS).map(([label, threshold]) => {
                    const prob = mlProbabilities[label] ?? 0;
                    const isPositive = mlLabels.includes(label) || prob >= threshold;
                    const percent = Math.min(Math.round(prob * 100), 100);

                    return (
                      <div
                        key={label}
                        style={{
                          background: isPositive ? 'var(--admin-primary-light)' : '#f8fafc',
                          border: `1px solid ${isPositive ? '#c7d2fe' : 'var(--admin-border)'}`,
                          borderRadius: 'var(--admin-radius-sm)',
                          padding: '0.75rem 1rem'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                          <span style={{ fontWeight: isPositive ? 700 : 500, fontSize: '0.85rem', color: isPositive ? 'var(--admin-primary)' : 'var(--admin-text-main)' }}>
                            {label}
                          </span>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: isPositive ? 'var(--admin-primary)' : 'var(--admin-text-muted)' }}>
                            {prob > 0 ? `${percent}%` : 'Below Threshold'} {isPositive && '✓ Flagged'}
                          </span>
                        </div>

                        {/* Progress Bar */}
                        <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                          <div
                            style={{
                              width: `${percent}%`,
                              height: '100%',
                              background: isPositive ? 'var(--admin-primary)' : '#94a3b8',
                              transition: 'width 0.3s ease'
                            }}
                          />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--admin-text-muted)', marginTop: '4px' }}>
                          <span>Decision Threshold: {(threshold * 100).toFixed(0)}%</span>
                          <span>Model: LogisticRegression (384-dim)</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Routed Departments */}
              <div className="admin-drawer-section">
                <div className="admin-drawer-section-title">
                  <Building size={15} color="var(--admin-success)" />
                  <span>Routed Municipal Departments</span>
                </div>
                {mlDepartments.length === 0 ? (
                  <p style={{ fontSize: '0.85rem', color: 'var(--admin-text-muted)' }}>
                    No specific department mapping generated from multi-label classifications.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {mlDepartments.map((dept, idx) => (
                      <span key={idx} className="admin-badge admin-badge-low" style={{ fontSize: '0.78rem', padding: '4px 10px' }}>
                        🏛️ {dept}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Relationship & Clustering Details */}
              <div className="admin-drawer-section">
                <div className="admin-drawer-section-title">
                  <ShieldAlert size={15} color="var(--admin-info)" />
                  <span>Relationship & Deduplication Signals</span>
                </div>
                <div style={{ background: '#f8fafc', padding: '0.85rem 1rem', borderRadius: 'var(--admin-radius-sm)', border: '1px solid var(--admin-border)', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <span style={{ color: 'var(--admin-text-muted)' }}>Duplicate Flag:</span>
                    <strong>{complaint.isDuplicate ? '⚠️ Flagged Duplicate' : 'Independent Issue'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <span style={{ color: 'var(--admin-text-muted)' }}>Duplicate Score:</span>
                    <span>{complaint.duplicateScore != null ? (complaint.duplicateScore * 100).toFixed(1) + '%' : 'N/A'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--admin-text-muted)' }}>Similar Group Cluster:</span>
                    <span>{complaint.similarGroupId ? `#${complaint.similarGroupId.slice(-6)}` : 'None'}</span>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'timeline' && (
            <div className="admin-drawer-section">
              <div className="admin-drawer-section-title">
                <Clock size={15} color="var(--admin-primary)" />
                <span>Status & Audit Trail</span>
              </div>

              {statusHistory.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--admin-text-muted)' }}>
                  No historical status entries recorded yet.
                </p>
              ) : (
                <div style={{ position: 'relative', paddingLeft: '1.25rem', borderLeft: '2px solid var(--admin-border)' }}>
                  {statusHistory.map((item, idx) => (
                    <div key={idx} style={{ marginBottom: '1.25rem', position: 'relative' }}>
                      <div
                        style={{
                          position: 'absolute',
                          left: '-1.65rem',
                          top: '2px',
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: item.status === 'Resolved' ? 'var(--admin-success)' : 'var(--admin-primary)',
                          border: '2px solid #ffffff'
                        }}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <span className={`admin-badge admin-badge-status-${(item.status || 'pending').toLowerCase().replace(/\s+/g, '')}`}>
                          {item.status}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>
                          {item.date ? new Date(item.date).toLocaleString() : 'N/A'}
                        </span>
                      </div>
                      {item.note && (
                        <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: 'var(--admin-text-main)', background: '#f8fafc', padding: '0.5rem 0.75rem', borderRadius: 4, border: '1px solid var(--admin-border)' }}>
                          {item.note}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Footer */}
        <div className="admin-drawer-footer">
          <a
            href={`/complaints/${complaint._id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-sm"
          >
            <ExternalLink size={13} />
            <span>Public Page</span>
          </a>

          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              onClose();
              onOpenStatusModal(complaint);
            }}
          >
            <Edit3 size={13} />
            <span>Update Status</span>
          </button>
        </div>
      </aside>
    </div>
  );
}
