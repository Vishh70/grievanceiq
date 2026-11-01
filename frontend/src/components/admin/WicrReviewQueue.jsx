// frontend/src/components/admin/WicrReviewQueue.jsx
// FR06 / Phase 5: Municipal Officer Review Queue & WICR Loss Visualization

import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
  Scale,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  Search,
  Filter,
  Layers,
  GitBranch,
  ShieldAlert,
  ArrowRight,
  Info,
  History,
  Check,
  X,
  User,
  ExternalLink
} from 'lucide-react';

export default function WicrReviewQueue() {
  const { user } = useAuth();

  // State
  const [reviews, setReviews] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [stats, setStats] = useState(null);

  // Filters & Pagination
  const [search, setSearch] = useState('');
  const [relationshipType, setRelationshipType] = useState('ALL');
  const [department, setDepartment] = useState('ALL');
  const [page, setPage] = useState(1);
  const limit = 20;

  // Active Modals
  const [resolveModal, setResolveModal] = useState(null); // { review, action: 'ACCEPT' | 'REJECT' }
  const [reviewerNotes, setReviewerNotes] = useState('');
  const [submittingResolve, setSubmittingResolve] = useState(false);

  const [historyModal, setHistoryModal] = useState(null); // { review, events: [], history: [], loading: boolean }

  // Fetch pending reviews
  const fetchReviews = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setIsRefreshing(true);

    try {
      const params = {
        limit,
        offset: (page - 1) * limit,
        relationshipType: relationshipType !== 'ALL' ? relationshipType : undefined,
        department: department !== 'ALL' ? department : undefined,
        search: search.trim() ? search.trim() : undefined
      };

      const [reviewsRes, statsRes] = await Promise.all([
        api.get('/wicr/reviews', { params }),
        api.get('/wicr/stats')
      ]);

      setReviews(reviewsRes.data.reviews || []);
      setTotal(reviewsRes.data.total || 0);
      setStats(statsRes.data.stats || null);
    } catch (err) {
      console.error('Failed to load WICR review queue:', err);
      toast.error(err.response?.data?.error || 'Failed to load WICR reviews.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [page, relationshipType, department, search]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  // Open Resolve Modal
  const handleOpenResolve = (review, action) => {
    setResolveModal({ review, action });
    setReviewerNotes('');
  };

  // Submit Resolution
  const handleSubmitResolve = async () => {
    if (!resolveModal) return;
    setSubmittingResolve(true);
    const { review, action } = resolveModal;

    try {
      await api.post(`/wicr/reviews/${review.decision_id}/resolve`, {
        action,
        notes: reviewerNotes.trim() || undefined
      });

      toast.success(`Successfully ${action === 'ACCEPT' ? 'accepted' : 'rejected'} relationship.`);
      setResolveModal(null);
      setReviewerNotes('');
      // Refresh list
      fetchReviews(true);
    } catch (err) {
      if (err.response?.status === 409 || err.response?.data?.code === 'REVIEW_ALREADY_RESOLVED') {
        toast.error('Conflict: Another officer has already resolved this review item.', { duration: 6000 });
        setResolveModal(null);
        fetchReviews(true);
      } else {
        toast.error(err.response?.data?.error || 'Failed to submit review decision.');
      }
    } finally {
      setSubmittingResolve(false);
    }
  };

  // Open Audit History Modal
  const handleOpenHistory = async (review) => {
    setHistoryModal({ review, events: [], history: [], loading: true });
    try {
      const [eventsRes, historyRes] = await Promise.all([
        api.get(`/wicr/reviews/${review.decision_id}/events`).catch(() => ({ data: { events: [] } })),
        api.get(`/wicr/history/${review.source_complaint_id}/${review.target_complaint_id}`).catch(() => ({ data: { history: [] } }))
      ]);

      setHistoryModal({
        review,
        events: eventsRes.data.events || [],
        history: historyRes.data.history || [],
        loading: false
      });
    } catch (err) {
      toast.error('Failed to load decision audit history.');
      setHistoryModal(null);
    }
  };

  return (
    <div className="wicr-queue-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Header Banner */}
      <div style={{
        background: 'var(--admin-card-bg)',
        border: '1px solid var(--admin-border)',
        borderRadius: 'var(--admin-radius-lg)',
        padding: '1.5rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.25rem' }}>
            <div style={{
              width: '2.25rem',
              height: '2.25rem',
              borderRadius: '8px',
              background: '#e0e7ff',
              color: '#4338ca',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Scale size={20} />
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--admin-text-main)' }}>
              WICR Decision Review Queue
            </h2>
          </div>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--admin-text-muted)' }}>
            Weighted Incident & Causality Resolution — Human verification gate minimizing expected operational loss.
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchReviews(true)}
          disabled={loading || isRefreshing}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            background: 'var(--admin-card-bg)',
            border: '1px solid var(--admin-border)',
            borderRadius: 'var(--admin-radius-md)',
            color: 'var(--admin-text-main)',
            fontSize: '0.875rem',
            fontWeight: 500,
            cursor: 'pointer'
          }}
        >
          <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
          <span>{isRefreshing ? 'Refreshing...' : 'Refresh Queue'}</span>
        </button>
      </div>

      {/* Calibration Scope Banner */}
      <div style={{
        background: '#f0fdf4',
        border: '1px solid #bbf7d0',
        borderRadius: 'var(--admin-radius-md)',
        padding: '0.875rem 1.25rem',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.75rem',
        fontSize: '0.85rem',
        color: '#166534'
      }}>
        <Info size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
        <div>
          <strong>Calibration Scope Assurance (FR06):</strong> Empirical Platt scaling calibration strictly guarantees posterior probability validity for report relationships (<code>Duplicate</code> & <code>Related</code>). Task prerequisites across issues are managed as structural DAG execution constraints.
        </div>
      </div>

      {/* KPI Stats */}
      {stats && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem'
        }}>
          <div style={{
            background: 'var(--admin-card-bg)',
            border: '1px solid var(--admin-border)',
            borderRadius: 'var(--admin-radius-md)',
            padding: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem'
          }}>
            <div style={{
              width: '2.5rem',
              height: '2.5rem',
              borderRadius: '8px',
              background: '#fef3c7',
              color: '#d97706',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <AlertTriangle size={20} />
            </div>
            <div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--admin-text-main)' }}>{stats.pending}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Pending Reviews</div>
            </div>
          </div>

          <div style={{
            background: 'var(--admin-card-bg)',
            border: '1px solid var(--admin-border)',
            borderRadius: 'var(--admin-radius-md)',
            padding: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem'
          }}>
            <div style={{
              width: '2.5rem',
              height: '2.5rem',
              borderRadius: '8px',
              background: '#e0e7ff',
              color: '#4338ca',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Layers size={20} />
            </div>
            <div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--admin-text-main)' }}>{stats.duplicatesPending}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Duplicate Candidates</div>
            </div>
          </div>

          <div style={{
            background: 'var(--admin-card-bg)',
            border: '1px solid var(--admin-border)',
            borderRadius: 'var(--admin-radius-md)',
            padding: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem'
          }}>
            <div style={{
              width: '2.5rem',
              height: '2.5rem',
              borderRadius: '8px',
              background: '#ecfdf5',
              color: '#059669',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <GitBranch size={20} />
            </div>
            <div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--admin-text-main)' }}>{stats.relatedPending}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Related Candidates</div>
            </div>
          </div>

          <div style={{
            background: 'var(--admin-card-bg)',
            border: '1px solid var(--admin-border)',
            borderRadius: 'var(--admin-radius-md)',
            padding: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem'
          }}>
            <div style={{
              width: '2.5rem',
              height: '2.5rem',
              borderRadius: '8px',
              background: '#f1f5f9',
              color: '#475569',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <CheckCircle2 size={20} />
            </div>
            <div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--admin-text-main)' }}>{stats.resolvedAccept + stats.resolvedReject}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Resolved Decisions</div>
            </div>
          </div>
        </div>
      )}

      {/* Controls Bar: Filters & Search */}
      <div style={{
        background: 'var(--admin-card-bg)',
        border: '1px solid var(--admin-border)',
        borderRadius: 'var(--admin-radius-md)',
        padding: '1rem',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.875rem',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', flex: 1, minWidth: '240px', position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--admin-text-subtle)' }} />
          <input
            type="text"
            placeholder="Search complaint title, category, or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem 0.875rem 0.5rem 2.5rem',
              border: '1px solid var(--admin-border)',
              borderRadius: 'var(--admin-radius-sm)',
              background: 'var(--admin-bg)',
              color: 'var(--admin-text-main)',
              fontSize: '0.875rem'
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <select
            value={relationshipType}
            onChange={(e) => { setRelationshipType(e.target.value); setPage(1); }}
            style={{
              padding: '0.5rem 0.75rem',
              border: '1px solid var(--admin-border)',
              borderRadius: 'var(--admin-radius-sm)',
              background: 'var(--admin-card-bg)',
              color: 'var(--admin-text-main)',
              fontSize: '0.85rem'
            }}
          >
            <option value="ALL">All Types</option>
            <option value="Duplicate">Duplicate Candidate</option>
            <option value="Related">Related Candidate</option>
          </select>

          <select
            value={department}
            onChange={(e) => { setDepartment(e.target.value); setPage(1); }}
            style={{
              padding: '0.5rem 0.75rem',
              border: '1px solid var(--admin-border)',
              borderRadius: 'var(--admin-radius-sm)',
              background: 'var(--admin-card-bg)',
              color: 'var(--admin-text-main)',
              fontSize: '0.85rem'
            }}
          >
            <option value="ALL">All Departments</option>
            <option value="Roads">Roads Department</option>
            <option value="Water Supply">Water Supply Department</option>
            <option value="Electricity">Electricity Department</option>
            <option value="Sanitation">Sanitation Department</option>
          </select>
        </div>
      </div>

      {/* Review Queue Items */}
      {loading ? (
        <div style={{ padding: '3rem 0', textAlign: 'center', color: 'var(--admin-text-muted)' }}>
          <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.75rem' }} />
          <div>Loading pending WICR decisions...</div>
        </div>
      ) : reviews.length === 0 ? (
        <div style={{
          background: 'var(--admin-card-bg)',
          border: '1px dashed var(--admin-border)',
          borderRadius: 'var(--admin-radius-lg)',
          padding: '4rem 2rem',
          textAlign: 'center'
        }}>
          <CheckCircle2 size={40} style={{ color: '#059669', margin: '0 auto 1rem' }} />
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 0.5rem', color: 'var(--admin-text-main)' }}>
            Review Queue Clear
          </h3>
          <p style={{ margin: 0, color: 'var(--admin-text-muted)', fontSize: '0.875rem' }}>
            No pending uncertain relationship decisions require human verification.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {reviews.map((item) => {
            const rawP = Number(item.raw_probability || 0);
            const calP = item.is_calibrated && item.calibrated_probability != null
              ? Number(item.calibrated_probability)
              : null;
            const lAccept = Number(item.loss_accept || 0);
            const lReject = Number(item.loss_reject || 0);
            const lReview = Number(item.loss_review || 1.0);

            const isDuplicate = item.relationship_type === 'Duplicate';

            return (
              <div
                key={item.decision_id}
                style={{
                  background: 'var(--admin-card-bg)',
                  border: '1px solid var(--admin-border)',
                  borderRadius: 'var(--admin-radius-lg)',
                  boxShadow: 'var(--admin-shadow-sm)',
                  overflow: 'hidden'
                }}
              >
                {/* Top Item Meta Bar */}
                <div style={{
                  padding: '0.875rem 1.25rem',
                  background: 'var(--admin-bg)',
                  borderBottom: '1px solid var(--admin-border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.75rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.375rem',
                      padding: '0.25rem 0.625rem',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      background: isDuplicate ? '#e0e7ff' : '#ecfdf5',
                      color: isDuplicate ? '#4338ca' : '#059669',
                      border: `1px solid ${isDuplicate ? '#c7d2fe' : '#a7f3d0'}`
                    }}>
                      {isDuplicate ? <Layers size={13} /> : <GitBranch size={13} />}
                      <span>Proposed {item.relationship_type}</span>
                    </span>

                    <span style={{ fontSize: '0.75rem', color: 'var(--admin-text-subtle)' }}>
                      Decision #{item.decision_id.slice(0, 8)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                    {item.routed_reason && (
                      <span style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        background: '#fef3c7',
                        color: '#92400e',
                        fontSize: '0.72rem',
                        fontWeight: 600
                      }}>
                        {item.routed_reason}
                      </span>
                    )}

                    <span style={{ fontSize: '0.75rem', color: 'var(--admin-text-subtle)' }}>
                      {new Date(item.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Complaint Comparison Section */}
                <div style={{
                  padding: '1.25rem',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: '1.25rem',
                  borderBottom: '1px solid var(--admin-border-subtle)'
                }}>
                  {/* Complaint A */}
                  <div style={{
                    padding: '1rem',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 'var(--admin-radius-md)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Complaint A (New Report)</span>
                      <span style={{ fontSize: '0.75rem', background: '#e2e8f0', padding: '0.15rem 0.4rem', borderRadius: '4px', color: '#475569' }}>
                        {item.source_category || 'Other'}
                      </span>
                    </div>
                    <h4 style={{ margin: '0 0 0.375rem', fontSize: '0.95rem', fontWeight: 600, color: '#0f172a' }}>
                      {item.source_title || 'Untitled Complaint'}
                    </h4>
                    <p style={{ margin: 0, fontSize: '0.825rem', color: '#475569', lineHeight: 1.45 }}>
                      {item.source_description ? (item.source_description.slice(0, 160) + (item.source_description.length > 160 ? '...' : '')) : 'No description'}
                    </p>
                    {item.source_department && (
                      <div style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: '#64748b' }}>
                        Dept: <strong>{item.source_department}</strong>
                      </div>
                    )}
                  </div>

                  {/* Complaint B */}
                  <div style={{
                    padding: '1rem',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 'var(--admin-radius-md)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Complaint B (Target Candidate)</span>
                      <span style={{ fontSize: '0.75rem', background: '#e2e8f0', padding: '0.15rem 0.4rem', borderRadius: '4px', color: '#475569' }}>
                        {item.target_category || 'Other'}
                      </span>
                    </div>
                    <h4 style={{ margin: '0 0 0.375rem', fontSize: '0.95rem', fontWeight: 600, color: '#0f172a' }}>
                      {item.target_title || 'Untitled Complaint'}
                    </h4>
                    <p style={{ margin: 0, fontSize: '0.825rem', color: '#475569', lineHeight: 1.45 }}>
                      {item.target_description ? (item.target_description.slice(0, 160) + (item.target_description.length > 160 ? '...' : '')) : 'No description'}
                    </p>
                    {item.target_department && (
                      <div style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: '#64748b' }}>
                        Dept: <strong>{item.target_department}</strong>
                      </div>
                    )}
                  </div>
                </div>

                {/* Loss & Confidence Evaluation Section */}
                <div style={{
                  padding: '1.25rem',
                  background: '#fafafa',
                  borderBottom: '1px solid var(--admin-border-subtle)',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '1.25rem',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  {/* Probability Meter */}
                  <div style={{ minWidth: '220px', flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--admin-text-main)' }}>
                        Confidence Assessment
                      </span>
                      {item.is_calibrated ? (
                        <span style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 600 }}>
                          ✓ Calibrated (Platt v{item.calibration_version || '1.0'})
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.72rem', color: '#d97706', fontWeight: 600 }}>
                          ⚠️ Uncalibrated Raw Score
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{
                        flex: 1,
                        height: '8px',
                        background: '#e2e8f0',
                        borderRadius: '9999px',
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          height: '100%',
                          width: `${Math.round((calP != null ? calP : rawP) * 100)}%`,
                          background: item.is_calibrated ? '#4f46e5' : '#f59e0b',
                          borderRadius: '9999px'
                        }} />
                      </div>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--admin-text-main)', minWidth: '45px' }}>
                        {calP != null ? `${(calP * 100).toFixed(1)}%` : `${(rawP * 100).toFixed(1)}%`}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.375rem', fontSize: '0.72rem', color: 'var(--admin-text-muted)' }}>
                      <span>Raw RF: {(rawP * 100).toFixed(1)}%</span>
                      {calP != null && <span>Calibrated Posterior: {(calP * 100).toFixed(1)}%</span>}
                    </div>
                  </div>

                  {/* 3 Expected Loss Cards */}
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    {/* L_accept */}
                    <div style={{
                      padding: '0.5rem 0.75rem',
                      background: 'white',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      minWidth: '100px',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>L_accept</div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>{lAccept.toFixed(2)}</div>
                      <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>C_lock = 10.0</div>
                    </div>

                    {/* L_reject */}
                    <div style={{
                      padding: '0.5rem 0.75rem',
                      background: 'white',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      minWidth: '100px',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>L_reject</div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>{lReject.toFixed(2)}</div>
                      <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>C_miss = 5.0</div>
                    </div>

                    {/* L_review */}
                    <div style={{
                      padding: '0.5rem 0.75rem',
                      background: '#fffbeb',
                      border: '1px solid #fde68a',
                      borderRadius: '6px',
                      minWidth: '100px',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '0.68rem', color: '#92400e', fontWeight: 600 }}>L_review</div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#92400e' }}>{lReview.toFixed(2)}</div>
                      <div style={{ fontSize: '0.65rem', color: '#b45309' }}>Human Gate</div>
                    </div>
                  </div>
                </div>

                {/* Action Controls */}
                <div style={{
                  padding: '1rem 1.25rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '1rem'
                }}>
                  <button
                    type="button"
                    onClick={() => handleOpenHistory(item)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.375rem',
                      background: 'none',
                      border: 'none',
                      color: 'var(--admin-primary)',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <History size={14} />
                    <span>View Audit Trail</span>
                  </button>

                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                      type="button"
                      onClick={() => handleOpenResolve(item, 'REJECT')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.375rem',
                        padding: '0.5rem 1rem',
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        borderRadius: 'var(--admin-radius-sm)',
                        color: '#dc2626',
                        fontSize: '0.825rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      <X size={15} />
                      <span>Reject Relationship</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenResolve(item, 'ACCEPT')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.375rem',
                        padding: '0.5rem 1rem',
                        background: '#059669',
                        border: 'none',
                        borderRadius: 'var(--admin-radius-sm)',
                        color: 'white',
                        fontSize: '0.825rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      <Check size={15} />
                      <span>Accept Relationship</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation & Reviewer Notes Modal */}
      {resolveModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            maxWidth: '520px',
            width: '100%',
            padding: '1.5rem',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
                Confirm Resolution: {resolveModal.action === 'ACCEPT' ? 'Accept Relationship' : 'Reject Relationship'}
              </h3>
              <button
                type="button"
                onClick={() => setResolveModal(null)}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: '#475569' }}>
              {resolveModal.action === 'ACCEPT'
                ? `You are confirming that Complaint A and Complaint B share a verified "${resolveModal.review.relationship_type}" relationship. This will link the records in the municipal database.`
                : `You are rejecting the proposed "${resolveModal.review.relationship_type}" relationship. These complaints will remain separate, unlinked entities.`}
            </p>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.375rem' }}>
                Reviewer Notes (Recorded to Append-Only Audit Trail)
              </label>
              <textarea
                rows={3}
                placeholder="Enter justification or field inspection notes..."
                value={reviewerNotes}
                onChange={(e) => setReviewerNotes(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.625rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  fontFamily: 'inherit',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              padding: '0.625rem 0.875rem',
              marginBottom: '1.25rem',
              fontSize: '0.75rem',
              color: '#64748b'
            }}>
              Signing as: <strong>{user?.name || user?.email}</strong> ({user?.role || 'officer'})
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setResolveModal(null)}
                disabled={submittingResolve}
                style={{
                  padding: '0.5rem 1rem',
                  background: 'white',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSubmitResolve}
                disabled={submittingResolve}
                style={{
                  padding: '0.5rem 1.25rem',
                  background: resolveModal.action === 'ACCEPT' ? '#059669' : '#dc2626',
                  border: 'none',
                  borderRadius: '6px',
                  color: 'white',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {submittingResolve ? 'Committing...' : `Confirm ${resolveModal.action}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audit History Modal */}
      {historyModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            maxWidth: '680px',
            width: '100%',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '1.25rem',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>
                  Decision Audit History & Event Log
                </h3>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Immutable record for Complaint #{historyModal.review.source_complaint_id.slice(0, 8)} & #{historyModal.review.target_complaint_id.slice(0, 8)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setHistoryModal(null)}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '1.25rem', overflowY: 'auto' }}>
              {historyModal.loading ? (
                <div style={{ textAlign: 'center', padding: '2rem 0', color: '#64748b' }}>
                  <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 0.5rem' }} />
                  <div>Loading audit trail...</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {/* Append-Only Events */}
                  <div>
                    <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase' }}>
                      Append-Only Event Ledger
                    </h4>
                    {historyModal.events.length === 0 ? (
                      <div style={{ fontSize: '0.8rem', color: '#64748b' }}>No audit events logged.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {historyModal.events.map((evt) => (
                          <div
                            key={evt.id}
                            style={{
                              padding: '0.75rem',
                              background: '#f8fafc',
                              border: '1px solid #e2e8f0',
                              borderRadius: '6px',
                              fontSize: '0.8rem'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                              <span style={{ fontWeight: 600, color: '#0f172a' }}>{evt.event_type}</span>
                              <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>{new Date(evt.created_at).toLocaleString()}</span>
                            </div>
                            <div style={{ color: '#475569', marginBottom: '0.25rem' }}>
                              Actor: <strong>{evt.actor_email || 'System'}</strong> ({evt.actor_role || 'automated'})
                            </div>
                            {evt.notes && (
                              <div style={{ color: '#1e293b', fontStyle: 'italic' }}>"{evt.notes}"</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Versioned Decision Records */}
                  <div>
                    <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase' }}>
                      Versioned Decision Snapshots
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {historyModal.history.map((dec) => (
                        <div
                          key={dec.id}
                          style={{
                            padding: '0.75rem',
                            background: dec.is_latest ? '#f0fdf4' : '#f8fafc',
                            border: `1px solid ${dec.is_latest ? '#bbf7d0' : '#e2e8f0'}`,
                            borderRadius: '6px',
                            fontSize: '0.8rem'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Action: <strong>{dec.selected_action}</strong> ({dec.review_status})</span>
                            {dec.is_latest && (
                              <span style={{ background: '#059669', color: 'white', padding: '0.1rem 0.35rem', borderRadius: '4px', fontSize: '0.65rem' }}>
                                LATEST
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.25rem' }}>
                            Model v{dec.model_version} • Cal v{dec.calibration_version || 'N/A'} • Policy v{dec.policy_version}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ padding: '0.875rem 1.25rem', borderTop: '1px solid #e2e8f0', textAlign: 'right' }}>
              <button
                type="button"
                onClick={() => setHistoryModal(null)}
                style={{
                  padding: '0.4rem 1rem',
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

