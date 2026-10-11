// src/components/admin/AdminNav.jsx
import React from 'react';
import { LayoutDashboard, FileText, Layers, ShieldAlert, MapPin } from 'lucide-react';

export default function AdminNav({ activeTab, onChangeTab, counts = {} }) {
  const tabs = [
    { id: 'overview', label: 'Operations Overview', icon: LayoutDashboard },
    { 
      id: 'complaints', 
      label: 'All Complaints & Intelligence', 
      ariaLabel: 'All Complaints & Complaint Intelligence', 
      icon: FileText, 
      count: counts.complaints 
    },
    { id: 'civic-issues', label: 'Civic Issues & DAG Workflow', icon: Layers, count: counts.civicIssues },
    { id: 'ai-safety', label: 'AI & Safety Intelligence', icon: ShieldAlert, count: counts.hazards },
    { id: 'incident-map', label: 'Geographic Risk & Map', icon: MapPin, count: counts.mapPins }
  ];

  return (
    <nav className="admin-nav-bar" aria-label="Dashboard views">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            className={`admin-nav-tab ${isActive ? 'active' : ''}`}
            onClick={() => onChangeTab(tab.id)}
            aria-selected={isActive}
            aria-label={tab.ariaLabel || tab.label}
            role="tab"
          >
            <Icon size={16} />
            <span>{tab.label}</span>
            {tab.count != null && tab.count > 0 && (
              <span className="admin-tab-count">{tab.count}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
