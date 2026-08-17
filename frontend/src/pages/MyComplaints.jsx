import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { ChevronRight, PlusCircle, Calendar } from 'lucide-react';
import { motion } from 'framer-motion';

const PRIORITY_CLASS = { Critical: 'critical', High: 'high', Medium: 'medium', Low: 'low' };
const STATUS_COLORS  = {
  Submitted:   'var(--info)',
  'In Review': 'var(--warning)',
  Assigned:    'var(--accent-light)',
  Resolved:    'var(--success)',
  Rejected:    'var(--danger)',
};

export default function MyComplaints() {
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');

  useEffect(() => {
    api.get('/complaints')
      .then(({ data }) => setComplaints(data.complaints))
      .catch(err => setError(err.response?.data?.error || 'Failed to load complaints'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page container text-center" style={{ padding: '5rem 0' }}>Loading your complaints…</div>;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="page">
      <div className="container">
        <div className="flex items-center justify-between mb-2" style={{ flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1>My Complaints</h1>
            <p>{complaints.length} complaint{complaints.length !== 1 ? 's' : ''} submitted</p>
          </div>
          <Link to="/complaints/new" className="btn btn-primary">
            <PlusCircle size={16} /> New Complaint
          </Link>
        </div>

        {error && <div className="error-msg mb-2">{error}</div>}

        {complaints.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card text-center" style={{ padding: '4rem 2rem' }}>
              <img src="/empty_state.jpg" alt="No Complaints" style={{ width: '180px', height: '180px', objectFit: 'cover', borderRadius: '24px', margin: '0 auto 1.5rem', boxShadow: '0 20px 40px rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)' }} />
              <h2 className="mb-1" style={{ fontSize: '1.8rem' }}>No complaints yet</h2>
            <p className="text-muted mt-1">Submit your first civic complaint to get started.</p>
            <Link to="/complaints/new" className="btn btn-primary mt-2">Submit a Complaint</Link>
          </motion.div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
            {complaints.map((c, i) => (
              <motion.div 
                key={c._id} 
                className="card" 
                initial={{ opacity: 0, y: 20 }} 
                animate={{ opacity: 1, y: 0 }} 
                transition={{ delay: i * 0.05 }}
                style={{ display: 'flex', flexDirection: 'column', padding: '1.5rem' }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="badge badge-info">{c.category}</span>
                  <span className={`badge badge-${PRIORITY_CLASS[c.priority] || 'medium'}`}>
                    {c.priority}
                  </span>
                </div>
                
                <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', flexGrow: 1, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontWeight: 500, color: 'var(--text-primary)' }}>
                  {c.text}
                </h3>
                
                <div className="flex items-center justify-between pt-1 mt-auto" style={{ borderTop: '1px solid var(--border)' }}>
                  <div className="flex flex-col gap-1 mt-1">
                    <span style={{ color: STATUS_COLORS[c.status], fontSize: '0.85rem', fontWeight: 600 }}>
                      ● {c.status}
                    </span>
                    <span className="flex items-center gap-1 text-muted" style={{ fontSize: '0.8rem' }}>
                      <Calendar size={12} /> {new Date(c.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <Link to={`/complaints/${c._id}`} className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-end', marginBottom: '4px' }}>
                    View <ChevronRight size={14} />
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
