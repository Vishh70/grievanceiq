// src/pages/MyComplaints.jsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { ChevronRight, PlusCircle } from 'lucide-react';

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

  if (loading) return <div className="loading">Loading your complaints…</div>;

  return (
    <div className="page">
      <div className="container">
        <div className="flex items-center justify-between mb-2">
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
          <div className="card text-center" style={{ padding: '3rem' }}>
              <img src="/empty_state.jpg" alt="No Complaints" style={{ width: '180px', height: '180px', objectFit: 'cover', borderRadius: '24px', margin: '0 auto 1.5rem', boxShadow: '0 20px 40px rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)' }} />
              <h2 className="mb-1" style={{ fontSize: '1.8rem' }}>No complaints yet</h2>
            <p className="text-muted mt-1">Submit your first civic complaint to get started.</p>
            <Link to="/complaints/new" className="btn btn-primary mt-2">Submit a Complaint</Link>
          </div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Category</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {complaints.map((c) => (
                    <tr key={c._id}>
                      <td style={{ maxWidth: 280 }}>
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.text}
                        </span>
                      </td>
                      <td><span className="badge badge-info">{c.category}</span></td>
                      <td>
                        <span className={`badge badge-${PRIORITY_CLASS[c.priority] || 'medium'}`}>
                          {c.priority}
                        </span>
                      </td>
                      <td>
                        <span style={{ color: STATUS_COLORS[c.status], fontSize: '0.85rem', fontWeight: 600 }}>
                          ● {c.status}
                        </span>
                      </td>
                      <td className="text-muted text-sm">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </td>
                      <td>
                        <Link to={`/complaints/${c._id}`} className="btn btn-secondary btn-sm">
                          View <ChevronRight size={14} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
