// src/pages/AdminDashboard.jsx
import { useEffect, useState } from 'react';
import api from '../services/api';
import Skeleton from '../components/Skeleton';
import { Clock, CheckCircle, AlertTriangle, Layers, X, Activity, Link as LinkIcon, Eye, Edit, MapPin, Zap, ShieldAlert, Timer, Compass } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import toast from 'react-hot-toast';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { createPinIcon, PRIORITY_MAP_COLORS } from '../utils/mapIcons';

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
  const analytics = summary?.analytics || {};
  
  // Prepare data for charts
  const priorityData = summary?.priorityBreakdown || [];
  const deptData = summary?.departmentBreakdown || [];
  const trendData = summary?.trend || [];
  const categoryData = summary?.categoryBreakdown || [];
  const validMapPins = (summary?.mapPins || []).filter(p => p.location?.lat != null && p.location?.lng != null);

  return (
    <div className="page">
      <div className="container">
        <motion.div 
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} 
          className="flex items-center justify-between mb-2 admin-header-wrap"
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

        {/* Primary Issue Metrics */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="mb-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}
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

        {/* Executive AI & SLA Intelligence Cockpit */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
          className="grid-responsive-2 mb-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}
        >
          {/* SLA Performance Cockpit */}
          <div className="card card-glass" style={{ borderLeft: '4px solid var(--accent)' }}>
            <h3 className="mb-2 flex items-center gap-1">
              <Timer size={18} color="var(--accent-light)" /> Municipal SLA Performance (48h Target)
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1rem' }}>
              <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <p className="text-xs text-muted mb-1">SLA Compliance Rate</p>
                <div style={{
                  fontSize: '1.5rem',
                  fontWeight: 800,
                  color: analytics.slaComplianceRate == null ? 'var(--text-muted)' : (analytics.slaComplianceRate >= 80 ? 'var(--success)' : analytics.slaComplianceRate >= 60 ? 'var(--warning)' : 'var(--danger)')
                }}>
                  {analytics.slaComplianceRate != null ? `${analytics.slaComplianceRate}%` : 'N/A'}
                </div>
                <p className="text-xs text-muted mt-1">Target $\le$ 48h resolution</p>
              </div>

              <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <p className="text-xs text-muted mb-1">Avg Resolution Time</p>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {analytics.avgResolutionHours != null ? `${analytics.avgResolutionHours}h` : 'N/A'}
                </div>
                <p className="text-xs text-muted mt-1">From submit to resolved</p>
              </div>

              <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <p className="text-xs text-muted mb-1">Active SLA Breaches</p>
                <div style={{
                  fontSize: '1.5rem',
                  fontWeight: 800,
                  color: (analytics.activeSlaBreaches || 0) > 0 ? '#ef4444' : 'var(--success)'
                }}>
                  {analytics.activeSlaBreaches || 0}
                </div>
                <p className="text-xs text-muted mt-1">Open &gt; 48 hours</p>
              </div>
            </div>
          </div>

          {/* AI Hazard Intelligence Cockpit */}
          <div className="card card-glass" style={{ borderLeft: '4px solid #f97316' }}>
            <h3 className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <ShieldAlert size={18} color="#f97316" /> AI Hazard Intelligence
              </span>
              {analytics.avgSeverityScore != null && (
                <span className="badge" style={{
                  background: analytics.avgSeverityScore >= 7 ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)',
                  color: analytics.avgSeverityScore >= 7 ? '#f87171' : '#fbbf24',
                  border: '1px solid rgba(255,255,255,0.1)'
                }}>
                  ⚡ Mean Hazard: {analytics.avgSeverityScore}/10
                </span>
              )}
            </h3>

            <p className="text-xs text-muted mb-2">Most frequently detected physical risks across city complaints:</p>

            {(!analytics.topSafetyHazards || analytics.topSafetyHazards.length === 0) ? (
              <div className="text-sm text-muted py-2">No physical hazards currently flagged.</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {analytics.topSafetyHazards.map((item, idx) => (
                  <span key={idx} style={{
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    padding: '4px 10px',
                    borderRadius: '20px',
                    background: 'rgba(239, 68, 68, 0.15)',
                    color: '#f87171',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    ⚠️ {item.hazard} <strong style={{ color: '#fff', background: 'rgba(0,0,0,0.3)', padding: '1px 6px', borderRadius: '10px', fontSize: '0.72rem' }}>{item.count}</strong>
                  </span>
                ))}
              </div>
            )}
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

        {/* Global Geographic Distribution Map */}
        {validMapPins.length > 0 && (
          <motion.div className="card mb-2" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32 }}>
            <h3 className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <MapPin size={20} color="var(--accent)" /> City Incident Hotspot Map ({validMapPins.length} Geotagged Issues)
              </span>
              <span className="text-xs text-muted flex items-center gap-1">
                <Compass size={14} /> Color-coded by AI severity (🔴 ≥8, 🟠 ≥6, 🔵 &lt;6)
              </span>
            </h3>
            <div style={{ height: 420, borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border)' }}>
              <MapContainer 
                center={[validMapPins[0].location.lat, validMapPins[0].location.lng]} 
                zoom={11} 
                dragging={!L.Browser.mobile} 
                tap={!L.Browser.mobile} 
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; OpenStreetMap'
                />
                {validMapPins.map(pin => {
                  const markerColor =
                    pin.severityScore >= 8 ? '#ef4444' :
                    pin.severityScore >= 6 ? '#f59e0b' :
                    '#3b82f6';
                  const pinIcon = createPinIcon(markerColor, 32);
                  return (
                    <Marker key={pin._id} position={[pin.location.lat, pin.location.lng]} icon={pinIcon}>
                      <Popup>
                        <div style={{ minWidth: '200px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px', marginBottom: '6px' }}>
                            <span className={`badge badge-${(pin.priority || 'medium').toLowerCase()}`}>{pin.priority}</span>
                            {pin.severityScore != null && (
                              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: pin.severityScore >= 8 ? '#ef4444' : '#f59e0b' }}>
                                ⚡ {pin.severityScore}/10
                              </span>
                            )}
                          </div>
                          <p style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '4px', color: 'var(--text-primary)' }}>
                            {pin.category}
                          </p>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', maxHeight: '60px', overflow: 'hidden', lineHeight: 1.4 }}>
                            {pin.text}
                          </p>
                          {pin.location?.address && (
                            <p style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: '8px' }}>
                              📍 {pin.location.address}
                            </p>
                          )}
                          <a href={`/complaints/${pin._id}`} className="btn btn-sm btn-primary" style={{ textDecoration: 'none', display: 'block', textAlign: 'center', padding: '0.35rem 0.5rem', fontSize: '0.78rem' }}>
                            View Details →
                          </a>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>
            </div>
          </motion.div>
        )}

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

        <div className="grid-responsive-sidebar" style={{ marginTop: '2rem', paddingBottom: '6rem' }}>
          
          {/* Main Table Area */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }} className="card">
            <div className="flex items-center justify-between mb-2 admin-header-wrap" style={{ gap: '1rem', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0 }}>Issue Tracking Table</h3>
              <div className="flex gap-1 dashboard-filters" style={{ flexWrap: 'wrap', width: '100%', maxWidth: '650px' }}>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Search category or desc..." 
                  value={filters.search} 
                  onChange={e => applyFilter('search', e.target.value)}
                  style={{ padding: '0.4rem 0.8rem', minWidth: '150px', flex: 1 }}
                />
                <select className="form-select" style={{ padding: '0.4rem 0.8rem', minWidth: '130px', flex: 1 }} value={filters.category} onChange={e => applyFilter('category', e.target.value)}>
                  <option value="">All Categories</option>
                  {summary?.categoryBreakdown?.map((c, i) => (
                    <option key={i} value={c.name}>{c.name}</option>
                  ))}
                </select>
                <select className="form-select" style={{ padding: '0.4rem 0.8rem', minWidth: '120px', flex: 1 }} value={filters.status} onChange={e => applyFilter('status', e.target.value)}>
                  <option value="">All Statuses</option>
                  <option value="Submitted">Submitted</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Resolved">Resolved</option>
                  <option value="Rejected">Rejected</option>
                </select>
                <select className="form-select" style={{ padding: '0.4rem 0.8rem', minWidth: '120px', flex: 1 }} value={filters.priority} onChange={e => applyFilter('priority', e.target.value)}>
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
                    <th>Issue & Hazards</th>
                    <th>Category</th>
                    <th>Priority & Hazard Index</th>
                    <th>Status & SLA</th>
                    <th>Date</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {complaints.length === 0 ? (
                      <tr><td colSpan="7" className="text-center text-muted">No complaints found.</td></tr>
                    ) : complaints.map((c, i) => {
                      const isPending = c.status === 'Submitted' || c.status === 'In Review';
                      const hoursPending = (Date.now() - new Date(c.createdAt).getTime()) / (1000 * 60 * 60);
                      const isSlaBreached = isPending && hoursPending > 48;

                      return (
                        <motion.tr 
                          key={c._id}
                          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: i * 0.05 }}
                        >
                          <td data-label="ID"><a href={`/complaints/${c._id}`} className="text-accent" style={{ fontFamily: 'monospace' }}>#{c._id.slice(-5)}</a></td>
                          <td data-label="Description" style={{ maxWidth: '280px' }}>
                            <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500 }} title={c.text}>
                              {c.text}
                            </div>
                            {c.safetyHazards && c.safetyHazards.length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                                {c.safetyHazards.map((hazard, hi) => (
                                  <span key={hi} style={{
                                    fontSize: '0.68rem',
                                    fontWeight: 600,
                                    padding: '1px 6px',
                                    background: 'rgba(239, 68, 68, 0.15)',
                                    color: '#f87171',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    borderRadius: '4px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '2px'
                                  }}>
                                    ⚠️ {hazard}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td data-label="Category">{c.category}</td>
                          <td data-label="Priority">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <span className={`badge badge-${c.priority.toLowerCase()}`}>{c.priority}</span>
                              {c.severityScore != null ? (
                                <span style={{
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  padding: '2px 7px',
                                  borderRadius: '12px',
                                  background: c.severityScore >= 8 ? 'rgba(239, 68, 68, 0.2)' : c.severityScore >= 6 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                                  color: c.severityScore >= 8 ? '#f87171' : c.severityScore >= 6 ? '#fbbf24' : '#60a5fa',
                                  border: `1px solid ${c.severityScore >= 8 ? 'rgba(239, 68, 68, 0.35)' : c.severityScore >= 6 ? 'rgba(245, 158, 11, 0.35)' : 'rgba(59, 130, 246, 0.35)'}`,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '2px'
                                }} title={`AI Severity Score: ${c.severityScore}/10`}>
                                  ⚡ {c.severityScore}/10
                                </span>
                              ) : (
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }} title="Submitted before AI severity scoring was enabled">
                                  (Unrated)
                                </span>
                              )}
                            </div>
                          </td>
                          <td data-label="Status">
                            <div>
                              <span>{c.status}</span>
                              {isSlaBreached && (
                                <div style={{
                                  marginTop: '4px',
                                  fontSize: '0.68rem',
                                  fontWeight: 700,
                                  color: '#ef4444',
                                  background: 'rgba(239, 68, 68, 0.12)',
                                  border: '1px solid rgba(239, 68, 68, 0.3)',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px'
                                }}>
                                  <AlertTriangle size={11} color="#ef4444" /> SLA Breach (&gt;48h)
                                </div>
                              )}
                            </div>
                          </td>
                          <td data-label="Date">{new Date(c.createdAt).toLocaleDateString()}</td>
                          <td data-label="Action" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                            <a href={`/complaints/${c._id}`} className="btn btn-sm btn-primary flex items-center" style={{ textDecoration: 'none', padding: '0.4rem 0.6rem' }} title="View Details">
                              <Eye size={14} /> <span className="nav-text-hide-mobile">View</span>
                            </a>
                            <button className="btn btn-sm btn-secondary flex items-center" onClick={() => setStatusModal({ complaintId: c._id })} style={{ padding: '0.4rem 0.6rem' }} title="Update Status">
                              <Edit size={14} /> <span className="nav-text-hide-mobile">Update</span>
                            </button>
                          </td>
                        </motion.tr>
                      );
                    })}
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
