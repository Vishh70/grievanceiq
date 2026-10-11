// src/pages/AdminDashboard.jsx — Municipal Operations & AI Intelligence Dashboard
import { useEffect, useState, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import api from '../services/api';
import Skeleton from '../components/Skeleton';
import { Layers, AlertTriangle, Clock, CheckCircle2, ShieldAlert, GitBranch, MapPin } from 'lucide-react';

import '../components/admin/admin.css';
import AdminHeader from '../components/admin/AdminHeader';
import AdminNav from '../components/admin/AdminNav';
import KpiCard from '../components/admin/KpiCard';
import SlaCockpit from '../components/admin/SlaCockpit';
import AnalyticsCharts from '../components/admin/AnalyticsCharts';
import ComplaintsTable from '../components/admin/ComplaintsTable';
import ComplaintDrawer from '../components/admin/ComplaintDrawer';
import StatusUpdateModal from '../components/admin/StatusUpdateModal';
import CivicIssuesManager from '../components/admin/CivicIssuesManager';
import AiSafetyIntelligence from '../components/admin/AiSafetyIntelligence';
import IncidentMapSection from '../components/admin/IncidentMapSection';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [initialLoading, setInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  // Core Data State
  const [summary, setSummary] = useState(null);
  const [similarGroups, setSimilarGroups] = useState([]);
  const [civicIssues, setCivicIssues] = useState([]);
  const [complaintsData, setComplaintsData] = useState({
    complaints: [],
    total: 0,
    page: 1,
    pages: 1
  });

  // Complaint Filters & Pagination
  const INITIAL_FILTERS = {
    search: '',
    category: '',
    priority: '',
    status: '',
    department: ''
  };

  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [complaintsLoading, setComplaintsLoading] = useState(false);

  // Active Modals & Drawer State
  const [drawerComplaint, setDrawerComplaint] = useState(null);
  const [statusModalComplaint, setStatusModalComplaint] = useState(null);

  // Stale request guard for complaints
  const complaintsRequestSeq = useRef(0);

  // Fetch Summary, Similar Groups, and Civic Issues
  const fetchGlobalMetrics = useCallback(async () => {
    try {
      const [sumRes, simRes, civicRes] = await Promise.all([
        api.get('/dashboard/summary'),
        api.get('/dashboard/similar-groups').catch(() => ({ data: { groups: [] } })),
        api.get('/civic-issues').catch(() => ({ data: [] }))
      ]);

      setSummary(sumRes.data);
      setSimilarGroups(simRes.data.groups || []);
      setCivicIssues(civicRes.data || []);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Failed to load dashboard metrics:', err);
      toast.error('Failed to refresh dashboard metrics.');
    }
  }, []);

  // Fetch Complaints with pagination & filtering
  const fetchComplaints = useCallback(async (targetPage = 1, currentFilters = filters) => {
    setComplaintsLoading(true);
    const seq = ++complaintsRequestSeq.current;

    try {
      const params = {
        page: targetPage,
        limit: 10
      };
      if (currentFilters.search) params.search = currentFilters.search.trim();
      if (currentFilters.category) params.category = currentFilters.category;
      if (currentFilters.priority) params.priority = currentFilters.priority;
      if (currentFilters.status) params.status = currentFilters.status;
      if (currentFilters.department) params.department = currentFilters.department;

      const res = await api.get('/complaints', { params });

      // Guard against out-of-order stale responses
      if (seq === complaintsRequestSeq.current) {
        setComplaintsData({
          complaints: res.data.complaints || [],
          total: res.data.total ?? (res.data.complaints || []).length,
          page: res.data.page ?? targetPage,
          pages: res.data.pages ?? 1
        });
      }
    } catch (err) {
      if (seq === complaintsRequestSeq.current) {
        console.error('Failed to load complaints:', err);
        toast.error('Failed to load complaints table.');
      }
    } finally {
      if (seq === complaintsRequestSeq.current) {
        setComplaintsLoading(false);
      }
    }
  }, [filters]);

  // Initial Data Load
  useEffect(() => {
    const init = async () => {
      setInitialLoading(true);
      await Promise.all([fetchGlobalMetrics(), fetchComplaints(1, filters)]);
      setInitialLoading(false);
    };
    init();
  }, []); // Run once on mount

  // Watch filter/page changes
  const handleFilterChange = (key, val) => {
    const updated = { ...filters, [key]: val };
    setFilters(updated);
    setPage(1);
    fetchComplaints(1, updated);
  };

  // Atomic reset callback for all filters
  const handleResetFilters = () => {
    setFilters(INITIAL_FILTERS);
    setPage(1);
    fetchComplaints(1, INITIAL_FILTERS);
  };

  const handlePageChange = (newPage) => {
    setPage(newPage);
    fetchComplaints(newPage, filters);
  };

  // Full Refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([fetchGlobalMetrics(), fetchComplaints(page, filters)]);
    setIsRefreshing(false);
    toast.success('Dashboard data refreshed');
  };

  // Safe Filtered CSV Export (fetches up to 250 filtered records)
  const handleExportCsv = async () => {
    setIsExporting(true);
    const toastId = toast.loading('Preparing filtered export (up to 250 records)...');

    try {
      const params = {
        page: 1,
        limit: 250
      };
      if (filters.search) params.search = filters.search.trim();
      if (filters.category) params.category = filters.category;
      if (filters.priority) params.priority = filters.priority;
      if (filters.status) params.status = filters.status;
      if (filters.department) params.department = filters.department;

      const res = await api.get('/complaints', { params });
      const exportItems = res.data.complaints || [];

      if (exportItems.length === 0) {
        toast.error('No complaints match the current filters to export.', { id: toastId });
        return;
      }

      const headers = [
        'Complaint ID',
        'Category',
        'Priority',
        'AI Severity (1-10)',
        'Status',
        'Department',
        'Reported Date',
        'Address',
        'Description'
      ];

      const csvRows = exportItems.map((c) => {
        const id = c._id || '';
        const cat = c.category || '';
        const prio = c.priority || '';
        const sev = c.severityScore != null ? String(c.severityScore) : 'Unscored';
        const st = c.status || '';
        const dept = c.recommendedDepartment || 'Unassigned';
        const dt = c.createdAt ? new Date(c.createdAt).toISOString() : '';
        const addr = c.location?.address ? `"${c.location.address.replace(/"/g, '""')}"` : '""';
        const desc = c.text ? `"${c.text.replace(/"/g, '""')}"` : '""';

        return [id, cat, prio, sev, st, dept, dt, addr, desc].join(',');
      });

      const csvString = [headers.join(','), ...csvRows].join('\r\n');
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      const dateStr = new Date().toISOString().split('T')[0];
      link.setAttribute('download', `grievanceiq_operations_${dateStr}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`Exported ${exportItems.length} complaints successfully!`, { id: toastId });
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Failed to generate CSV export', { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  // Open drawer for a complaint (or fetch full single record if needed)
  const handleOpenDrawer = async (complaint) => {
    try {
      const res = await api.get(`/complaints/${complaint._id}`);
      setDrawerComplaint(res.data.complaint || complaint);
    } catch (err) {
      // Fall back to in-memory complaint if detail fetch fails
      setDrawerComplaint(complaint);
    }
  };

  if (initialLoading) {
    return (
      <div className="admin-dashboard">
        <div className="admin-container">
          <Skeleton style={{ height: 90, borderRadius: 14, marginBottom: '1.5rem' }} />
          <Skeleton style={{ height: 50, borderRadius: 10, marginBottom: '1.5rem' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} style={{ height: 110, borderRadius: 10 }} />
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
            <Skeleton style={{ height: 320, borderRadius: 10 }} />
            <Skeleton style={{ height: 320, borderRadius: 10 }} />
          </div>
        </div>
      </div>
    );
  }

  const s = summary?.summary || {};
  const analytics = summary?.analytics || {};
  const priorityData = summary?.priorityBreakdown || [];
  const deptData = summary?.departmentBreakdown || [];
  const trendData = summary?.trend || [];
  const categoryData = summary?.categoryBreakdown || [];
  const mapPins = summary?.mapPins || [];

  return (
    <div className="admin-dashboard">
      <div className="admin-container">
        {/* Operations Header */}
        <AdminHeader
          lastRefreshed={lastRefreshed}
          onRefresh={handleRefresh}
          onExportCsv={handleExportCsv}
          isRefreshing={isRefreshing}
          isExporting={isExporting}
          civicIssueCount={civicIssues.length}
          activeBreaches={analytics.activeSlaBreaches || 0}
        />

        {/* Navigation Tabs */}
        <AdminNav
          activeTab={activeTab}
          onChangeTab={setActiveTab}
          counts={{
            complaints: complaintsData.total,
            civicIssues: civicIssues.length,
            hazards: analytics.topSafetyHazards?.length,
            mapPins: mapPins.length
          }}
        />

        {/* ── Tab 1: Operations Overview ────────────────────────── */}
        {activeTab === 'overview' && (
          <div>
            {/* KPI Cards Grid */}
            <div className="admin-kpi-grid">
              <KpiCard
                title="Total Complaints"
                value={s.total}
                subtitle="All ingested grievances"
                icon={Layers}
                iconBg="rgba(79, 70, 229, 0.12)"
                iconColor="var(--admin-primary)"
                onClick={() => setActiveTab('complaints')}
              />

              <KpiCard
                title="Active Workload"
                value={s.pending}
                subtitle="Pending, In Review, Assigned"
                icon={Clock}
                iconBg="rgba(217, 119, 6, 0.12)"
                iconColor="var(--admin-warning)"
                onClick={() => {
                  handleFilterChange('status', 'Pending');
                  setActiveTab('complaints');
                }}
              />

              <KpiCard
                title="Critical / High Priority"
                value={s.highPriority}
                subtitle="High and Critical severity"
                icon={AlertTriangle}
                iconBg="rgba(220, 38, 38, 0.12)"
                iconColor="var(--admin-danger)"
                badgeText="Priority Focus"
                badgeType="danger"
                onClick={() => {
                  handleFilterChange('priority', 'Critical');
                  setActiveTab('complaints');
                }}
              />

              <KpiCard
                title="Resolved Complaints"
                value={s.resolved}
                subtitle="Verified closed issues"
                icon={CheckCircle2}
                iconBg="rgba(5, 150, 105, 0.12)"
                iconColor="var(--admin-success)"
                onClick={() => {
                  handleFilterChange('status', 'Resolved');
                  setActiveTab('complaints');
                }}
              />

              <KpiCard
                title="Active SLA Breaches"
                value={analytics.activeSlaBreaches != null ? analytics.activeSlaBreaches : 'N/A'}
                subtitle="Exceeding 48-hr threshold"
                icon={Clock}
                iconBg={analytics.activeSlaBreaches > 0 ? 'rgba(220, 38, 38, 0.12)' : 'rgba(5, 150, 105, 0.12)'}
                iconColor={analytics.activeSlaBreaches > 0 ? 'var(--admin-danger)' : 'var(--admin-success)'}
                badgeText={analytics.activeSlaBreaches > 0 ? 'Immediate Action' : 'Compliant'}
                badgeType={analytics.activeSlaBreaches > 0 ? 'danger' : 'success'}
              />

              <KpiCard
                title="Civic Issue Clusters"
                value={civicIssues.length}
                subtitle="DFS connected components"
                icon={GitBranch}
                iconBg="rgba(2, 132, 199, 0.12)"
                iconColor="var(--admin-info)"
                onClick={() => setActiveTab('civic-issues')}
              />
            </div>

            {/* SLA Performance Cockpit */}
            <div style={{ marginBottom: '1.5rem' }}>
              <SlaCockpit analytics={analytics} />
            </div>

            {/* Analytics Charts */}
            <AnalyticsCharts
              trendData={trendData}
              priorityData={priorityData}
              categoryData={categoryData}
              deptData={deptData}
            />
          </div>
        )}

        {/* ── Tab 2: Complaint Intelligence ─────────────────────── */}
        {activeTab === 'complaints' && (
          <ComplaintsTable
            complaints={complaintsData.complaints}
            total={complaintsData.total}
            page={complaintsData.page}
            pages={complaintsData.pages}
            limit={10}
            filters={filters}
            categories={categoryData}
            departments={deptData}
            onFilterChange={handleFilterChange}
            onResetFilters={handleResetFilters}
            onPageChange={handlePageChange}
            onOpenDrawer={handleOpenDrawer}
            onOpenStatusModal={setStatusModalComplaint}
            loading={complaintsLoading}
          />
        )}

        {/* ── Tab 3: Civic Issues & DAG Workflow ───────────────── */}
        {activeTab === 'civic-issues' && (
          <CivicIssuesManager
            civicIssues={civicIssues}
            onRefreshList={fetchGlobalMetrics}
          />
        )}

        {/* ── Tab 4: AI & Safety Intelligence ───────────────────── */}
        {activeTab === 'ai-safety' && (
          <AiSafetyIntelligence
            analytics={analytics}
            summary={s}
            categories={categoryData}
          />
        )}

        {/* ── Tab 5: Geographic Risk & Incident Map ─────────────── */}
        {activeTab === 'incident-map' && (
          <IncidentMapSection
            mapPins={mapPins}
            similarGroups={similarGroups}
            onSelectComplaint={handleOpenDrawer}
          />
        )}
      </div>

      {/* Complaint Details Drawer */}
      <ComplaintDrawer
        complaint={drawerComplaint}
        isOpen={Boolean(drawerComplaint)}
        onClose={() => setDrawerComplaint(null)}
        onOpenStatusModal={setStatusModalComplaint}
      />

      {/* Status Update Modal */}
      <StatusUpdateModal
        complaint={statusModalComplaint}
        isOpen={Boolean(statusModalComplaint)}
        onClose={() => setStatusModalComplaint(null)}
        onSuccess={() => {
          fetchGlobalMetrics();
          fetchComplaints(page, filters);
        }}
      />
    </div>
  );
}
