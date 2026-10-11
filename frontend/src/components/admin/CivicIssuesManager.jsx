// src/components/admin/CivicIssuesManager.jsx
import React, { useState, useEffect } from 'react';
import {
  Layers, GitBranch, ArrowRight, CheckCircle2, Clock, Lock, Play,
  Check, X, AlertTriangle, Plus, RefreshCw, Building, ShieldCheck
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';

export default function CivicIssuesManager({
  civicIssues = [],
  onRefreshList,
  loading = false
}) {
  const [selectedIssueId, setSelectedIssueId] = useState(null);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [routingData, setRoutingData] = useState(null);
  const [executionPlan, setExecutionPlan] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [routingInProgress, setRoutingInProgress] = useState(false);
  
  // Dependency linking dialog state
  const [showAddDepModal, setShowAddDepModal] = useState(false);
  const [targetTaskId, setTargetTaskId] = useState('');
  const [prereqTaskId, setPrereqTaskId] = useState('');
  const [savingDep, setSavingDep] = useState(false);

  // Load details whenever an issue is selected
  const loadIssueDetails = async (id) => {
    setSelectedIssueId(id);
    setLoadingDetails(true);
    try {
      const [issueRes, routingRes, planRes] = await Promise.all([
        api.get(`/civic-issues/${id}`).catch(() => null),
        api.get(`/civic-issues/${id}/routing`).catch(() => null),
        api.get(`/civic-issues/${id}/execution-plan`).catch(() => null)
      ]);

      if (issueRes?.data) setSelectedIssue(issueRes.data);
      if (routingRes?.data) setRoutingData(routingRes.data);
      if (planRes?.data) setExecutionPlan(planRes.data);
    } catch (err) {
      toast.error('Failed to load civic issue details');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleTriggerRouting = async (id) => {
    setRoutingInProgress(true);
    const toastId = toast.loading('Running deterministic multi-department routing & DAG generation...');
    try {
      await api.post(`/civic-issues/${id}/route`);
      toast.success('Routing completed! Workstreams & DAG tasks established.', { id: toastId });
      loadIssueDetails(id);
      if (onRefreshList) onRefreshList();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Routing execution failed', { id: toastId });
    } finally {
      setRoutingInProgress(false);
    }
  };

  const handleUpdateTaskStatus = async (taskId, newStatus) => {
    const toastId = toast.loading(`Transitioning task to ${newStatus}...`);
    try {
      await api.patch(`/tasks/${taskId}/status`, { status: newStatus });
      toast.success(`Task status updated to ${newStatus}`, { id: toastId });
      // Refresh execution plan and routing details
      if (selectedIssueId) {
        loadIssueDetails(selectedIssueId);
      }
    } catch (err) {
      const errCode = err.response?.data?.error;
      const errMsg = err.response?.data?.message || err.response?.data?.error || 'Failed to update task status';
      if (errCode === 'TASK_locked') {
        toast.error(`🔒 Cannot start task: prerequisite tasks must be COMPLETED first.`, { id: toastId });
      } else {
        toast.error(errMsg, { id: toastId });
      }
    }
  };

  const handleAddDependency = async (e) => {
    e.preventDefault();
    if (!targetTaskId || !prereqTaskId) {
      toast.error('Please select both a dependent task and its prerequisite.');
      return;
    }
    if (targetTaskId === prereqTaskId) {
      toast.error('A task cannot depend on itself.');
      return;
    }

    setSavingDep(true);
    const toastId = toast.loading('Verifying DAG & adding dependency constraint...');
    try {
      await api.post(`/civic-issues/${selectedIssueId}/dependencies`, {
        taskId: targetTaskId,
        dependsOnTaskId: prereqTaskId
      });

      toast.success('Dependency constraint added successfully!', { id: toastId });
      setShowAddDepModal(false);
      setTargetTaskId('');
      setPrereqTaskId('');
      loadIssueDetails(selectedIssueId);
    } catch (err) {
      const errCode = err.response?.data?.error;
      const errMsg = err.response?.data?.message || err.response?.data?.error || 'Failed to add dependency';
      if (errCode === 'DEPENDENCY_CYCLE') {
        toast.error(`⚠️ Cycle detected! Adding this prerequisite would create an infinite loop.`, { id: toastId });
      } else {
        toast.error(errMsg, { id: toastId });
      }
    } finally {
      setSavingDep(false);
    }
  };

  const allTasks = routingData?.tasks || [];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: selectedIssueId ? '340px 1fr' : '1fr', gap: '1.25rem' }}>
      {/* Civic Issues List Column */}
      <div className="admin-card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid var(--admin-border)', paddingBottom: '0.75rem' }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: 'var(--admin-text-main)' }}>
              Civic Issues ({civicIssues.length})
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)', margin: '0.2rem 0 0' }}>
              Connected components grouped via DFS
            </p>
          </div>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onRefreshList}
            disabled={loading}
            title="Refresh Civic Issues"
            style={{ padding: '0.35rem 0.6rem' }}
          >
            <RefreshCw size={13} className={loading ? 'spinner' : ''} />
          </button>
        </div>

        {civicIssues.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--admin-text-muted)', fontSize: '0.85rem' }}>
            No grouped Civic Issues formed yet. Civic Issues are formed automatically when related complaints are ingested.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '720px', overflowY: 'auto' }}>
            {civicIssues.map((issue) => {
              const isSelected = selectedIssueId === issue.id;
              return (
                <div
                  key={issue.id}
                  onClick={() => loadIssueDetails(issue.id)}
                  style={{
                    padding: '0.85rem 1rem',
                    borderRadius: 'var(--admin-radius-sm)',
                    border: `1px solid ${isSelected ? 'var(--admin-primary)' : 'var(--admin-border)'}`,
                    background: isSelected ? 'var(--admin-primary-light)' : '#ffffff',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 700, color: isSelected ? 'var(--admin-primary)' : 'var(--admin-text-main)' }}>
                      {issue.title || `Issue #${(issue.id || '').slice(-6)}`}
                    </span>
                    <span className="admin-badge admin-badge-medium" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                      {issue.status || 'OPEN'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>
                    <span>Attached Complaints: <strong>{issue.complaint_count || 0}</strong></span>
                    <span>{issue.created_at ? new Date(issue.created_at).toLocaleDateString() : ''}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Selected Civic Issue Details & DAG Workflow Execution */}
      {selectedIssueId && (
        <div className="admin-card" style={{ padding: '1.5rem' }}>
          {loadingDetails ? (
            <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--admin-text-muted)' }}>
              <div className="spinner" style={{ margin: '0 auto 0.75rem', width: 24, height: 24 }} />
              <span>Loading civic issue routing & execution plan...</span>
            </div>
          ) : (
            <>
              {/* Issue Details Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--admin-border)', paddingBottom: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                    <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0, color: 'var(--admin-text-main)' }}>
                      {selectedIssue?.title || `Civic Issue #${selectedIssueId.slice(-6)}`}
                    </h2>
                    <span className="admin-badge admin-badge-low">
                      {selectedIssue?.status || 'ACTIVE'}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--admin-text-muted)', margin: 0 }}>
                    {selectedIssue?.description || 'Grouped civic cluster synthesized from multiple related complaints.'}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {(!routingData || routingData.tasks?.length === 0) ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => handleTriggerRouting(selectedIssueId)}
                      disabled={routingInProgress}
                    >
                      <GitBranch size={14} />
                      <span>{routingInProgress ? 'Routing...' : 'Execute Routing & Tasks'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setShowAddDepModal(true)}
                    >
                      <Plus size={14} />
                      <span>Add Dependency Prerequisite</span>
                    </button>
                  )}

                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setSelectedIssueId(null)}
                    style={{ padding: '0.4rem 0.6rem' }}
                    title="Close Details"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* Routing & Workstream Analysis */}
              {routingData && (
                <div style={{ marginBottom: '1.5rem', background: '#f8fafc', padding: '1rem 1.25rem', borderRadius: 'var(--admin-radius-sm)', border: '1px solid var(--admin-border)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
                    {/* Classified Multi-Label Types */}
                    <div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--admin-text-muted)', display: 'block', marginBottom: '0.5rem' }}>
                        Multi-Label Issue Types
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                        {(routingData.issueTypes || []).map((t, idx) => (
                          <span key={idx} className="admin-badge admin-badge-medium" style={{ fontSize: '0.75rem' }}>
                            {t.label} ({(t.confidence * 100).toFixed(0)}%)
                          </span>
                        ))}
                        {(!routingData.issueTypes || routingData.issueTypes.length === 0) && (
                          <span style={{ fontSize: '0.8125rem', color: 'var(--admin-text-muted)' }}>None classified</span>
                        )}
                      </div>
                    </div>

                    {/* Assigned Departments */}
                    <div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--admin-text-muted)', display: 'block', marginBottom: '0.5rem' }}>
                        Responsible Municipal Departments
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                        {(routingData.departments || []).map((dept, idx) => (
                          <span key={idx} className="admin-badge admin-badge-low" style={{ fontSize: '0.75rem' }}>
                            🏛️ {typeof dept === 'string' ? dept : dept.department || 'Department'}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Kahn's DAG Execution Progress & Stages */}
              {executionPlan && (
                <div>
                  {/* Progress Bar */}
                  {executionPlan.progress && (
                    <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#ffffff', border: '1px solid var(--admin-border)', borderRadius: 'var(--admin-radius-sm)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                        <span>Kahn DAG Execution Progress</span>
                        <span style={{ color: 'var(--admin-success)' }}>
                          {executionPlan.progress.completionPercentage}% ({executionPlan.progress.completedTasks} of {executionPlan.progress.totalTasks} Tasks Completed)
                        </span>
                      </div>
                      <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${executionPlan.progress.completionPercentage}%`,
                            height: '100%',
                            background: 'var(--admin-success)',
                            transition: 'width 0.3s ease'
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* DAG Stages */}
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--admin-text-muted)', marginBottom: '1rem' }}>
                    Topologically Sorted Execution Stages
                  </h4>

                  {(!executionPlan.stages || executionPlan.stages.length === 0) ? (
                    <div style={{ padding: '2rem', textAlign: 'center', background: '#f8fafc', borderRadius: 'var(--admin-radius-sm)', border: '1px dashed var(--admin-border)', color: 'var(--admin-text-muted)', fontSize: '0.875rem' }}>
                      No tasks generated yet for this issue. Click "Execute Routing & Tasks" above to initialize the workflow.
                    </div>
                  ) : (
                    executionPlan.stages.map((stage) => (
                      <div key={stage.stage} className="admin-dag-stage">
                        <div className="admin-dag-stage-header">
                          <span>Stage {stage.stage} — Parallel Execution Group</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--admin-text-muted)' }}>
                            {stage.tasks.length} {stage.tasks.length === 1 ? 'Task' : 'Tasks'}
                          </span>
                        </div>

                        <div>
                          {stage.tasks.map((taskId) => {
                            const task = allTasks.find((t) => t.id === taskId);
                            const readiness = executionPlan.taskReadiness ? executionPlan.taskReadiness[taskId] : null;
                            if (!task) return null;

                            const isPending = task.status === 'PENDING';
                            const isInProgress = task.status === 'IN_PROGRESS';
                            const isCompleted = task.status === 'COMPLETED';
                            const isCancelled = task.status === 'CANCELLED';

                            return (
                              <div key={task.id} className="admin-dag-task-card">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                                  <div style={{ flex: 1, minWidth: '220px' }}>
                                    <h5 style={{ margin: '0 0 0.25rem', fontSize: '0.9rem', fontWeight: 700, color: 'var(--admin-text-main)' }}>
                                      {task.title}
                                    </h5>
                                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.8125rem', color: 'var(--admin-text-muted)', lineHeight: 1.4 }}>
                                      {task.description}
                                    </p>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                      <span className={`admin-badge admin-badge-${task.status.toLowerCase()}`}>
                                        {task.status}
                                      </span>

                                      {isPending && readiness && (
                                        readiness.ready ? (
                                          <span className="admin-badge admin-badge-low" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                                            ▶ Ready to Start
                                          </span>
                                        ) : (
                                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: '#dc2626', background: '#fef2f2', padding: '2px 8px', borderRadius: 4, border: '1px solid #fecaca' }}>
                                            <Lock size={12} />
                                            <span>
                                              Blocked by: {readiness.blockedBy?.map((bId) => allTasks.find((t) => t.id === bId)?.title || bId).join(', ')}
                                            </span>
                                          </div>
                                        )
                                      )}

                                      {isCompleted && (
                                        <span className="admin-badge admin-badge-low" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                                          ✓ Completed
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Task Status Action Buttons */}
                                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                    {isPending && readiness?.ready && (
                                      <button
                                        type="button"
                                        className="btn btn-primary btn-sm"
                                        onClick={() => handleUpdateTaskStatus(task.id, 'IN_PROGRESS')}
                                        style={{ padding: '0.35rem 0.75rem' }}
                                      >
                                        <Play size={12} />
                                        <span>Start Task</span>
                                      </button>
                                    )}

                                    {isInProgress && (
                                      <>
                                        <button
                                          type="button"
                                          className="btn btn-sm"
                                          onClick={() => handleUpdateTaskStatus(task.id, 'COMPLETED')}
                                          style={{ background: 'var(--admin-success)', color: '#ffffff', padding: '0.35rem 0.75rem' }}
                                        >
                                          <Check size={12} />
                                          <span>Complete</span>
                                        </button>

                                        <button
                                          type="button"
                                          className="btn btn-secondary btn-sm"
                                          onClick={() => handleUpdateTaskStatus(task.id, 'CANCELLED')}
                                          style={{ color: 'var(--admin-danger)', borderColor: '#fca5a5', padding: '0.35rem 0.6rem' }}
                                        >
                                          <X size={12} />
                                          <span>Cancel</span>
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Add Dependency Dialog */}
      {showAddDepModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            zIndex: 1300,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
          onClick={() => setShowAddDepModal(false)}
        >
          <div
            className="admin-card"
            style={{ width: '100%', maxWidth: 500, background: '#ffffff', position: 'relative' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowAddDepModal(false)}
              style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <X size={18} />
            </button>

            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: '0 0 0.5rem', color: 'var(--admin-text-main)' }}>
              Add Task Dependency Constraint
            </h3>
            <p style={{ fontSize: '0.8125rem', color: 'var(--admin-text-muted)', marginBottom: '1.25rem' }}>
              Enforces topological ordering in Kahn's algorithm. Prerequisite task must finish before dependent task can begin.
            </p>

            <form onSubmit={handleAddDependency}>
              <div style={{ marginBottom: '1rem' }}>
                <label className="form-label" style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Dependent Task (Will be blocked)
                </label>
                <select
                  className="form-select"
                  value={targetTaskId}
                  onChange={(e) => setTargetTaskId(e.target.value)}
                  required
                >
                  <option value="">Select target task...</option>
                  {allTasks.map((t) => (
                    <option key={t.id} value={t.id}>{t.title} ({t.status})</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label className="form-label" style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Prerequisite Task (Must be completed first)
                </label>
                <select
                  className="form-select"
                  value={prereqTaskId}
                  onChange={(e) => setPrereqTaskId(e.target.value)}
                  required
                >
                  <option value="">Select prerequisite task...</option>
                  {allTasks.filter((t) => t.id !== targetTaskId).map((t) => (
                    <option key={t.id} value={t.id}>{t.title} ({t.status})</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAddDepModal(false)}
                  disabled={savingDep}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingDep || !targetTaskId || !prereqTaskId}
                >
                  {savingDep ? 'Validating...' : 'Add Constraint'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
