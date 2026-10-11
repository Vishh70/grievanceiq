// src/components/admin/CivicIssuesManager.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Layers, GitBranch, ArrowRight, CheckCircle2, Clock, Lock, Play,
  Check, X, AlertTriangle, Plus, RefreshCw, Building, ShieldCheck,
  Search, Filter, Sparkles, Workflow, Network, Activity, FileText,
  CheckCircle, ChevronRight, Copy, ExternalLink, Eye, ListFilter,
  Zap, CheckCheck
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
  const [dependencies, setDependencies] = useState([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [routingInProgress, setRoutingInProgress] = useState(false);
  const [batchActionInProgress, setBatchActionInProgress] = useState(false);
  
  // Navigation & Filtering State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [activeTab, setActiveTab] = useState('dag'); // 'dag' | 'network' | 'complaints' | 'routing'
  
  // Dependency linking dialog state
  const [showAddDepModal, setShowAddDepModal] = useState(false);
  const [targetTaskId, setTargetTaskId] = useState('');
  const [prereqTaskId, setPrereqTaskId] = useState('');
  const [savingDep, setSavingDep] = useState(false);

  // Auto-select first issue on initial load or list refresh
  useEffect(() => {
    if (civicIssues && civicIssues.length > 0) {
      if (!selectedIssueId || !civicIssues.some(i => i.id === selectedIssueId)) {
        loadIssueDetails(civicIssues[0].id);
      }
    }
  }, [civicIssues]);

  // Keyboard shortcut to close modal
  useEffect(() => {
    if (!showAddDepModal) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setShowAddDepModal(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showAddDepModal]);

  // Load complete details for a selected civic issue
  const loadIssueDetails = async (id) => {
    setSelectedIssueId(id);
    setLoadingDetails(true);
    try {
      const [issueRes, routingRes, planRes, depsRes] = await Promise.all([
        api.get(`/civic-issues/${id}`).catch(() => null),
        api.get(`/civic-issues/${id}/routing`).catch(() => null),
        api.get(`/civic-issues/${id}/execution-plan`).catch(() => null),
        api.get(`/civic-issues/${id}/dependencies`).catch(() => null)
      ]);

      if (issueRes?.data) setSelectedIssue(issueRes.data);
      if (routingRes?.data) setRoutingData(routingRes.data);
      if (planRes?.data) setExecutionPlan(planRes.data);
      if (depsRes?.data) setDependencies(depsRes.data || []);
    } catch (err) {
      toast.error('Failed to load civic issue details');
    } finally {
      setLoadingDetails(false);
    }
  };

  // Re-run routing & DAG generation
  const handleTriggerRouting = async (id) => {
    setRoutingInProgress(true);
    const toastId = toast.loading('Running deterministic multi-department routing & DAG generation...');
    try {
      await api.post(`/civic-issues/${id}/route`);
      toast.success('Routing completed! Workstreams & DAG tasks established.', { id: toastId });
      await loadIssueDetails(id);
      if (onRefreshList) onRefreshList();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Routing execution failed', { id: toastId });
    } finally {
      setRoutingInProgress(false);
    }
  };

  // 1-Click Batch Route All Issues
  const handleBatchRouteAll = async () => {
    setBatchActionInProgress(true);
    const toastId = toast.loading('Initiating batch DAG workflow generation across all civic issues...');
    try {
      let routedCount = 0;
      for (const issue of civicIssues) {
        try {
          await api.post(`/civic-issues/${issue.id}/route`);
          routedCount++;
        } catch (e) {
          console.warn(`Issue ${issue.id} route skip:`, e.message);
        }
      }
      toast.success(`Batch DAG generation complete! ${routedCount} civic clusters routed.`, { id: toastId });
      if (selectedIssueId) await loadIssueDetails(selectedIssueId);
      if (onRefreshList) onRefreshList();
    } catch (err) {
      toast.error('Batch routing encountered an issue: ' + (err.message || ''), { id: toastId });
    } finally {
      setBatchActionInProgress(false);
    }
  };

  // Update a single task's status
  const handleUpdateTaskStatus = async (taskId, newStatus) => {
    const toastId = toast.loading(`Transitioning task to ${newStatus}...`);
    try {
      await api.patch(`/tasks/${taskId}/status`, { status: newStatus });
      toast.success(`Task status updated to ${newStatus}`, { id: toastId });
      if (selectedIssueId) {
        await loadIssueDetails(selectedIssueId);
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

  // Batch execute all ready tasks
  const handleExecuteAllReady = async () => {
    if (!executionPlan || !allTasks.length) return;
    const readyTasks = allTasks.filter(t => {
      if (t.status !== 'PENDING') return false;
      const r = executionPlan.taskReadiness?.[t.id];
      return r?.ready;
    });

    if (readyTasks.length === 0) {
      toast.info('No pending tasks are currently unlocked and ready to start.');
      return;
    }

    setBatchActionInProgress(true);
    const toastId = toast.loading(`Starting ${readyTasks.length} unblocked tasks in parallel...`);
    try {
      for (const t of readyTasks) {
        await api.patch(`/tasks/${t.id}/status`, { status: 'IN_PROGRESS' });
      }
      toast.success(`Successfully transitioned ${readyTasks.length} tasks to IN_PROGRESS!`, { id: toastId });
      await loadIssueDetails(selectedIssueId);
    } catch (err) {
      toast.error('Error starting tasks: ' + (err.response?.data?.message || err.message), { id: toastId });
    } finally {
      setBatchActionInProgress(false);
    }
  };

  // Batch complete all in-progress tasks
  const handleCompleteAllInProgress = async () => {
    if (!allTasks.length) return;
    const inProgressTasks = allTasks.filter(t => t.status === 'IN_PROGRESS');

    if (inProgressTasks.length === 0) {
      toast.info('No tasks are currently IN_PROGRESS to complete.');
      return;
    }

    setBatchActionInProgress(true);
    const toastId = toast.loading(`Completing ${inProgressTasks.length} active tasks...`);
    try {
      for (const t of inProgressTasks) {
        await api.patch(`/tasks/${t.id}/status`, { status: 'COMPLETED' });
      }
      toast.success(`Successfully completed ${inProgressTasks.length} tasks! Downstream stages unlocked.`, { id: toastId });
      await loadIssueDetails(selectedIssueId);
    } catch (err) {
      toast.error('Error completing tasks: ' + (err.response?.data?.message || err.message), { id: toastId });
    } finally {
      setBatchActionInProgress(false);
    }
  };

  // Add dependency constraint
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
    const toastId = toast.loading('Verifying Kahn DAG & adding topological constraint...');
    try {
      await api.post(`/civic-issues/${selectedIssueId}/dependencies`, {
        taskId: targetTaskId,
        dependsOnTaskId: prereqTaskId
      });

      toast.success('Dependency constraint added successfully! DAG updated.', { id: toastId });
      setShowAddDepModal(false);
      setTargetTaskId('');
      setPrereqTaskId('');
      await loadIssueDetails(selectedIssueId);
    } catch (err) {
      const errCode = err.response?.data?.error;
      const errMsg = err.response?.data?.message || err.response?.data?.error || 'Failed to add dependency';
      if (errCode === 'DEPENDENCY_CYCLE') {
        toast.error(`⚠️ Cycle detected! Adding this prerequisite would create an infinite dependency cycle.`, { id: toastId });
      } else {
        toast.error(errMsg, { id: toastId });
      }
    } finally {
      setSavingDep(false);
    }
  };

  const handleCopyId = (id) => {
    navigator.clipboard.writeText(id);
    toast.success('Issue ID copied to clipboard');
  };

  // Tasks list
  const allTasks = useMemo(() => routingData?.tasks || [], [routingData]);

  // Filtered Civic Issues
  const filteredIssues = useMemo(() => {
    return civicIssues.filter((issue) => {
      const matchesSearch =
        !searchQuery ||
        (issue.title && issue.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (issue.id && issue.id.toLowerCase().includes(searchQuery.toLowerCase()));

      const status = (issue.status || 'OPEN').toUpperCase();
      let matchesStatus = true;
      if (statusFilter === 'OPEN') matchesStatus = status === 'OPEN';
      else if (statusFilter === 'IN_PROGRESS') matchesStatus = status === 'IN_PROGRESS';
      else if (statusFilter === 'COMPLETED') matchesStatus = status === 'COMPLETED' || status === 'RESOLVED';

      return matchesSearch && matchesStatus;
    });
  }, [civicIssues, searchQuery, statusFilter]);

  // Compute Task Dependency lookups
  const { taskPrereqsMap, taskDownstreamMap } = useMemo(() => {
    const prereqs = {};
    const downstream = {};
    allTasks.forEach((t) => {
      prereqs[t.id] = [];
      downstream[t.id] = [];
    });

    dependencies.forEach((dep) => {
      const targetId = dep.task_id;
      const prereqId = dep.depends_on_task_id;
      const prereqTask = allTasks.find((t) => t.id === prereqId);
      const targetTask = allTasks.find((t) => t.id === targetId);

      if (prereqTask && prereqs[targetId]) {
        prereqs[targetId].push(prereqTask);
      }
      if (targetTask && downstream[prereqId]) {
        downstream[prereqId].push(targetTask);
      }
    });

    return { taskPrereqsMap: prereqs, taskDownstreamMap: downstream };
  }, [allTasks, dependencies]);

  // SVG Topology Layout Coordinates Computation
  const graphLayout = useMemo(() => {
    if (!executionPlan?.stages || executionPlan.stages.length === 0) return null;
    const stages = executionPlan.stages;
    const nodeCoords = {};
    const stageWidth = 260;
    const nodeHeight = 90;
    const startX = 60;
    const startY = 80;

    stages.forEach((stage, sIdx) => {
      const x = startX + sIdx * stageWidth;
      stage.tasks.forEach((taskId, tIdx) => {
        const y = startY + tIdx * (nodeHeight + 35);
        nodeCoords[taskId] = { x, y, stage: stage.stage };
      });
    });

    const edges = [];
    dependencies.forEach((dep) => {
      const fromCoord = nodeCoords[dep.depends_on_task_id];
      const toCoord = nodeCoords[dep.task_id];
      if (fromCoord && toCoord) {
        edges.push({
          fromId: dep.depends_on_task_id,
          toId: dep.task_id,
          from: fromCoord,
          to: toCoord
        });
      }
    });

    const totalWidth = Math.max(750, startX + stages.length * stageWidth + 60);
    const maxTasksInStage = Math.max(...stages.map(s => s.tasks.length), 1);
    const totalHeight = Math.max(340, startY + maxTasksInStage * (nodeHeight + 35) + 60);

    return { stages, nodeCoords, edges, totalWidth, totalHeight };
  }, [executionPlan, dependencies]);

  // Status badge styling helper
  const getStatusBadge = (status) => {
    const s = (status || 'OPEN').toUpperCase();
    if (s === 'COMPLETED' || s === 'RESOLVED') return { bg: '#ecfdf5', color: '#059669', border: '#a7f3d0' };
    if (s === 'IN_PROGRESS') return { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' };
    if (s === 'CANCELLED') return { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' };
    return { bg: '#fefce8', color: '#ca8a04', border: '#fef08a' };
  };

  // Department icon helper
  const getDeptIcon = (deptName = '') => {
    const d = deptName.toLowerCase();
    if (d.includes('road')) return '🚧';
    if (d.includes('water')) return '💧';
    if (d.includes('elect')) return '⚡';
    if (d.includes('drain')) return '🚰';
    if (d.includes('sanitat') || d.includes('waste')) return '🧹';
    if (d.includes('traffic')) return '🚦';
    return '🏛️';
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: selectedIssueId ? '380px 1fr' : '1fr', gap: '1.25rem', alignItems: 'start' }}>
      {/* ── Left Column: Civic Issues Explorer ─────────────────────── */}
      <div className="admin-card" style={{ padding: '1.25rem', background: '#ffffff', borderRadius: 'var(--admin-radius-md)', border: '1px solid var(--admin-border)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid var(--admin-border)', paddingBottom: '0.85rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <Layers size={18} style={{ color: 'var(--admin-primary)' }} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: 'var(--admin-text-main)' }}>
                Civic Issues ({civicIssues.length})
              </h3>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)', margin: '0.2rem 0 0' }}>
              Graph-clustered civic grievance components
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleBatchRouteAll}
              disabled={batchActionInProgress || loading}
              title="Auto-Route All Civic Issues"
              style={{ padding: '0.35rem 0.55rem', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '3px' }}
            >
              <Sparkles size={12} className={batchActionInProgress ? 'spinner' : ''} />
              <span>Route All</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onRefreshList}
              disabled={loading}
              title="Refresh List"
              style={{ padding: '0.35rem 0.55rem' }}
            >
              <RefreshCw size={13} className={loading ? 'spinner' : ''} />
            </button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div style={{ marginBottom: '0.85rem' }}>
          <div style={{ position: 'relative', marginBottom: '0.6rem' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--admin-text-muted)' }} />
            <input
              type="text"
              placeholder="Search title, ID, or department..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.45rem 0.75rem 0.45rem 2rem',
                fontSize: '0.8125rem',
                border: '1px solid var(--admin-border)',
                borderRadius: 'var(--admin-radius-sm)',
                background: '#f8fafc',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--admin-text-muted)' }}
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Status Filter Pills */}
          <div style={{ display: 'flex', gap: '0.3rem', overflowX: 'auto', paddingBottom: '2px' }}>
            {['ALL', 'OPEN', 'IN_PROGRESS', 'COMPLETED'].map((st) => {
              const active = statusFilter === st;
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '0.2rem 0.55rem',
                    borderRadius: 9999,
                    border: '1px solid',
                    borderColor: active ? 'var(--admin-primary)' : 'var(--admin-border)',
                    background: active ? 'var(--admin-primary)' : '#ffffff',
                    color: active ? '#ffffff' : 'var(--admin-text-muted)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {st === 'IN_PROGRESS' ? 'IN PROGRESS' : st}
                </button>
              );
            })}
          </div>
        </div>

        {/* Civic Issues List */}
        {filteredIssues.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--admin-text-muted)', fontSize: '0.85rem' }}>
            <Layers size={28} style={{ opacity: 0.3, margin: '0 auto 0.5rem' }} />
            <p style={{ margin: 0 }}>No matching civic issues found.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '740px', overflowY: 'auto', paddingRight: '2px' }}>
            {filteredIssues.map((issue) => {
              const isSelected = selectedIssueId === issue.id;
              const badgeStyle = getStatusBadge(issue.status);
              const deptIcon = getDeptIcon(issue.title || '');

              return (
                <div
                  key={issue.id}
                  onClick={() => loadIssueDetails(issue.id)}
                  style={{
                    padding: '0.85rem 0.95rem',
                    borderRadius: 'var(--admin-radius-sm)',
                    border: `1.5px solid ${isSelected ? 'var(--admin-primary)' : 'var(--admin-border)'}`,
                    background: isSelected ? 'var(--admin-primary-light)' : '#ffffff',
                    boxShadow: isSelected ? '0 2px 8px rgba(79, 70, 229, 0.12)' : 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    position: 'relative'
                  }}
                >
                  {/* Category & Status Row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontSize: '1rem' }}>{deptIcon}</span>
                      <span style={{ fontSize: '0.875rem', fontWeight: 800, color: isSelected ? 'var(--admin-primary)' : 'var(--admin-text-main)' }}>
                        {issue.title || `Issue #${(issue.id || '').slice(-6)}`}
                      </span>
                    </div>

                    <span
                      style={{
                        fontSize: '0.66rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: badgeStyle.bg,
                        color: badgeStyle.color,
                        border: `1px solid ${badgeStyle.border}`
                      }}
                    >
                      {issue.status || 'OPEN'}
                    </span>
                  </div>

                  {/* Metadata Row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.73rem', color: 'var(--admin-text-muted)', marginTop: '0.25rem' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      <FileText size={11} />
                      <strong>{issue.complaint_count || 0}</strong> complaints
                    </span>

                    <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: 'var(--admin-text-subtle)' }}>
                      #{issue.id ? issue.id.slice(0, 8) : ''}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Right Column: Selected Civic Issue Details & Interactive DAG ──── */}
      {selectedIssueId && (
        <div className="admin-card" style={{ padding: '1.5rem', background: '#ffffff', borderRadius: 'var(--admin-radius-md)', border: '1px solid var(--admin-border)' }}>
          {loadingDetails ? (
            <div style={{ textAlign: 'center', padding: '6rem 1rem', color: 'var(--admin-text-muted)' }}>
              <div className="spinner" style={{ margin: '0 auto 0.75rem', width: 28, height: 28 }} />
              <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Loading topological DAG and workstreams...</span>
            </div>
          ) : (
            <>
              {/* Header Ribbon */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--admin-border)', paddingBottom: '1.25rem', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '1.4rem' }}>{getDeptIcon(selectedIssue?.title)}</span>
                    <h2 style={{ fontSize: '1.35rem', fontWeight: 900, margin: 0, color: 'var(--admin-text-main)' }}>
                      {selectedIssue?.title || `Civic Cluster #${selectedIssueId.slice(0, 8)}`}
                    </h2>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        padding: '2px 8px',
                        borderRadius: 4,
                        ...getStatusBadge(selectedIssue?.status)
                      }}
                    >
                      {selectedIssue?.status || 'ACTIVE'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyId(selectedIssueId)}
                      title="Copy UUID"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--admin-text-subtle)', padding: 2, display: 'inline-flex' }}
                    >
                      <Copy size={13} />
                    </button>
                  </div>

                  <p style={{ fontSize: '0.85rem', color: 'var(--admin-text-muted)', margin: 0, maxWidth: 680, lineHeight: 1.45 }}>
                    {selectedIssue?.description || 'Connected civic grievance cluster synthesized from multiple citizen reports via graph-connected DFS components.'}
                  </p>
                </div>

                {/* Header Action Buttons */}
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  {(!routingData || allTasks.length === 0) ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => handleTriggerRouting(selectedIssueId)}
                      disabled={routingInProgress}
                    >
                      <Sparkles size={14} className={routingInProgress ? 'spinner' : ''} />
                      <span>{routingInProgress ? 'Generating DAG...' : 'Execute Routing & Tasks'}</span>
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={handleExecuteAllReady}
                        disabled={batchActionInProgress}
                        title="Start all unblocked tasks"
                        style={{ background: 'var(--admin-primary)', padding: '0.4rem 0.75rem' }}
                      >
                        <Play size={13} />
                        <span>Launch Ready Tasks</span>
                      </button>

                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setShowAddDepModal(true)}
                        style={{ padding: '0.4rem 0.75rem' }}
                      >
                        <Plus size={13} />
                        <span>Add Dependency</span>
                      </button>

                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleTriggerRouting(selectedIssueId)}
                        disabled={routingInProgress}
                        title="Regenerate DAG"
                        style={{ padding: '0.4rem 0.6rem' }}
                      >
                        <RefreshCw size={13} className={routingInProgress ? 'spinner' : ''} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* ── Executive DAG Metrics Ribbon ─────────────────────────── */}
              {executionPlan && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem', marginBottom: '1.25rem' }}>
                  {/* Metric 1: Kahn DAG Completion */}
                  <div style={{ padding: '0.85rem 1rem', background: '#f8fafc', border: '1px solid var(--admin-border)', borderRadius: 'var(--admin-radius-sm)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--admin-text-muted)', textTransform: 'uppercase' }}>
                        DAG Execution Progress
                      </span>
                      <Activity size={13} style={{ color: 'var(--admin-success)' }} />
                    </div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--admin-success)', marginBottom: '0.35rem' }}>
                      {executionPlan.progress ? `${executionPlan.progress.completionPercentage}%` : '0%'}
                    </div>
                    <div style={{ height: 6, background: '#e2e8f0', borderRadius: 9999, overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${executionPlan.progress ? executionPlan.progress.completionPercentage : 0}%`,
                          height: '100%',
                          background: 'linear-gradient(90deg, #10b981, #059669)',
                          transition: 'width 0.3s ease'
                        }}
                      />
                    </div>
                  </div>

                  {/* Metric 2: Topological Stages Depth */}
                  <div style={{ padding: '0.85rem 1rem', background: '#f8fafc', border: '1px solid var(--admin-border)', borderRadius: 'var(--admin-radius-sm)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--admin-text-muted)', textTransform: 'uppercase' }}>
                        Topological Depth
                      </span>
                      <GitBranch size={13} style={{ color: 'var(--admin-primary)' }} />
                    </div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--admin-primary)' }}>
                      {executionPlan.stages ? executionPlan.stages.length : 0} <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--admin-text-muted)' }}>Parallel Stages</span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)', marginTop: '0.35rem' }}>
                      Kahn topological order verified
                    </div>
                  </div>

                  {/* Metric 3: Total Tasks Breakdown */}
                  <div style={{ padding: '0.85rem 1rem', background: '#f8fafc', border: '1px solid var(--admin-border)', borderRadius: 'var(--admin-radius-sm)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--admin-text-muted)', textTransform: 'uppercase' }}>
                        Total DAG Tasks
                      </span>
                      <Workflow size={13} style={{ color: 'var(--admin-info)' }} />
                    </div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--admin-text-main)' }}>
                      {executionPlan.totalTasks || allTasks.length} <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--admin-text-muted)' }}>Tasks</span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)', marginTop: '0.35rem' }}>
                      {executionPlan.progress?.completedTasks || 0} completed · {(executionPlan.totalTasks || allTasks.length) - (executionPlan.progress?.completedTasks || 0)} remaining
                    </div>
                  </div>

                  {/* Metric 4: Graph Integrity */}
                  <div style={{ padding: '0.85rem 1rem', background: '#f8fafc', border: '1px solid var(--admin-border)', borderRadius: 'var(--admin-radius-sm)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--admin-text-muted)', textTransform: 'uppercase' }}>
                        Graph Integrity
                      </span>
                      <ShieldCheck size={13} style={{ color: '#059669' }} />
                    </div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#059669', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      ✓ Cycle-Free DAG
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)', marginTop: '0.35rem' }}>
                      Deterministic tie-breaking active
                    </div>
                  </div>
                </div>
              )}

              {/* ── Sub-Navigation Tabs ─────────────────────────────────── */}
              <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--admin-border)', marginBottom: '1.25rem', overflowX: 'auto' }}>
                <button
                  type="button"
                  onClick={() => setActiveTab('dag')}
                  style={{
                    padding: '0.55rem 0.95rem',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    border: 'none',
                    borderBottom: `2.5px solid ${activeTab === 'dag' ? 'var(--admin-primary)' : 'transparent'}`,
                    background: 'none',
                    color: activeTab === 'dag' ? 'var(--admin-primary)' : 'var(--admin-text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <Workflow size={14} />
                  <span>Pipeline Stages ({executionPlan?.stages?.length || 0})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('network')}
                  style={{
                    padding: '0.55rem 0.95rem',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    border: 'none',
                    borderBottom: `2.5px solid ${activeTab === 'network' ? 'var(--admin-primary)' : 'transparent'}`,
                    background: 'none',
                    color: activeTab === 'network' ? 'var(--admin-primary)' : 'var(--admin-text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <Network size={14} />
                  <span>DAG Topology Graph</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('complaints')}
                  style={{
                    padding: '0.55rem 0.95rem',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    border: 'none',
                    borderBottom: `2.5px solid ${activeTab === 'complaints' ? 'var(--admin-primary)' : 'transparent'}`,
                    background: 'none',
                    color: activeTab === 'complaints' ? 'var(--admin-primary)' : 'var(--admin-text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <FileText size={14} />
                  <span>Attached Grievances ({selectedIssue?.complaints?.length || selectedIssue?.complaint_count || 0})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('routing')}
                  style={{
                    padding: '0.55rem 0.95rem',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    border: 'none',
                    borderBottom: `2.5px solid ${activeTab === 'routing' ? 'var(--admin-primary)' : 'transparent'}`,
                    background: 'none',
                    color: activeTab === 'routing' ? 'var(--admin-primary)' : 'var(--admin-text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <Building size={14} />
                  <span>Agencies & AI Routing</span>
                </button>
              </div>

              {/* ── TAB 1: Topologically Sorted Pipeline Stages ───────── */}
              {activeTab === 'dag' && (
                <div>
                  {/* Horizontal Stage Stepper Visualizer */}
                  {executionPlan?.stages && executionPlan.stages.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', overflowX: 'auto', padding: '0.75rem', background: '#f8fafc', borderRadius: 'var(--admin-radius-sm)', border: '1px solid var(--admin-border)' }}>
                      {executionPlan.stages.map((stage, idx) => {
                        const stageTasks = stage.tasks.map(id => allTasks.find(t => t.id === id)).filter(Boolean);
                        const isStageComplete = stageTasks.length > 0 && stageTasks.every(t => t.status === 'COMPLETED');
                        const isStageActive = stageTasks.some(t => t.status === 'IN_PROGRESS');

                        return (
                          <React.Fragment key={stage.stage}>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.45rem 0.85rem',
                                borderRadius: 'var(--admin-radius-sm)',
                                background: isStageComplete ? '#ecfdf5' : isStageActive ? '#eff6ff' : '#ffffff',
                                border: `1px solid ${isStageComplete ? '#a7f3d0' : isStageActive ? '#93c5fd' : '#cbd5e1'}`,
                                whiteSpace: 'nowrap'
                              }}
                            >
                              <span
                                style={{
                                  width: 20,
                                  height: 20,
                                  borderRadius: 9999,
                                  background: isStageComplete ? '#059669' : isStageActive ? '#2563eb' : '#94a3b8',
                                  color: '#ffffff',
                                  fontSize: '0.68rem',
                                  fontWeight: 800,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                              >
                                {isStageComplete ? '✓' : stage.stage}
                              </span>
                              <div style={{ fontSize: '0.75rem' }}>
                                <div style={{ fontWeight: 800, color: 'var(--admin-text-main)' }}>
                                  Stage {stage.stage}
                                </div>
                                <div style={{ fontSize: '0.68rem', color: 'var(--admin-text-muted)' }}>
                                  {stageTasks.filter(t => t.status === 'COMPLETED').length}/{stageTasks.length} Done
                                </div>
                              </div>
                            </div>

                            {idx < executionPlan.stages.length - 1 && (
                              <ArrowRight size={16} style={{ color: '#94a3b8', flexShrink: 0 }} />
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  )}

                  {/* Empty Stage Warning */}
                  {(!executionPlan?.stages || executionPlan.stages.length === 0) ? (
                    <div style={{ padding: '3rem 1.5rem', textAlign: 'center', background: '#f8fafc', borderRadius: 'var(--admin-radius-sm)', border: '1px dashed var(--admin-border)', color: 'var(--admin-text-muted)' }}>
                      <Workflow size={32} style={{ opacity: 0.3, margin: '0 auto 0.75rem' }} />
                      <h4 style={{ margin: '0 0 0.5rem', color: 'var(--admin-text-main)' }}>No DAG Workflow Generated Yet</h4>
                      <p style={{ margin: '0 0 1rem', fontSize: '0.85rem' }}>
                        Click "Execute Routing & Tasks" above to classify grievances, map municipal agencies, and generate the topological task graph.
                      </p>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => handleTriggerRouting(selectedIssueId)}
                        disabled={routingInProgress}
                      >
                        <Sparkles size={14} className={routingInProgress ? 'spinner' : ''} />
                        <span>Generate Workflow Now</span>
                      </button>
                    </div>
                  ) : (
                    /* Topologically Partitioned Stages */
                    executionPlan.stages.map((stage) => {
                      const stageTasks = stage.tasks.map(id => allTasks.find(t => t.id === id)).filter(Boolean);
                      const completedInStage = stageTasks.filter(t => t.status === 'COMPLETED').length;

                      return (
                        <div
                          key={stage.stage}
                          style={{
                            border: '1px solid var(--admin-border)',
                            borderRadius: 'var(--admin-radius-md)',
                            padding: '1.25rem',
                            marginBottom: '1.25rem',
                            background: '#fafbfc'
                          }}
                        >
                          {/* Stage Header */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid var(--admin-border)', paddingBottom: '0.65rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span
                                style={{
                                  background: 'var(--admin-primary)',
                                  color: '#ffffff',
                                  fontSize: '0.72rem',
                                  fontWeight: 900,
                                  padding: '2px 8px',
                                  borderRadius: 4
                                }}
                              >
                                STAGE {stage.stage}
                              </span>
                              <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--admin-text-main)' }}>
                                Parallel Execution Group
                              </span>
                            </div>

                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--admin-text-muted)' }}>
                              {completedInStage} of {stageTasks.length} Tasks Completed
                            </span>
                          </div>

                          {/* Task Cards in Stage */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {stageTasks.map((task) => {
                              const readiness = executionPlan.taskReadiness ? executionPlan.taskReadiness[task.id] : null;
                              const isPending = task.status === 'PENDING';
                              const isInProgress = task.status === 'IN_PROGRESS';
                              const isCompleted = task.status === 'COMPLETED';
                              const isCancelled = task.status === 'CANCELLED';

                              const lockedByList = readiness?.lockedBy || readiness?.blockedBy || [];
                              const prereqs = taskPrereqsMap[task.id] || [];
                              const downstreams = taskDownstreamMap[task.id] || [];
                              const deptIcon = getDeptIcon(task.department || task.title);

                              return (
                                <div
                                  key={task.id}
                                  style={{
                                    background: '#ffffff',
                                    border: `1.5px solid ${isCompleted ? '#a7f3d0' : isInProgress ? '#93c5fd' : readiness?.ready ? '#c7d2fe' : 'var(--admin-border)'}`,
                                    borderRadius: 'var(--admin-radius-sm)',
                                    padding: '1rem 1.15rem',
                                    boxShadow: isInProgress ? '0 4px 12px rgba(59, 130, 246, 0.1)' : '0 1px 3px rgba(0,0,0,0.02)',
                                    transition: 'all 0.15s ease'
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                                    <div style={{ flex: 1, minWidth: '240px' }}>
                                      {/* Task Title & Department Badge */}
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '0.95rem' }}>{deptIcon}</span>
                                        <h5 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: 'var(--admin-text-main)' }}>
                                          {task.title}
                                        </h5>
                                        {task.priority && (
                                          <span
                                            style={{
                                              fontSize: '0.66rem',
                                              fontWeight: 700,
                                              padding: '1px 6px',
                                              borderRadius: 4,
                                              background: task.priority === 'Critical' ? '#fee2e2' : task.priority === 'High' ? '#ffedd5' : '#f1f5f9',
                                              color: task.priority === 'Critical' ? '#dc2626' : task.priority === 'High' ? '#ea580c' : '#475569'
                                            }}
                                          >
                                            {task.priority} Priority
                                          </span>
                                        )}
                                      </div>

                                      <p style={{ margin: '0 0 0.65rem', fontSize: '0.8125rem', color: 'var(--admin-text-muted)', lineHeight: 1.45 }}>
                                        {task.description}
                                      </p>

                                      {/* Readiness & Dependency Badges */}
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                                        {/* Status Badge */}
                                        <span
                                          style={{
                                            fontSize: '0.68rem',
                                            fontWeight: 800,
                                            padding: '2px 8px',
                                            borderRadius: 4,
                                            ...getStatusBadge(task.status)
                                          }}
                                        >
                                          {task.status}
                                        </span>

                                        {/* Readiness Badge */}
                                        {isPending && readiness && (
                                          readiness.ready ? (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: '#059669', background: '#ecfdf5', padding: '2px 8px', borderRadius: 4, border: '1px solid #a7f3d0', fontWeight: 700 }}>
                                              <Play size={10} />
                                              <span>Ready to Start</span>
                                            </span>
                                          ) : (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: '#dc2626', background: '#fef2f2', padding: '2px 8px', borderRadius: 4, border: '1px solid #fecaca', fontWeight: 700 }}>
                                              <Lock size={11} />
                                              <span>
                                                Locked by: {lockedByList.map(bId => allTasks.find(t => t.id === bId)?.title || bId.slice(0, 8)).join(', ')}
                                              </span>
                                            </span>
                                          )
                                        )}

                                        {isInProgress && (
                                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: '#2563eb', background: '#eff6ff', padding: '2px 8px', borderRadius: 4, border: '1px solid #bfdbfe', fontWeight: 700 }}>
                                            <Zap size={11} className="spinner" />
                                            <span>Active Execution</span>
                                          </span>
                                        )}

                                        {isCompleted && (
                                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: '#059669', background: '#ecfdf5', padding: '2px 8px', borderRadius: 4, border: '1px solid #a7f3d0', fontWeight: 700 }}>
                                            <CheckCircle2 size={12} />
                                            <span>Completed</span>
                                          </span>
                                        )}
                                      </div>

                                      {/* Prerequisites & Downstream Connections Chips */}
                                      {(prereqs.length > 0 || downstreams.length > 0) && (
                                        <div style={{ marginTop: '0.6rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap', fontSize: '0.7rem' }}>
                                          {prereqs.map(p => (
                                            <span key={p.id} style={{ background: '#f1f5f9', color: '#475569', padding: '1px 6px', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                                              Prereq: <strong>{p.title}</strong> ({p.status})
                                            </span>
                                          ))}
                                          {downstreams.map(d => (
                                            <span key={d.id} style={{ background: '#e0e7ff', color: '#3730a3', padding: '1px 6px', borderRadius: 4, border: '1px solid #c7d2fe' }}>
                                              Unlocks: <strong>{d.title}</strong>
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </div>

                                    {/* Action Buttons */}
                                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                      {isPending && readiness?.ready && (
                                        <button
                                          type="button"
                                          className="btn btn-primary btn-sm"
                                          onClick={() => handleUpdateTaskStatus(task.id, 'IN_PROGRESS')}
                                          style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
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
                                            style={{ background: 'var(--admin-success)', color: '#ffffff', padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
                                          >
                                            <Check size={12} />
                                            <span>Complete</span>
                                          </button>

                                          <button
                                            type="button"
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => handleUpdateTaskStatus(task.id, 'CANCELLED')}
                                            style={{ color: 'var(--admin-danger)', borderColor: '#fca5a5', padding: '0.35rem 0.6rem', fontSize: '0.78rem' }}
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
                      );
                    })
                  )}
                </div>
              )}

              {/* ── TAB 2: Interactive SVG DAG Topology Graph ─────────── */}
              {activeTab === 'network' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                    <div>
                      <h4 style={{ margin: '0 0 0.2rem', fontSize: '0.95rem', fontWeight: 800, color: 'var(--admin-text-main)' }}>
                        Directed Acyclic Graph (DAG) Network
                      </h4>
                      <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>
                        Visual representation of topological task dependencies and prerequisite constraints.
                      </p>
                    </div>

                    {/* Legend */}
                    <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.72rem', color: 'var(--admin-text-muted)', flexWrap: 'wrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: 8, height: 8, borderRadius: 9999, background: '#10b981' }} />
                        Completed
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: 8, height: 8, borderRadius: 9999, background: '#3b82f6' }} />
                        In Progress
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: 8, height: 8, borderRadius: 9999, background: '#8b5cf6' }} />
                        Ready to Start
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: 8, height: 8, borderRadius: 9999, background: '#94a3b8' }} />
                        Locked / Prerequisite
                      </span>
                    </div>
                  </div>

                  {graphLayout ? (
                    <div style={{ width: '100%', overflowX: 'auto', background: '#f8fafc', borderRadius: 'var(--admin-radius-sm)', border: '1px solid var(--admin-border)', padding: '1rem' }}>
                      <svg width={graphLayout.totalWidth} height={graphLayout.totalHeight} style={{ display: 'block', margin: '0 auto' }}>
                        <defs>
                          <marker
                            id="dag-arrow"
                            viewBox="0 0 10 10"
                            refX="9"
                            refY="5"
                            markerWidth="6"
                            markerHeight="6"
                            orient="auto-start-reverse"
                          >
                            <path d="M 0 1 L 10 5 L 0 9 z" fill="#64748b" />
                          </marker>
                          <marker
                            id="dag-arrow-active"
                            viewBox="0 0 10 10"
                            refX="9"
                            refY="5"
                            markerWidth="6"
                            markerHeight="6"
                            orient="auto-start-reverse"
                          >
                            <path d="M 0 1 L 10 5 L 0 9 z" fill="#3b82f6" />
                          </marker>
                        </defs>

                        {/* Stage Column Header Labels */}
                        {graphLayout.stages.map((stage, idx) => {
                          const x = 60 + idx * 260;
                          return (
                            <g key={stage.stage}>
                              <rect
                                x={x - 10}
                                y={15}
                                width={240}
                                height={28}
                                rx={6}
                                fill="#ffffff"
                                stroke="#e2e8f0"
                              />
                              <text
                                x={x + 110}
                                y={33}
                                textAnchor="middle"
                                fontSize="11"
                                fontWeight="800"
                                fill="#4f46e5"
                              >
                                STAGE {stage.stage} (PARALLEL GROUP)
                              </text>
                            </g>
                          );
                        })}

                        {/* Dependency Curved Edges */}
                        {graphLayout.edges.map((edge, idx) => {
                          const fromX = edge.from.x + 200;
                          const fromY = edge.from.y + 35;
                          const toX = edge.to.x;
                          const toY = edge.to.y + 35;
                          const midX = (fromX + toX) / 2;
                          const d = `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`;

                          const fromTask = allTasks.find(t => t.id === edge.fromId);
                          const isActiveEdge = fromTask?.status === 'IN_PROGRESS';

                          return (
                            <path
                              key={idx}
                              d={d}
                              fill="none"
                              stroke={isActiveEdge ? '#3b82f6' : '#94a3b8'}
                              strokeWidth={isActiveEdge ? '2.5' : '1.8'}
                              strokeDasharray={isActiveEdge ? '4,4' : 'none'}
                              markerEnd={isActiveEdge ? 'url(#dag-arrow-active)' : 'url(#dag-arrow)'}
                            />
                          );
                        })}

                        {/* Task Nodes */}
                        {Object.entries(graphLayout.nodeCoords).map(([taskId, coord]) => {
                          const task = allTasks.find(t => t.id === taskId);
                          if (!task) return null;

                          const isCompleted = task.status === 'COMPLETED';
                          const isInProgress = task.status === 'IN_PROGRESS';
                          const readiness = executionPlan.taskReadiness?.[taskId];
                          const isReady = readiness?.ready && task.status === 'PENDING';

                          const strokeColor = isCompleted ? '#10b981' : isInProgress ? '#3b82f6' : isReady ? '#8b5cf6' : '#cbd5e1';
                          const fillColor = isCompleted ? '#ecfdf5' : isInProgress ? '#eff6ff' : isReady ? '#f5f3ff' : '#ffffff';

                          return (
                            <g key={taskId} transform={`translate(${coord.x}, ${coord.y})`}>
                              <rect
                                x={0}
                                y={0}
                                width={200}
                                height={70}
                                rx={8}
                                fill={fillColor}
                                stroke={strokeColor}
                                strokeWidth="2"
                                filter="drop-shadow(0 2px 4px rgba(0,0,0,0.04))"
                              />

                              {/* Task Node Header */}
                              <text
                                x={12}
                                y={22}
                                fontSize="11"
                                fontWeight="800"
                                fill="#0f172a"
                              >
                                {task.title.length > 22 ? task.title.slice(0, 20) + '...' : task.title}
                              </text>

                              {/* Department Tag */}
                              <text
                                x={12}
                                y={40}
                                fontSize="9"
                                fontWeight="600"
                                fill="#64748b"
                              >
                                🏛️ {task.department || 'Municipal Task'}
                              </text>

                              {/* Status Pill */}
                              <rect
                                x={12}
                                y={48}
                                width={68}
                                height={15}
                                rx={3}
                                fill={isCompleted ? '#d1fae5' : isInProgress ? '#dbeafe' : isReady ? '#ede9fe' : '#f1f5f9'}
                              />
                              <text
                                x={46}
                                y={59}
                                textAnchor="middle"
                                fontSize="8.5"
                                fontWeight="800"
                                fill={isCompleted ? '#059669' : isInProgress ? '#2563eb' : isReady ? '#7c3aed' : '#64748b'}
                              >
                                {task.status}
                              </text>
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                  ) : (
                    <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--admin-text-muted)' }}>
                      No topological DAG data to display.
                    </div>
                  )}
                </div>
              )}

              {/* ── TAB 3: Attached Grievances Explorer ───────────────── */}
              {activeTab === 'complaints' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div>
                      <h4 style={{ margin: '0 0 0.2rem', fontSize: '0.95rem', fontWeight: 800, color: 'var(--admin-text-main)' }}>
                        Grouped Citizen Grievances ({selectedIssue?.complaints?.length || selectedIssue?.complaint_count || 0})
                      </h4>
                      <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>
                        Citizen complaints automatically clustered into this single civic issue via DFS graph traversal.
                      </p>
                    </div>
                  </div>

                  {(!selectedIssue?.complaints || selectedIssue.complaints.length === 0) ? (
                    <div style={{ padding: '2.5rem 1rem', textAlign: 'center', background: '#f8fafc', borderRadius: 'var(--admin-radius-sm)', border: '1px dashed var(--admin-border)', color: 'var(--admin-text-muted)', fontSize: '0.85rem' }}>
                      No individual complaints attached or accessible.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {selectedIssue.complaints.map((c) => (
                        <div
                          key={c.id}
                          style={{
                            padding: '1rem',
                            borderRadius: 'var(--admin-radius-sm)',
                            border: '1px solid var(--admin-border)',
                            background: '#ffffff'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.35rem' }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.2rem' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 800, fontFamily: 'monospace', color: 'var(--admin-primary)' }}>
                                  #{c.id ? c.id.slice(0, 8) : ''}
                                </span>
                                <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--admin-text-main)' }}>
                                  {c.title || c.category || 'Citizen Grievance'}
                                </span>
                              </div>
                              <span style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)' }}>
                                Logged {c.created_at ? new Date(c.created_at).toLocaleString() : 'recently'}
                              </span>
                            </div>

                            <div style={{ display: 'flex', gap: '0.35rem' }}>
                              <span
                                style={{
                                  fontSize: '0.68rem',
                                  fontWeight: 800,
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  background: c.priority === 'Critical' ? '#fee2e2' : c.priority === 'High' ? '#ffedd5' : '#f1f5f9',
                                  color: c.priority === 'Critical' ? '#dc2626' : c.priority === 'High' ? '#ea580c' : '#475569'
                                }}
                              >
                                {c.priority || 'Medium'}
                              </span>

                              <span
                                style={{
                                  fontSize: '0.68rem',
                                  fontWeight: 800,
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  ...getStatusBadge(c.status)
                                }}
                              >
                                {c.status || 'PROCESSED'}
                              </span>
                            </div>
                          </div>

                          <p style={{ margin: '0.35rem 0 0', fontSize: '0.8125rem', color: 'var(--admin-text-muted)', lineHeight: 1.45 }}>
                            {c.description || 'Citizen submitted grievance regarding municipal service disruption.'}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── TAB 4: Explainable AI Routing & Municipal Agencies ─ */}
              {activeTab === 'routing' && (
                <div>
                  <h4 style={{ margin: '0 0 0.85rem', fontSize: '0.95rem', fontWeight: 800, color: 'var(--admin-text-main)' }}>
                    Explainable AI Routing & Multi-Agency Assignment
                  </h4>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
                    {/* Classified Multi-Label Types */}
                    <div style={{ padding: '1.15rem', background: '#f8fafc', borderRadius: 'var(--admin-radius-sm)', border: '1px solid var(--admin-border)' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--admin-text-muted)', display: 'block', marginBottom: '0.65rem' }}>
                        Multi-Label Predicted Issue Types
                      </span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                        {(routingData?.issueTypes || []).map((t, idx) => (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff', padding: '0.45rem 0.65rem', borderRadius: 4, border: '1px solid #e2e8f0', fontSize: '0.8rem' }}>
                            <span style={{ fontWeight: 700, color: 'var(--admin-text-main)' }}>{t.label}</span>
                            <span style={{ fontWeight: 800, color: 'var(--admin-primary)', fontSize: '0.75rem' }}>
                              {(t.confidence * 100).toFixed(0)}% Confidence
                            </span>
                          </div>
                        ))}
                        {(!routingData?.issueTypes || routingData.issueTypes.length === 0) && (
                          <span style={{ fontSize: '0.8125rem', color: 'var(--admin-text-muted)' }}>No classifications generated</span>
                        )}
                      </div>
                    </div>

                    {/* Assigned Municipal Agencies */}
                    <div style={{ padding: '1.15rem', background: '#f8fafc', borderRadius: 'var(--admin-radius-sm)', border: '1px solid var(--admin-border)' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--admin-text-muted)', display: 'block', marginBottom: '0.65rem' }}>
                        Responsible Municipal Agencies
                      </span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                        {(routingData?.departments || []).map((dept, idx) => {
                          const deptName = typeof dept === 'string' ? dept : dept.department || 'Department';
                          const reason = typeof dept === 'object' ? dept.reason : null;
                          return (
                            <div key={idx} style={{ background: '#ffffff', padding: '0.55rem 0.75rem', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 800, fontSize: '0.8125rem', color: 'var(--admin-text-main)' }}>
                                <span>{getDeptIcon(deptName)}</span>
                                <span>{deptName}</span>
                              </div>
                              {reason && (
                                <span style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)', display: 'block', marginTop: 2 }}>
                                  Rule: {reason}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Add Dependency Constraint Modal ───────────────────────── */}
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
            role="dialog"
            aria-modal="true"
            aria-label="Add Task Dependency Constraint"
            style={{ width: '100%', maxWidth: 520, background: '#ffffff', borderRadius: 'var(--admin-radius-md)', padding: '1.75rem', position: 'relative' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowAddDepModal(false)}
              style={{ position: 'absolute', top: 18, right: 18, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--admin-text-muted)' }}
            >
              <X size={18} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
              <GitBranch size={20} style={{ color: 'var(--admin-primary)' }} />
              <h3 style={{ fontSize: '1.2rem', fontWeight: 900, margin: 0, color: 'var(--admin-text-main)' }}>
                Add Task Dependency Constraint
              </h3>
            </div>
            <p style={{ fontSize: '0.8125rem', color: 'var(--admin-text-muted)', marginBottom: '1.25rem', lineHeight: 1.45 }}>
              Enforces topological execution ordering via Kahn's algorithm. The prerequisite task must be marked <strong>COMPLETED</strong> before the dependent task can be started.
            </p>

            <form onSubmit={handleAddDependency}>
              <div style={{ marginBottom: '1rem' }}>
                <label className="form-label" style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 700, fontSize: '0.8125rem' }}>
                  Target Dependent Task (Will be blocked)
                </label>
                <select
                  className="form-select"
                  value={targetTaskId}
                  onChange={(e) => setTargetTaskId(e.target.value)}
                  required
                  style={{ width: '100%', padding: '0.55rem', borderRadius: 6, border: '1px solid var(--admin-border)', fontSize: '0.85rem' }}
                >
                  <option value="">Select target task to block...</option>
                  {allTasks.map((t) => (
                    <option key={t.id} value={t.id}>{t.title} ({t.status})</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label className="form-label" style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 700, fontSize: '0.8125rem' }}>
                  Prerequisite Task (Must finish first)
                </label>
                <select
                  className="form-select"
                  value={prereqTaskId}
                  onChange={(e) => setPrereqTaskId(e.target.value)}
                  required
                  style={{ width: '100%', padding: '0.55rem', borderRadius: 6, border: '1px solid var(--admin-border)', fontSize: '0.85rem' }}
                >
                  <option value="">Select prerequisite task...</option>
                  {allTasks.filter((t) => t.id !== targetTaskId).map((t) => (
                    <option key={t.id} value={t.id}>{t.title} ({t.status})</option>
                  ))}
                </select>
              </div>

              {/* Visual Constraint Preview */}
              {targetTaskId && prereqTaskId && (
                <div style={{ padding: '0.75rem', background: '#eff6ff', borderRadius: 6, border: '1px solid #bfdbfe', marginBottom: '1.25rem', fontSize: '0.78rem', color: '#1e40af' }}>
                  <strong>Constraint Preview:</strong>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem', fontWeight: 700 }}>
                    <span>{allTasks.find(t => t.id === prereqTaskId)?.title}</span>
                    <ArrowRight size={14} />
                    <span>{allTasks.find(t => t.id === targetTaskId)?.title}</span>
                  </div>
                </div>
              )}

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
                  {savingDep ? 'Validating Kahn DAG...' : 'Add Constraint'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
