// frontend/src/pages/Leaderboard.jsx
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import api from '../services/api';
import Skeleton from '../components/Skeleton';
import { Trophy, Medal, Star, Shield, Award } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Leaderboard() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const { data } = await api.get('/users/leaderboard');
        setUsers(data.leaderboard);
      } catch (err) {
        toast.error('Failed to load leaderboard');
      } finally {
        setLoading(false);
      }
    };
    fetchLeaderboard();
  }, []);

  if (loading) return (
    <div className="page container">
      <Skeleton style={{ height: 100, marginBottom: '2rem' }} />
      <Skeleton style={{ height: 60, marginBottom: '1rem' }} />
      <Skeleton style={{ height: 60, marginBottom: '1rem' }} />
      <Skeleton style={{ height: 60, marginBottom: '1rem' }} />
    </div>
  );

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: '800px', paddingBottom: '6rem' }}>
        <div className="text-center mb-2">
          <motion.div 
            initial={{ scale: 0 }} 
            animate={{ scale: 1 }} 
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
          >
            <Trophy size={64} style={{ color: '#FCD34D', margin: '0 auto 1rem' }} />
          </motion.div>
          <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>Civic Leaderboard</h1>
          <p className="text-muted">The top citizens making our city a better place.</p>
        </div>

        <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
          {users.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No citizens with points yet. Be the first!
            </div>
          ) : (
            <div className="flex-col">
              {users.map((user, index) => (
                <motion.div 
                  key={user._id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    padding: '1.5rem', 
                    borderBottom: '1px solid var(--border)',
                    background: index === 0 ? 'linear-gradient(to right, rgba(252,211,77,0.1), transparent)' : 
                               index === 1 ? 'linear-gradient(to right, rgba(156,163,175,0.1), transparent)' : 
                               index === 2 ? 'linear-gradient(to right, rgba(180,83,9,0.1), transparent)' : 'transparent'
                  }}
                >
                  <div style={{ width: '50px', fontWeight: 'bold', fontSize: '1.5rem', color: 'var(--text-muted)' }}>
                    #{index + 1}
                  </div>
                  
                  <div style={{ marginRight: '1rem' }}>
                    {index === 0 && <Medal size={32} color="#F59E0B" fill="#FDE68A" />}
                    {index === 1 && <Medal size={32} color="#9CA3AF" fill="#E5E7EB" />}
                    {index === 2 && <Medal size={32} color="#B45309" fill="#FDE68A" />}
                    {index > 2 && <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Star size={16} color="var(--text-muted)" /></div>}
                  </div>

                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{user.name}</h3>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                      {user.badges?.map(b => (
                        <span key={b} className="badge badge-high" style={{ fontSize: '0.7rem' }}>{b}</span>
                      ))}
                      {(!user.badges || user.badges.length === 0) && (
                        <span className="badge" style={{ fontSize: '0.7rem', background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>No badges yet</span>
                      )}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent)' }}>
                      {user.civicPoints}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                      Points
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
