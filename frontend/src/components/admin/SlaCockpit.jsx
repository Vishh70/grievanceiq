// src/components/admin/SlaCockpit.jsx
import React from 'react';
import { Timer, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';

export default function SlaCockpit({ analytics = {} }) {
  const complianceRate = analytics.slaComplianceRate;
  const avgResolutionHours = analytics.avgResolutionHours;
  const activeBreaches = analytics.activeSlaBreaches;

  const complianceColor =
    complianceRate == null
      ? 'var(--admin-text-muted)'
      : complianceRate >= 80
      ? 'var(--admin-success)'
      : complianceRate >= 60
      ? 'var(--admin-warning)'
      : 'var(--admin-danger)';

  return (
    <div className="admin-card" style={{ borderLeft: '4px solid var(--admin-primary)' }}>
      <div className="admin-card-header">
        <h3 className="admin-card-title">
          <Timer size={20} color="var(--admin-primary)" />
          <span>Municipal SLA Performance Cockpit</span>
        </h3>
        <span className="admin-badge admin-badge-medium" style={{ textTransform: 'none' }}>
          48-Hour Threshold Standard
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
        <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: 'var(--admin-radius-sm)', border: '1px solid var(--admin-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--admin-text-muted)', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase' }}>
            <CheckCircle2 size={14} color={complianceColor} />
            <span>SLA Compliance</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: complianceColor, lineHeight: 1.1 }}>
            {complianceRate != null ? `${complianceRate}%` : 'N/A'}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)', marginTop: '0.35rem' }}>
            Resolved within &le; 48 hours
          </div>
        </div>

        <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: 'var(--admin-radius-sm)', border: '1px solid var(--admin-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--admin-text-muted)', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase' }}>
            <Clock size={14} color="var(--admin-info)" />
            <span>Mean Resolution</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--admin-text-main)', lineHeight: 1.1 }}>
            {avgResolutionHours != null ? `${avgResolutionHours} hrs` : 'N/A'}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)', marginTop: '0.35rem' }}>
            Submit to resolution timestamp
          </div>
        </div>

        <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: 'var(--admin-radius-sm)', border: '1px solid var(--admin-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--admin-text-muted)', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase' }}>
            <AlertTriangle size={14} color={activeBreaches > 0 ? 'var(--admin-danger)' : 'var(--admin-success)'} />
            <span>Active Breaches</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: activeBreaches > 0 ? 'var(--admin-danger)' : 'var(--admin-success)', lineHeight: 1.1 }}>
            {activeBreaches != null ? activeBreaches : 'N/A'}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)', marginTop: '0.35rem' }}>
            Open pending &gt; 48 hours
          </div>
        </div>
      </div>

      <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--admin-text-muted)', lineHeight: 1.5 }}>
        * Note: SLA breaches track active complaints in <em>Pending</em> and <em>In Review</em> states exceeding the 48-hour deadline. Resolved complaints calculate actual duration against historical timeline records.
      </p>
    </div>
  );
}
