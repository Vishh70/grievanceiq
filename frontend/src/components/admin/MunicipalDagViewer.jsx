// src/components/admin/MunicipalDagViewer.jsx
import React, { useState, useEffect } from 'react';
import {
  GitBranch, ShieldCheck, CheckCircle2, Clock, Lock, Play,
  Check, X, AlertTriangle, RefreshCw, Building, Sparkles,
  ArrowRight, ShieldAlert, Award, ChevronDown, ChevronUp,
  FileCheck, Info
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';

export default function MunicipalDagViewer({
  selectedIssue,
  executionPlan,
  allTasks = [],
  dependencies = [],
  onUpdateTaskStatus,
  onRefreshIssue
}) {
  const [recommendations, setRecommendations] = useState([]);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [generatingRecs, setGeneratingRecs] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [expandedRecId, setExpandedRecId] = useState(null);
  const [verifyingIssue, setVerifyingIssue] = useState(false);
  const [verificationNotes, setVerificationNotes] = useState('');
  const [showVerifyModal, setShowVerifyModal] = useState(false);

  const issueId = selectedIssue?.id;

  // Load pending recommendations for this issue
  const loadRecommendations = async () => {
    if (!issueId) return;
    setLoadingRecs(true);
    try {
      const res = await api.get(`/civic-issues/${issueId}/recommendations`);
      setRecommendations(res.data?.recommendations || []);
    } catch (err) {
      console.error('Failed to load prerequisite recommendations:', err);
    } finally {
      setLoadingRecs(false);
    }
  };

  useEffect(() => {
    loadRecommendations();
  }, [issueId]);

  // Generate new prerequisite recommendations using causal inference
  const handleGenerateRecommendations = async () => {
    if (!issueId) return;
    setGeneratingRecs(true);
    const toastId = toast.loading('Evaluating domain causal graph and template sequencing...');
    try {
      const res = await api.post(`/civic-issues/${issueId}/recommendations/generate`);
      const count = res.data?.count || 0;
      toast.success(
        count > 0
          ? `Inferred ${count} candidate prerequisite recommendation(s)!`
          : 'No new prerequisite candidates inferred based on active causal rules.',
        { id: toastId }
      );
      await loadRecommendations();
      if (onRefreshIssue) await onRefreshIssue();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to infer recommendations', { id: toastId });
    } finally {
      setGeneratingRecs(false);
    }
  };

  // Accept a prerequisite recommendation
  const handleAcceptRecommendation = async (recId) => {
    setActionInProgress(true);
    const toastId = toast.loading('Applying recommendation to execution DAG (atomic cycle check)...');
    try {
      await api.post(`/tasks/recommendations/${recId}/accept`, {
        notes: 'Approved by municipal inspector'
      });
      toast.success('Recommendation accepted! Prerequisite edge added to execution graph.', { id: toastId });
      await loadRecommendations();
      if (onRefreshIssue) await onRefreshIssue();
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Failed to accept recommendation';
      toast.error(msg, { id: toastId });
    } finally {
      setActionInProgress(false);
    }
  };

  // Reject a prerequisite recommendation
  const handleRejectRecommendation = async (recId) => {
    setActionInProgress(true);
    const toastId = toast.loading('Rejecting prerequisite recommendation...');
    try {
      await api.post(`/tasks/recommendations/${recId}/reject`, {
        notes: 'Rejected by municipal inspector'
      });
      toast.success('Recommendation rejected.', { id: toastId });
      await loadRecommendations();
    } catch (err) {
      toast.error('Failed to reject recommendation', { id: toastId });
    } finally {
      setActionInProgress(false);
    }
  };

  // Formally verify a completed task
  const handleVerifyTask = async (taskId) => {
    setActionInProgress(true);
    const toastId = toast.loading('Recording formal inspection verification...');
    try {
      await api.post(`/tasks/${taskId}/verify`, {
        notes: 'Physical on-site inspection verified and approved.'
      });
      toast.success('Task successfully verified!', { id: toastId });
      if (onRefreshIssue) await onRefreshIssue();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to verify task', { id: toastId });
    } finally {
      setActionInProgress(false);
    }
  };

  // Formally verify and resolve entire Civic Issue
  const handleConfirmVerifyIssue = async () => {
    setVerifyingIssue(true);
    const toastId = toast.loading('Verifying all multi-department workstreams and closing issue...');
    try {
      await api.post(`/civic-issues/${issueId}/verify-resolution`, {
        notes: verificationNotes || 'Comprehensive multi-department resolution verified.'
      });
      toast.success('Civic Issue resolution verified! Linked complaints marked Resolved.', { id: toastId });
      setShowVerifyModal(false);
      setVerificationNotes('');
      if (onRefreshIssue) await onRefreshIssue();
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Failed to verify resolution';
      toast.error(msg, { id: toastId });
    } finally {
      setVerifyingIssue(false);
    }
  };

  // Helper stats
  const totalTasks = allTasks.length;
  const completedTasks = allTasks.filter(t => t.status === 'COMPLETED').length;
  const verifiedTasks = allTasks.filter(t => t.status === 'VERIFIED').length;
  const finishedTasks = completedTasks + verifiedTasks;
  const inProgressTasks = allTasks.filter(t => t.status === 'IN_PROGRESS').length;
  const pendingTasks = allTasks.filter(t => t.status === 'PENDING').length;
  const allTasksFinished = totalTasks > 0 && finishedTasks === totalTasks;
  const isIssueVerified = selectedIssue?.status === 'VERIFIED';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* ── Staged Resolution & Verification Cockpit Header ─────────────────── */}
      <div
        style={{
          background: isIssueVerified ? '#ecfdf5' : '#ffffff',
          border: `1.5px solid ${isIssueVerified ? '#a7f3d0' : 'var(--admin-border)'}`,
          borderRadius: 'var(--admin-radius-md)',
          padding: '1.25rem',
          boxShadow: 'var(--admin-shadow-sm)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.85rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--admin-text-main)' }}>
                Staged Municipal Resolution Tracking
              </h3>
              {isIssueVerified ? (
                <span
                  style={{
                    background: '#059669',
                    color: '#ffffff',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    padding: '3px 9px',
                    borderRadius: 9999,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  <ShieldCheck size={13} />
                  VERIFIED RESOLUTION
                </span>
              ) : allTasksFinished ? (
                <span
                  style={{
                    background: '#dcfce7',
                    color: '#15803d',
                    border: '1px solid #86efac',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    padding: '3px 9px',
                    borderRadius: 9999,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  <CheckCircle2 size={13} />
                  READY FOR MUNICIPAL VERIFICATION
                </span>
              ) : (
                <span
                  style={{
                    background: '#eff6ff',
                    color: '#1d4ed8',
                    border: '1px solid #bfdbfe',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    padding: '3px 9px',
                    borderRadius: 9999
                  }}
                >
                  IN PROGRESS ({finishedTasks}/{totalTasks} TASKS)
                </span>
              )}
            </div>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--admin-text-muted)' }}>
              Deterministic lifecycle: Pending &rarr; Ready &rarr; In Progress &rarr; Completed &rarr; Verified inspection.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {!isIssueVerified && allTasksFinished && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setShowVerifyModal(true)}
                style={{
                  background: '#059669',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '0.8rem',
                  padding: '0.45rem 0.9rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: '0 2px 6px rgba(5, 150, 105, 0.3)'
                }}
              >
                <Award size={15} />
                <span>Verify & Close Civic Issue</span>
              </button>
            )}

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleGenerateRecommendations}
              disabled={generatingRecs}
              style={{ fontSize: '0.78rem', padding: '0.45rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              <Sparkles size={13} className={generatingRecs ? 'spinner' : ''} />
              <span>{generatingRecs ? 'Analyzing Knowledge Graph...' : 'Infer Prerequisites'}</span>
            </button>
          </div>
        </div>

        {/* Multi-Department Progress Bar */}
        <div style={{ background: '#e2e8f0', borderRadius: 9999, height: 8, overflow: 'hidden', display: 'flex', marginBottom: '0.75rem' }}>
          <div
            style={{
              width: `${totalTasks > 0 ? (verifiedTasks / totalTasks) * 100 : 0}%`,
              background: '#059669',
              transition: 'width 0.4s ease'
            }}
            title={`Verified: ${verifiedTasks}`}
          />
          <div
            style={{
              width: `${totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0}%`,
              background: '#34d399',
              transition: 'width 0.4s ease'
            }}
            title={`Completed (Pending Verification): ${completedTasks}`}
          />
          <div
            style={{
              width: `${totalTasks > 0 ? (inProgressTasks / totalTasks) * 100 : 0}%`,
              background: '#3b82f6',
              transition: 'width 0.4s ease'
            }}
            title={`In Progress: ${inProgressTasks}`}
          />
        </div>

        {/* Progress Breakdown Indicators */}
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 9999, background: '#059669' }} />
            <strong>{verifiedTasks}</strong> Verified
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 9999, background: '#34d399' }} />
            <strong>{completedTasks}</strong> Completed
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 9999, background: '#3b82f6' }} />
            <strong>{inProgressTasks}</strong> In Progress
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 9999, background: '#94a3b8' }} />
            <strong>{pendingTasks}</strong> Pending
          </span>
        </div>
      </div>

      {/* ── Prerequisite Recommendations Approval Card ──────────────────────── */}
      <div
        style={{
          background: '#ffffff',
          border: '1.5px solid var(--admin-border)',
          borderRadius: 'var(--admin-radius-md)',
          padding: '1.15rem',
          boxShadow: 'var(--admin-shadow-sm)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <GitBranch size={16} style={{ color: 'var(--admin-primary)' }} />
            <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: 'var(--admin-text-main)' }}>
              Prerequisite DAG Recommendations
            </h4>
            <span
              style={{
                background: recommendations.length > 0 ? '#eff6ff' : '#f1f5f9',
                color: recommendations.length > 0 ? '#1d4ed8' : '#64748b',
                padding: '1px 7px',
                borderRadius: 9999,
                fontSize: '0.7rem',
                fontWeight: 800
              }}
            >
              {recommendations.length} Pending
            </span>
          </div>

          <span style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)' }}>
            Knowledge Graph Causal Rules (v1.0)
          </span>
        </div>

        <p style={{ margin: '0 0 0.85rem', fontSize: '0.78rem', color: 'var(--admin-text-muted)' }}>
          Candidate dependencies inferred from domain causal relationships (e.g. pipeline repair before road resurfacing).
          <strong> Unapproved recommendations do not affect task execution until formally accepted by an authorized officer.</strong>
        </p>

        {loadingRecs ? (
          <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--admin-text-muted)' }}>
            <RefreshCw size={14} className="spinner" style={{ margin: '0 auto 0.4rem' }} />
            Loading recommendations...
          </div>
        ) : recommendations.length === 0 ? (
          <div
            style={{
              padding: '1.25rem',
              textAlign: 'center',
              background: '#f8fafc',
              borderRadius: 'var(--admin-radius-sm)',
              border: '1px dashed var(--admin-border)',
              fontSize: '0.8rem',
              color: 'var(--admin-text-muted)'
            }}
          >
            No pending prerequisite recommendations for this issue. Click "Infer Prerequisites" above to evaluate candidate cross-department causal links.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {recommendations.map((rec) => {
              const isExpanded = expandedRecId === rec.recommendation_id;
              const confidencePct = Math.round((Number(rec.confidence) || 0) * 100);

              return (
                <div
                  key={rec.recommendation_id}
                  style={{
                    border: '1px solid #cbd5e1',
                    borderRadius: 'var(--admin-radius-sm)',
                    padding: '0.85rem',
                    background: '#fdfdfe',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {/* Dependent Task -> Prerequisite Task */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          background: '#f1f5f9',
                          border: '1px solid #cbd5e1',
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          color: '#334155'
                        }}
                      >
                        {rec.prerequisite_department || 'Upstream'}
                      </span>
                      <strong style={{ fontSize: '0.82rem', color: 'var(--admin-text-main)' }}>
                        {rec.prerequisite_title}
                      </strong>

                      <ArrowRight size={14} style={{ color: 'var(--admin-primary)' }} />

                      <span
                        style={{
                          background: '#f1f5f9',
                          border: '1px solid #cbd5e1',
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          color: '#334155'
                        }}
                      >
                        {rec.task_department || 'Downstream'}
                      </span>
                      <strong style={{ fontSize: '0.82rem', color: 'var(--admin-text-main)' }}>
                        {rec.task_title}
                      </strong>
                    </div>

                    {/* Confidence & Badges */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span
                        style={{
                          background: confidencePct >= 90 ? '#ecfdf5' : '#eff6ff',
                          color: confidencePct >= 90 ? '#059669' : '#2563eb',
                          border: `1px solid ${confidencePct >= 90 ? '#a7f3d0' : '#bfdbfe'}`,
                          padding: '2px 7px',
                          borderRadius: 9999,
                          fontSize: '0.7rem',
                          fontWeight: 800
                        }}
                      >
                        {confidencePct}% Confidence
                      </span>
                      {rec.is_cross_issue && (
                        <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 6px', borderRadius: 4, fontSize: '0.68rem', fontWeight: 800 }}>
                          CROSS ISSUE
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Explainable Causal Reason */}
                  <div style={{ fontSize: '0.78rem', color: '#475569', lineHeight: 1.4 }}>
                    {rec.reason}
                  </div>

                  {/* Evidence Toggle & Action Buttons */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.35rem', borderTop: '1px solid #f1f5f9' }}>
                    <button
                      type="button"
                      onClick={() => setExpandedRecId(isExpanded ? null : rec.recommendation_id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--admin-primary)',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        padding: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3
                      }}
                    >
                      {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      <span>{isExpanded ? 'Hide Causal Evidence' : 'View Causal Evidence'}</span>
                    </button>

                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={actionInProgress}
                        onClick={() => handleAcceptRecommendation(rec.recommendation_id)}
                        style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem' }}
                      >
                        <Check size={12} />
                        <span>Accept & Enforce Edge</span>
                      </button>

                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={actionInProgress}
                        onClick={() => handleRejectRecommendation(rec.recommendation_id)}
                        style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem', color: 'var(--admin-danger)' }}
                      >
                        <X size={12} />
                        <span>Reject</span>
                      </button>
                    </div>
                  </div>

                  {/* Expanded Evidence Box */}
                  {isExpanded && rec.evidence && (
                    <div
                      style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: 4,
                        padding: '0.55rem',
                        fontSize: '0.7rem',
                        fontFamily: 'monospace',
                        color: '#334155',
                        overflowX: 'auto'
                      }}
                    >
                      <pre style={{ margin: 0 }}>{JSON.stringify(rec.evidence, null, 2)}</pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Modal for Formal Issue Verification ──────────────────────────────── */}
      {showVerifyModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem'
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 'var(--admin-radius-md)',
              maxWidth: 480,
              width: '100%',
              padding: '1.5rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
              <Award size={22} style={{ color: '#059669' }} />
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>
                Verify Civic Issue Resolution
              </h3>
            </div>

            <p style={{ fontSize: '0.82rem', color: 'var(--admin-text-muted)', marginBottom: '1rem', lineHeight: 1.45 }}>
              All {totalTasks} multi-department tasks across all workstreams have been completed.
              Submitting formal verification will mark the Civic Issue as <strong>VERIFIED</strong>, transition all completed tasks to <strong>VERIFIED</strong>, and mark linked citizen complaints as <strong>Resolved</strong>.
            </p>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, marginBottom: '0.35rem', color: 'var(--admin-text-main)' }}>
                Inspector Verification Notes / Reference:
              </label>
              <textarea
                rows={3}
                value={verificationNotes}
                onChange={(e) => setVerificationNotes(e.target.value)}
                placeholder="e.g. Field inspection completed. Pipeline leakage repaired and asphalt surface fully restored."
                style={{
                  width: '100%',
                  padding: '0.55rem',
                  fontSize: '0.8rem',
                  border: '1px solid var(--admin-border)',
                  borderRadius: 4
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowVerifyModal(false)}
                disabled={verifyingIssue}
              >
                Cancel
              </button>

              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleConfirmVerifyIssue}
                disabled={verifyingIssue}
                style={{ background: '#059669', borderColor: '#059669' }}
              >
                {verifyingIssue ? 'Verifying...' : 'Confirm Resolution'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

