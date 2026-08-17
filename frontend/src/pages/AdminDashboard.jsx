// src/pages/AdminDashboard.jsx
import { useEffect, useState } from 'react';
import api from '../services/api';
import Skeleton from '../components/Skeleton';
import { Clock, CheckCircle, AlertTriangle, Layers, X, Activity, Link as LinkIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import toast from 'react-hot-toast';

const PRIORITY_COLORS = {
  'Critical': '#ef4444', // Danger red
  'High': '#f97316',     // Orange
  'Medium': '#3b82f6',   // Blue
  'Low': '#10b981'       // Success green
};

const CATEGORY_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#0ea5e9'];

export default function AdminDashboard() {
  const [summary, setSummary] = useState(null);
  const [similarGroups, setSimilarGroups] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ status: '', priority: '', category: '', search: '' });
  const [statusModal, setStatusModal] = useState(null);
  const [newStatus, setNewStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [sumRes, compRes, simRes] = await Promise.all([
          api.get('/dashboard/summary'),
          api.get('/complaints', { params: { ...filters, page, limit: 10 } }),
          api.get('/dashboard/similar-groups')
        ]);
        setSummary(sumRes.data);
        setComplaints(compRes.data.complaints);
        setSimilarGroups(simRes.data.groups || []);
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
    const headers = ['ID', 'Category', 'Priority', 'Status', 'Department', 'Date', 'Description'];
    const rows = complaints.map(c => [
      c._id,
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
  const priorityData = summary?.priorityBreakdown || [];
  const deptData = summary?.departmentBreakdown || [];
  const trendData = summary?.trend || [];
  const categoryData = summary?.categoryBreakdown || [];

  return (
    <div className="page">
      <div className="container">
        <motion.div 
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} 
          className="flex items-center justify-between mb-2"
          style={{
            background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9))',
            padding: '2rem',
            borderRadius: '16px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(255, 255, 255, 0.05)',
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          {/* Animated subtle glow inside header */}
          <div style={{ position: 'absolute', top: '-50%', left: '-20%', width: '50%', height: '200%', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.03), transparent)', transform: 'rotate(25deg)', animation: 'shimmer 8s infinite linear' }}></div>
          
          <div style={{ position: 'relative', zIndex: 1 }}>
            <h1 style={{ fontSize: '2.2rem', marginBottom: '0.25rem', background: 'linear-gradient(to right, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Admin Command Center</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>End-to-End Civic Intelligence & Analytics Platform</p>
          </div>
          <motion.button 
            whileHover={{ scale: 1.05, boxShadow: '0 0 15px rgba(99,102,241,0.4)' }}
            whileTap={{ scale: 0.95 }}
            className="btn btn-primary" onClick={exportToCSV}
            style={{ position: 'relative', zIndex: 1, background: 'linear-gradient(135deg, var(--accent), var(--accent-light))', border: 'none' }}
          >
            📥 Export CSV Report
          </motion.button>
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
            <div><p className="text-sm text-muted">Critical</p><h2 style={{ fontSize: '1.8rem' }}>{s.highPriority || 0}</h2></div>
          </div>
          <div className="card card-glass flex items-center gap-2">
            <div style={{ background: 'rgba(245,158,11,0.15)', padding: '1rem', borderRadius: '50%' }}><Clock size={24} color="var(--warning)"/></div>
            <div><p className="text-sm text-muted">Pending</p><h2 style={{ fontSize: '1.8rem' }}>{s.pending || 0}</h2></div>
          </div>
          <div className="card card-glass flex items-center gap-2">
            <div style={{ background: 'rgba(16,185,129,0.15)', padding: '1rem', borderRadius: '50%' }}><CheckCircle size={24} color="var(--success)"/></div>
            <div><p className="text-sm text-muted">Resolved</p><h2 style={{ fontSize: '1.8rem' }}>{s.resolved || 0}</h2></div>
          </div>
        </motion.div>

        {/* Row 1: Trends & Priority */}
        <div className="grid-responsive-2" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
            <motion.div className="card card-glass" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <h3 className="mb-2">Incoming Issue Trends (14 Days)</h3>
              <div style={{ height: 250, width: '100%' }}>
                 <ResponsiveContainer>
                    <LineChart data={trendData} margin={{ top: 10, right: 30, left: -20, bottom: 0 }}>
                      <XAxis dataKey="date" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} allowDecimals={false} />
                      <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', background: 'var(--bg-card)', color: 'var(--text-primary)', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                      <Line type="monotone" dataKey="count" stroke="var(--accent)" strokeWidth={3} dot={{ r: 4, fill: 'var(--accent)' }} activeDot={{ r: 6 }} />
                    </LineChart>
                 </ResponsiveContainer>
              </div>
            </motion.div>

            <motion.div className="card card-glass" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <h3 className="mb-2">Priority Distribution</h3>
              <div style={{ height: 250, width: '100%' }}>
                 <ResponsiveContainer>
                    <PieChart>
                      <Pie data={priorityData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" label>
                        {priorityData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={PRIORITY_COLORS[entry.name] || '#8884d8'} />
                        ))}
                      </Pie>
                      <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', background: 'var(--bg-card)', color: 'var(--text-primary)', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    </PieChart>
                 </ResponsiveContainer>
              </div>
            </motion.div>
        </div>

        {/* Row 2: Category & Department Workload */}
        <div className="grid-responsive-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
            <motion.div className="card card-glass" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
              <h3 className="mb-2">Category Analytics</h3>
              <div style={{ height: 250, width: '100%' }}>
                 <ResponsiveContainer>
                    <BarChart data={categoryData} layout="vertical" margin={{ top: 0, right: 30, left: 40, bottom: 0 }}>
                      <XAxis type="number" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} allowDecimals={false} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 12, fill: 'var(--text-primary)' }} tickLine={false} axisLine={false} />
                      <RechartsTooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ borderRadius: '8px', border: 'none', background: 'var(--bg-card)', color: 'var(--text-primary)', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {categoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                 </ResponsiveContainer>
              </div>
            </motion.div>
            
            <motion.div className="card card-glass" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <h3 className="mb-2">Department Workload</h3>
              <div style={{ height: 250, width: '100%' }}>
                 <ResponsiveContainer>
                    <BarChart data={deptData} margin={{ top: 20, right: 30, left: -20, bottom: 5 }}>
                      <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} allowDecimals={false} />
                      <RechartsTooltip cursor={{ fill: 'rgba(99,102,241,0.05)' }} contentStyle={{ borderRadius: '8px', border: 'none', background: 'var(--bg-card)', color: 'var(--text-primary)', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                      <Bar dataKey="value" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                 </ResponsiveContainer>
              </div>
            </motion.div>
        </div>

        {/* AI Similar Issue Clusters */}
        <motion.div className="mb-2" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
            <h3 className="mb-1 flex items-center gap-1">
              <LinkIcon size={20} color="var(--accent)"/> AI Detected Similar Issue Clusters
            </h3>
            <p className="text-sm text-muted mb-2">The AI automatically groups semantically identical complaints to prevent duplicate work.</p>
            {similarGroups.length === 0 ? (
              <div className="card card-glass text-center text-muted">No duplicate clusters detected yet.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
                {similarGroups.map((group, idx) => (
                  <div key={idx} className="card card-glass flex-col gap-1" style={{ borderLeft: '4px solid var(--warning)' }}>
                    <div className="flex items-center justify-between">
                       <span className="font-semibold text-sm">Cluster #{group._id.slice(-4)}</span>
                       <span className="badge badge-warning">{group.count} Complaints</span>
                    </div>
                    <p className="text-xs text-muted mt-1">Found in categories: <br/><strong style={{ color: 'var(--text-primary)' }}>{group.categories.join(', ')}</strong></p>
                  </div>
                ))}
              </div>
            )}
        </motion.div>

        <div className="grid-responsive-sidebar" style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '2rem', alignItems: 'start', marginTop: '3rem' }}>
          
          {/* Main Table Area */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }} className="card">
            <div className="flex items-center justify-between mb-2" style={{ flexWrap: 'wrap', gap: '1rem' }}>
              <h3>Issue Tracking Table</h3>
              <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Search category or desc..." 
                  value={filters.search} 
                  onChange={e => applyFilter('search', e.target.value)}
                  style={{ padding: '0.4rem 1rem', width: '200px' }}
                />
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
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.45 }} className="card" style={{ background: 'var(--bg-secondary)' }}>
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
