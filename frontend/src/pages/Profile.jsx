// frontend/src/pages/Profile.jsx
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';
import { Award, Shield, Star, CheckCircle, UploadCloud, User } from 'lucide-react';

export default function Profile() {
  const { user } = useAuth();

  if (!user) return null;

  const points = user.civicPoints || 0;
  
  // Calculate Level and Progress
  let level = "Observer";
  let nextLevel = "Active Citizen";
  let nextLevelPoints = 100;
  let progress = (points / 100) * 100;

  if (points >= 500) {
    level = "Civic Champion";
    nextLevel = "Max Level";
    nextLevelPoints = points;
    progress = 100;
  } else if (points >= 100) {
    level = "Active Citizen";
    nextLevel = "Civic Champion";
    nextLevelPoints = 500;
    progress = ((points - 100) / 400) * 100;
  }

  const badges = user.badges || [];

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: '800px' }}>
        <h1 className="mb-2">My Civic Profile</h1>

        <div className="grid-responsive-2 mb-2">
          {/* Identity Card */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card" style={{ textAlign: 'center' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--accent-glow)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
              <User size={40} />
            </div>
            <h2 style={{ marginBottom: '0.25rem' }}>{user.name}</h2>
            <p className="text-muted" style={{ marginBottom: '1rem' }}>{user.email}</p>
            <div className="badge badge-primary" style={{ fontSize: '1rem', padding: '0.5rem 1rem' }}>
              {level}
            </div>
          </motion.div>

          {/* Points & Progress Card */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card flex-col justify-center">
            <div className="flex items-center justify-between mb-1">
              <h3 style={{ margin: 0 }}>Civic Points</h3>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent)' }}>{points}</div>
            </div>
            
            <p className="text-sm text-muted mb-1">
              Earn points by submitting complaints (+50) and getting upvotes (+10).
            </p>

            <div style={{ marginTop: 'auto' }}>
              <div className="flex items-center justify-between text-sm mb-0.5">
                <span style={{ fontWeight: 600 }}>{level}</span>
                <span className="text-muted">{points} / {nextLevelPoints} to {nextLevel}</span>
              </div>
              <div style={{ height: '10px', background: 'var(--bg-secondary)', borderRadius: '10px', overflow: 'hidden' }}>
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                  style={{ height: '100%', background: 'var(--accent)' }}
                />
              </div>
            </div>
          </motion.div>
        </div>

        {/* Badges Section */}
        <h2 className="mb-1">Unlocked Badges 🎖️</h2>
        <div className="card">
          {badges.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Award size={48} style={{ opacity: 0.2, margin: '0 auto 1rem' }} />
              <p>You haven't unlocked any badges yet.</p>
              <p style={{ fontSize: '0.9rem' }}>Keep participating in the community to earn them!</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1rem' }}>
              {badges.map(b => (
                <div key={b} style={{ textAlign: 'center', padding: '1.5rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                  <Shield size={32} color="var(--accent)" style={{ margin: '0 auto 0.5rem' }} />
                  <div style={{ fontWeight: 600 }}>{b}</div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
