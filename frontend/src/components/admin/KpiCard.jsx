// src/components/admin/KpiCard.jsx
import React from 'react';

export default function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconBg = 'rgba(79, 70, 229, 0.1)',
  iconColor = '#4f46e5',
  badgeText,
  badgeType = 'default',
  onClick
}) {
  return (
    <div
      className="admin-kpi-card"
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <div className="admin-kpi-header">
        <span className="admin-kpi-title">{title}</span>
        {Icon && (
          <div className="admin-kpi-icon" style={{ background: iconBg, color: iconColor }}>
            <Icon size={18} />
          </div>
        )}
      </div>

      <div>
        <div className="admin-kpi-value">{value != null ? value : 'N/A'}</div>
        <div className="admin-kpi-sub">
          {badgeText && (
            <span
              className={`admin-badge ${badgeType === 'danger' ? 'admin-badge-critical' : badgeType === 'warning' ? 'admin-badge-high' : badgeType === 'success' ? 'admin-badge-low' : 'admin-badge-medium'}`}
              style={{ fontSize: '0.68rem', padding: '1px 6px', marginRight: '4px' }}
            >
              {badgeText}
            </span>
          )}
          <span>{subtitle}</span>
        </div>
      </div>
    </div>
  );
}
