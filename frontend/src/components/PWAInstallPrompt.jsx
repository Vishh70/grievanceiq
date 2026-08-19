// src/components/PWAInstallPrompt.jsx
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone, Download, X, Sparkles } from 'lucide-react';

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if dismissed within last 7 days
    const dismissedAt = localStorage.getItem('pwa_prompt_dismissed_at');
    if (dismissedAt) {
      const daysSince = (Date.now() - parseInt(dismissedAt, 10)) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) return;
    }

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    if (isIOSDevice) setIsIOS(true);

    const timer = setTimeout(() => {
      const isDismissed = localStorage.getItem('pwa_prompt_dismissed_at');
      if (!isDismissed) {
        setShowPrompt(true);
      }
    }, 2000);

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      const isDismissed = localStorage.getItem('pwa_prompt_dismissed_at');
      if (!isDismissed) {
        setShowPrompt(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', () => {
      setShowPrompt(false);
      setDeferredPrompt(null);
      localStorage.setItem('pwa_prompt_dismissed_at', Date.now().toString());
    });

    return () => {
      clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleDismiss = () => {
    localStorage.setItem('pwa_prompt_dismissed_at', Date.now().toString());
    setShowPrompt(false);
  };

  const handleInstallClick = async () => {
    if (isIOS) {
      handleDismiss();
      return;
    }
    
    if (!deferredPrompt) {
      import('react-hot-toast').then(({ default: toast }) => {
        toast('Open your browser menu (⋮) and select "Install App"', { icon: '📱', duration: 4000 });
      });
      handleDismiss();
      return;
    }

    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    handleDismiss();
  };

  return (
    <AnimatePresence>
      {showPrompt && (
        <div
          style={{
            position: 'fixed',
            bottom: '86px', // Above mobile bottom navigation bar
            left: 0,
            right: 0,
            zIndex: 99999,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '0 12px',
            pointerEvents: 'none'
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            style={{
              pointerEvents: 'auto',
              width: '100%',
              maxWidth: '420px',
              background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.97), rgba(30, 41, 59, 0.97))',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              borderRadius: '18px',
              border: '1px solid rgba(255, 255, 255, 0.18)',
              padding: '1rem 1.1rem',
              boxShadow: '0 20px 45px rgba(0, 0, 0, 0.6), 0 0 25px rgba(99, 102, 241, 0.3)',
              color: 'white',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.8rem'
            }}
          >
            {/* Top Row: Icon + Header + Close 'X' */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', minWidth: 0 }}>
                <div style={{
                  background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                  padding: '0.55rem',
                  borderRadius: '12px',
                  display: 'flex',
                  boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)',
                  flexShrink: 0
                }}>
                  <Smartphone size={20} color="white" />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <h4 style={{ margin: 0, color: '#ffffff', fontSize: '0.96rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
                      Install GrievanceIQ
                    </h4>
                    <span style={{
                      fontSize: '0.62rem',
                      background: 'rgba(99, 102, 241, 0.35)',
                      color: '#a5b4fc',
                      border: '1px solid rgba(165, 180, 252, 0.35)',
                      padding: '1px 6px',
                      borderRadius: '999px',
                      fontWeight: 700
                    }}>
                      APP
                    </span>
                  </div>
                  <p style={{ margin: '2px 0 0', fontSize: '0.76rem', color: '#94a3b8', lineHeight: 1.3 }}>
                    {isIOS ? 'Tap Share → Add to Home Screen' : 'Add to home screen for fast native experience'}
                  </p>
                </div>
              </div>

              {/* High-Contrast Large Touch Target Close Button */}
              <button 
                onClick={handleDismiss}
                aria-label="Close Install Banner"
                style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  color: '#ffffff',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '50%',
                  width: '34px',
                  height: '34px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  touchAction: 'manipulation',
                  transition: 'all 0.2s',
                  flexShrink: 0
                }}
                onMouseOver={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.9)'; }}
                onMouseOut={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'; }}
                title="Dismiss"
              >
                <X size={17} strokeWidth={2.5} />
              </button>
            </div>

            {/* Action Row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.6rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '0.6rem' }}>
              <button
                onClick={handleDismiss}
                style={{
                  background: 'transparent',
                  color: '#94a3b8',
                  border: 'none',
                  padding: '0.4rem 0.8rem',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'color 0.2s'
                }}
                onMouseOver={e => e.currentTarget.style.color = '#ffffff'}
                onMouseOut={e => e.currentTarget.style.color = '#94a3b8'}
              >
                Not now
              </button>

              {!isIOS && (
                <button 
                  onClick={handleInstallClick}
                  style={{
                    background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                    color: '#ffffff',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                    padding: '0.45rem 1rem',
                    borderRadius: '10px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontSize: '0.82rem',
                    boxShadow: '0 4px 14px rgba(79, 70, 229, 0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Download size={14} />
                  <span>Install App</span>
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}



