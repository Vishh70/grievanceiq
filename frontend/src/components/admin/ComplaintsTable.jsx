// src/components/admin/ComplaintsTable.jsx
import React, { useState, useEffect } from 'react';
import { Search, Filter, AlertTriangle, Eye, Edit3, X, ChevronLeft, ChevronRight, CheckCircle2, Clock, RotateCcw, Loader, AlertCircle } from 'lucide-react';

export default function ComplaintsTable({
  complaints = [],
  total = 0,
  page = 1,
  pages = 1,
  limit = 10,
  filters = {},
  categories = [],
  departments = [],
  onFilterChange,
  onResetFilters,
  onPageChange,
  onOpenDrawer,
  onOpenStatusModal,
  onRetryProcessing,
  loading = false
}) {
  const [searchTerm, setSearchTerm] = useState(filters.search || '');

  // Synchronize local searchTerm if filters.search is externally cleared/reset
  useEffect(() => {
    if (!filters.search && searchTerm) {
      setSearchTerm('');
    }
  }, [filters.search]);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      if (searchTerm !== (filters.search || '')) {
        onFilterChange('search', searchTerm);
      }
    }, 350);

    return () => clearTimeout(handler);
  }, [searchTerm, filters.search, onFilterChange]);

  const hasActiveFilters = Boolean(
    filters.search || filters.category || filters.priority || filters.status || filters.department
  );

  const clearAllFilters = () => {
    setSearchTerm('');
    if (typeof onResetFilters === 'function') {
      onResetFilters();
    } else {
      onFilterChange('search', '');
      onFilterChange('category', '');
      onFilterChange('priority', '');
      onFilterChange('status', '');
      onFilterChange('department', '');
    }
  };

  const startRecord = total === 0 ? 0 : (page - 1) * limit + 1;
  const endRecord = Math.min(page * limit, total);

  return (
    <div className="admin-card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Table Header / Filters Bar */}
      <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--admin-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--admin-text-main)' }}>
              Complaint Intelligence Registry
            </h3>
            <p style={{ fontSize: '0.8125rem', color: 'var(--admin-text-muted)', margin: '0.2rem 0 0' }}>
              Real-time citizen grievances with AI classification, severity scoring, and SLA tracking
            </p>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={clearAllFilters}
              style={{ color: 'var(--admin-danger)', borderColor: '#fca5a5' }}
            >
              <X size={14} />
              <span>Clear All Filters</span>
            </button>
          )}
        </div>

        <div className="admin-filters-bar" style={{ margin: 0 }}>
          <div className="admin-search-box">
            <Search size={16} className="admin-search-icon" />
            <input
              type="text"
              className="admin-search-input"
              placeholder="Search description, address, keywords..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <select
            className="admin-filter-select"
            value={filters.category || ''}
            onChange={(e) => onFilterChange('category', e.target.value)}
            aria-label="Filter by category"
          >
            <option value="">All Categories</option>
            {categories.map((c, idx) => (
              <option key={idx} value={c.name}>{c.name}</option>
            ))}
          </select>

          <select
            className="admin-filter-select"
            value={filters.priority || ''}
            onChange={(e) => onFilterChange('priority', e.target.value)}
            aria-label="Filter by priority"
          >
            <option value="">All Priorities</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>

          <select
            className="admin-filter-select"
            value={filters.status || ''}
            onChange={(e) => onFilterChange('status', e.target.value)}
            aria-label="Filter by status"
          >
            <option value="">All Statuses</option>
            <option value="Pending">Pending</option>
            <option value="In Review">In Review</option>
            <option value="Assigned">Assigned</option>
            <option value="In Progress">In Progress</option>
            <option value="Resolved">Resolved</option>
            <option value="Rejected">Rejected</option>
          </select>

          <select
            className="admin-filter-select"
            value={filters.department || ''}
            onChange={(e) => onFilterChange('department', e.target.value)}
            aria-label="Filter by department"
          >
            <option value="">All Departments</option>
            {departments.map((d, idx) => (
              <option key={idx} value={d.name}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table Content */}
      <div className="admin-table-container" style={{ border: 'none', borderRadius: 0 }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Description & Physical Hazards</th>
              <th>Category</th>
              <th>Priority & Severity</th>
              <th>Department</th>
              <th>Workflow Status</th>
              <th>AI Processing</th>
              <th>Reported</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="9" style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--admin-text-muted)' }}>
                  <div className="spinner" style={{ margin: '0 auto 0.75rem', width: 24, height: 24 }} />
                  <span>Loading complaint intelligence...</span>
                </td>
              </tr>
            ) : complaints.length === 0 ? (
              <tr>
                <td colSpan="9" style={{ textAlign: 'center', padding: '3.5rem 1rem' }}>
                  <div style={{ color: 'var(--admin-text-muted)', fontSize: '0.95rem', fontWeight: 600 }}>
                    {hasActiveFilters ? 'No complaints match the specified filter criteria.' : 'No citizen complaints recorded yet.'}
                  </div>
                  {hasActiveFilters && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={clearAllFilters}
                      style={{ marginTop: '0.75rem' }}
                    >
                      Reset Filters
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              complaints.map((c) => {
                const isActiveWorkload = ['Pending', 'In Review', 'Assigned'].includes(c.status);
                const hoursPending = (Date.now() - new Date(c.createdAt).getTime()) / (1000 * 60 * 60);
                const isSlaBreached = isActiveWorkload && hoursPending > 48;
                const shortId = (c._id || '').slice(-6);

                const priorityLower = (c.priority || 'medium').toLowerCase();
                const statusSlug = (c.status || 'pending').toLowerCase().replace(/\s+/g, '');

                return (
                  <tr key={c._id}>
                    <td>
                      <button
                        type="button"
                        onClick={() => onOpenDrawer(c)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--admin-primary)',
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          cursor: 'pointer',
                          padding: 0
                        }}
                        title="Click to view deep AI analysis"
                      >
                        #{shortId}
                      </button>
                    </td>

                    <td style={{ maxWidth: '320px' }}>
                      <div
                        style={{
                          fontWeight: 600,
                          color: 'var(--admin-text-main)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                        title={c.text}
                      >
                        {c.text}
                      </div>

                      {c.safetyHazards && c.safetyHazards.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                          {c.safetyHazards.slice(0, 2).map((h, hIdx) => (
                            <span
                              key={hIdx}
                              style={{
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                padding: '1px 6px',
                                borderRadius: '4px',
                                background: '#fef2f2',
                                color: '#b91c1c',
                                border: '1px solid #fecaca',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '2px'
                              }}
                            >
                              ⚠️ {h}
                            </span>
                          ))}
                          {c.safetyHazards.length > 2 && (
                            <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>
                              +{c.safetyHazards.length - 2} more
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    <td>
                      <span style={{ fontWeight: 500, color: '#334155' }}>
                        {c.category || 'General'}
                      </span>
                    </td>

                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span className={`admin-badge admin-badge-${priorityLower}`}>
                          {c.priority}
                        </span>

                        {c.severityScore != null ? (
                          <span
                            className={`admin-severity-chip ${c.severityScore >= 8 ? 'severe' : c.severityScore >= 6 ? 'moderate' : 'mild'}`}
                            title={`AI Severity Assessment: ${c.severityScore}/10`}
                          >
                            ⚡ {c.severityScore}/10
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)' }}>
                            (Unscored)
                          </span>
                        )}
                      </div>
                    </td>

                    <td>
                      <span style={{ fontSize: '0.8125rem', color: c.recommendedDepartment ? '#1e293b' : '#94a3b8', fontWeight: 500 }}>
                        {c.recommendedDepartment || 'Unassigned'}
                      </span>
                    </td>

                    <td>
                      <div>
                        <span className={`admin-badge admin-badge-status-${statusSlug}`}>
                          {c.status}
                        </span>
                        {isSlaBreached && (
                          <div style={{ marginTop: '4px' }}>
                            <span
                              className="admin-badge admin-badge-critical"
                              style={{ fontSize: '0.68rem', padding: '1px 6px' }}
                              title={`Open for ${hoursPending.toFixed(1)} hours (Exceeds 48h SLA)`}
                            >
                              <AlertTriangle size={11} /> SLA Breach
                            </span>
                          </div>
                        )}
                      </div>
                    </td>

                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {c.processingStatus === 'PROCESSED' ? (
                          <span
                            className="admin-badge admin-badge-resolved"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', width: 'fit-content' }}
                            title="AI and ML pipeline stages successfully verified and persisted"
                          >
                            <CheckCircle2 size={11} /> Processed
                          </span>
                        ) : c.processingStatus === 'PROCESSING' ? (
                          <span
                            className="admin-badge admin-badge-inreview"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', width: 'fit-content' }}
                            title="Background inference job is currently in progress"
                          >
                            <Loader size={11} className="spinner-icon" /> Processing...
                          </span>
                        ) : c.processingStatus === 'FAILED' ? (
                          <span
                            className="admin-badge admin-badge-critical"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', width: 'fit-content' }}
                            title={c.processingError ? `Processing Failure: ${c.processingError}` : 'AI inference failed'}
                          >
                            <AlertTriangle size={11} /> Failed
                          </span>
                        ) : (
                          <span
                            className="admin-badge admin-badge-pending"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', width: 'fit-content' }}
                            title="Awaiting worker inference execution"
                          >
                            <Clock size={11} /> Pending AI
                          </span>
                        )}

                        {c.processingError && c.processingStatus === 'FAILED' && (
                          <span
                            style={{
                              fontSize: '0.67rem',
                              color: '#b91c1c',
                              maxWidth: '140px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                            title={c.processingError}
                          >
                            {c.processingError}
                          </span>
                        )}
                      </div>
                    </td>

                    <td>
                      <span style={{ fontSize: '0.8125rem', color: 'var(--admin-text-muted)' }}>
                        {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : 'N/A'}
                      </span>
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.4rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                        {c.processingStatus !== 'PROCESSED' && typeof onRetryProcessing === 'function' && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => onRetryProcessing(c._id || c)}
                            style={{ padding: '0.35rem 0.6rem', color: '#b91c1c', borderColor: '#fecaca' }}
                            title="Reprocess complaint through AI/ML pipeline"
                          >
                            <RotateCcw size={13} />
                            <span>Retry AI</span>
                          </button>
                        )}

                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => onOpenDrawer(c)}
                          style={{ padding: '0.35rem 0.6rem' }}
                          title="Inspect AI Analysis and Details"
                        >
                          <Eye size={13} />
                          <span>Details</span>
                        </button>

                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => onOpenStatusModal(c)}
                          style={{ padding: '0.35rem 0.6rem' }}
                          title="Update Status"
                        >
                          <Edit3 size={13} />
                          <span>Status</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="admin-table-pagination">
        <div>
          <span>
            Showing <strong>{startRecord}</strong> to <strong>{endRecord}</strong> of <strong>{total}</strong> complaints
            {hasActiveFilters && ' (filtered)'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={page <= 1 || loading}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft size={14} />
            <span>Previous</span>
          </button>

          <span style={{ fontSize: '0.8125rem', padding: '0 0.5rem', fontWeight: 600, color: 'var(--admin-text-main)' }}>
            Page {page} of {Math.max(pages, 1)}
          </span>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={page >= pages || loading}
            onClick={() => onPageChange(page + 1)}
          >
            <span>Next</span>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
