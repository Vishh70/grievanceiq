// src/pages/AdminDashboard.jsx
import { useEffect, useState } from 'react';
import api from '../services/api';
import Skeleton from '../components/Skeleton';
import { BarChart3, Clock, CheckCircle, AlertTriangle, Layers, X, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import toast from 'react-hot-toast';

const PRIORITY_COLORS = {
  'Critical': '#ef4444', // Danger red
  'High': '#f97316',     // Orange
  'Medium': '#3b82f6',   // Blue
  'Low': '#10b981'       // Success green
};

export default function AdminDashboard() {
  const [summary, setSummary] = useState(null);
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ status: '', priority: '', category: '' });
  const [statusModal, setStatusModal] = useState(null);
  const [newStatus, setNewStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [sumRes, compRes] = await Promise.all([
          api.get('/dashboard/summary'),
          api.get('/complaints', { params: { ...filters, page, limit: 10 } })
        ]);
        setSummary(sumRes.data);
        setComplaints(compRes.data.complaints);
      } catch (err) {
        toast.error('Failed to load dashboard data.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [filters, page]);

  const applyFilter = (key, val) => { setFilters(f => ({ ...f, [key]: val })); setPage(1); };

  const exportToCSV = () => {
    if (!complaints.length) return toast.error('No data to export');
    const headers = ['ID', 'Citizen', 'Category', 'Priority', 'Status', 'Department', 'Date', 'Description'];
    const rows = complaints.map(c => [
      c._id,
      c.citizenId?.name || 'Unknown',
      c.category,
      c.priority,
      c.status,
      c.recommendedDepartment || 'N/A',
      new Date(c.createdAt).toLocaleDateString(),
      `"${c.text.replace(/"/g, '""')}"`
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `grievanceiq_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('CSV Exported successfully!');
  };

  const handleStatusUpdate = async () => {
    if (!newStatus) return;
    const toastId = toast.loading('Updating status...');
    try {
      await api.patch(`/complaints/${statusModal.complaintId}/status`, { status: newStatus, note: statusNote });
      setStatusModal(null); setNewStatus(''); setStatusNote('');
      setFilters(f => ({ ...f })); // Refresh
      toast.success('Status updated', { id: toastId });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Update failed', { id: toastId });
    }
  };

  if (loading) return (
    <div className="page container">
      <Skeleton style={{ height: 40, width: '30%', marginBottom: '2rem' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
        {[1,2,3,4].map(i => <Skeleton key={i} style={{ height: 100 }} />)}
      </div>
      <div style={{ display: 'flex', gap: '2rem' }}>
        <Skeleton style={{ height: 500, flex: 3 }} />
        <Skeleton style={{ height: 500, flex: 1 }} />
      </div>
    </div>
  );

  const s = summary?.summary || {};
  
  // Prepare data for charts
  const priorityData = s.byPriority ? Object.entries(s.byPriority).map(([name, value]) => ({ name, value })) : [];
  const deptData = summary?.departmentBreakdown || [];

  return (
    <div className="page">
      <div className="container">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-2">
          <div>
            <h1>Admin Dashboard</h1>
            <p>Complaint intelligence overview — real-time analytics and management</p>
          </div>
          <button className="btn btn-secondary" onClick={exportToCSV}>
            📥 Export to CSV
          </button>
        </motion.div>

        {/* Top KPIs */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="mb-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}
        >
          <div className="card card-glass flex items-center gap-2">
            <div style={{ background: 'rgba(99,102,241,0.15)', padding: '1rem', borderRadius: '50%' }}><Layers size={24} color="var(--accent-light)"/></div>
            <div><p className="text-sm text-muted">Total Issues</p><h2 style={{ fontSize: '1.8rem' }}>{s.total || 0}</h2></div>
          </div>
          <div className="card card-glass flex items-center gap-2">
            <div style={{ background: 'rgba(239,68,68,0.15)', padding: '1rem', borderRadius: '50%' }}><AlertTriangle size={24} color="var(--danger)"/></div>
            <div><p className="text-sm text-muted">Critical</p><h2 style={{ fontSize: '1.8rem' }}>{s.byPriority?.Critical || 0}</h2></div>
          </div>
          <div className="card card-glass flex items-center gap-2">
            <div style={{ background: 'rgba(245,158,11,0.15)', padding: '1rem', borderRadius: '50%' }}><Clock size={24} color="var(--warning)"/></div>
            <div><p className="text-sm text-muted">In Progress</p><h2 style={{ fontSize: '1.8rem' }}>{s.byStatus?.['In Progress'] || 0}</h2></div>
          </div>
          <div className="card card-glass flex items-center gap-2">
            <div style={{ background: 'rgba(16,185,129,0.15)', padding: '1rem', borderRadius: '50%' }}><CheckCircle size={24} color="var(--success)"/></div>
            <div><p className="text-sm text-muted">Resolved</p><h2 style={{ fontSize: '1.8rem' }}>{s.byStatus?.Resolved || 0}</h2></div>
          </div>
        </motion.div>

        {/* Advanced Analytics Charts */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
            <motion.div className="card card-glass" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <h3 className="mb-2">Priority Distribution</h3>
              <div style={{ height: 250, width: '100%' }}>
                 <ResponsiveContainer>
                    <PieChart>
                      <Pie data={priorityData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" label>
                        {priorityData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={PRIORITY_COLORS[entry.name] || '#8884d8'} />
                        ))}
                      </Pie>
                      <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    </PieChart>
                 </ResponsiveContainer>
              </div>
            </motion.div>
            
            <motion.div className="card card-glass" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <h3 className="mb-2">Department Workload</h3>
              <div style={{ height: 250, width: '100%' }}>
                 <ResponsiveContainer>
                    <BarChart data={deptData} margin={{ top: 20, right: 30, left: -20, bottom: 5 }}>
                      <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                      <RechartsTooltip cursor={{ fill: 'rgba(99,102,241,0.05)' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                      <Bar dataKey="value" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                 </ResponsiveContainer>
              </div>
            </motion.div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '2rem', alignItems: 'start' }}>
          
          {/* Main Table Area */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 }} className="card">
            <div className="flex items-center justify-between mb-2">
              <h3>Issue Tracking</h3>
              <div className="flex gap-1">
                <select className="form-select" style={{ padding: '0.4rem 1rem', width: 'auto' }} value={filters.status} onChange={e => applyFilter('status', e.target.value)}>
                  <option value="">All Statuses</option>
                  <option value="Submitted">Submitted</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Resolved">Resolved</option>
                  <option value="Rejected">Rejected</option>
                </select>
                <select className="form-select" style={{ padding: '0.4rem 1rem', width: 'auto' }} value={filters.priority} onChange={e => applyFilter('priority', e.target.value)}>
                  <option value="">All Priorities</option>
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Category</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {complaints.length === 0 ? (
                      <tr><td colSpan="6" className="text-center text-muted">No complaints found.</td></tr>
                    ) : complaints.map((c, i) => (
                      <motion.tr 
                        key={c._id}
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: i * 0.05 }}
                      >
                        <td><a href={`/complaints/${c._id}`} className="text-accent" style={{ fontFamily: 'monospace' }}>#{c._id.slice(-5)}</a></td>
                        <td>{c.category}</td>
                        <td><span className={`badge badge-${c.priority.toLowerCase()}`}>{c.priority}</span></td>
                        <td>{c.status}</td>
                        <td>{new Date(c.createdAt).toLocaleDateString()}</td>
                        <td>
                          <button className="btn btn-sm btn-secondary" onClick={() => setStatusModal({ complaintId: c._id })}>
                            Update
                          </button>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
            <div className="flex justify-between items-center mt-2">
              <button className="btn btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button>
              <span className="text-sm text-muted">Page {page}</span>
              <button className="btn btn-secondary btn-sm" disabled={complaints.length < 10} onClick={() => setPage(p => p + 1)}>Next</button>
            </div>
          </motion.div>

          {/* Recent Activity Sidebar */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} className="card" style={{ background: 'var(--bg-secondary)' }}>
            <h3 className="mb-2 flex items-center gap-1 border-b pb-1" style={{ borderColor: 'var(--border)' }}>
              <Activity size={18} color="var(--accent-light)"/> Recent Activity
            </h3>
            <div className="flex-col gap-1">
              {complaints.slice(0, 8).map((c, i) => (
                <div key={i} className="flex-col gap-1 pb-1 mb-1 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                  <div className="flex justify-between items-start">
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>New issue reported</span>
                    <span className="text-xs text-muted">{new Date(c.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                  </div>
                  <p className="text-xs text-muted">
                    Citizen reported a <span style={{ color: 'var(--accent-light)' }}>{c.category}</span> issue.
                  </p>
                </div>
              ))}
              {complaints.length === 0 && <p className="text-sm text-muted">No recent activity.</p>}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Status Modal */}
      <AnimatePresence>
        {statusModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              className="card" style={{ width: '100%', maxWidth: 400, position: 'relative' }}
            >
              <button style={{ position: 'absolute', top: 15, right: 15, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setStatusModal(null)}>
                <X size={20}/>
              </button>
              <h3 className="mb-2">Update Status</h3>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-select" value={newStatus} onChange={e => setNewStatus(e.target.value)}>
                  <option value="">Select Status...</option>
                  <option value="Submitted">Submitted</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Resolved">Resolved</option>
                  <option value="Rejected">Rejected</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Note (Optional)</label>
                <textarea className="form-textarea" placeholder="Add a note for the citizen..." value={statusNote} onChange={e => setStatusNote(e.target.value)} style={{ minHeight: 80 }} />
              </div>
              <button className="btn btn-primary w-full mt-1" onClick={handleStatusUpdate} disabled={!newStatus}>Save Update</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
