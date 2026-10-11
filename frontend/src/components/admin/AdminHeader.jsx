import React from 'react';
import { RefreshCw, Download, FileText, Activity } from 'lucide-react';

export default function AdminHeader({
  lastRefreshed,
  onRefresh,
  onExportCsv,
  onViewComplaints,
  isRefreshing,
  isExporting,
  civicIssueCount = 0,
  activeBreaches = 0,
  totalComplaints = 0,
  activeTab = 'overview'
}) {
  return (
    <header className="admin-header">
      <div className="admin-header-title-wrap">
        <div className="admin-header-badge-icon" aria-hidden="true">
          <Activity size={24} />
        </div>
        <div>
          <h1 className="admin-header-title">Municipal Operations Center</h1>
          <div className="admin-header-subtitle">
            <span>Civic Intelligence & DAG Workstream Orchestration</span>
            {lastRefreshed && (
              <>
                <span style={{ color: '#cbd5e1' }}>•</span>
                <span>Refreshed at {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="admin-header-actions">
        {activeBreaches > 0 && (
          <div className="admin-badge admin-badge-critical" title="Complaints open beyond 48-hour SLA threshold">
            ⚠️ {activeBreaches} SLA {activeBreaches === 1 ? 'Breach' : 'Breaches'}
          </div>
        )}

        {activeTab !== 'complaints' && onViewComplaints && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onViewComplaints}
            title="Jump to All Complaints registry"
            style={{ borderColor: 'rgba(99, 102, 241, 0.4)', background: 'rgba(99, 102, 241, 0.08)', color: 'var(--admin-text-main)' }}
          >
            <FileText size={14} style={{ color: '#818cf8' }} />
            <span>All Complaints{totalComplaints > 0 ? ` (${totalComplaints})` : ''}</span>
          </button>
        )}

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onRefresh}
          disabled={isRefreshing}
          title="Refresh all dashboard data"
        >
          <RefreshCw size={14} className={isRefreshing ? 'spinner' : ''} />
          <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
        </button>

        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onExportCsv}
          disabled={isExporting}
          title="Export matching complaints to CSV"
        >
          <Download size={14} />
          <span>{isExporting ? 'Exporting...' : 'Export Filtered CSV'}</span>
        </button>
      </div>
    </header>
  );
}
