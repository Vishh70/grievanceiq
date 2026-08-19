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
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 30, scale: 0.92 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          style={{
            position: 'fixed',
            bottom: '88px', // Positioned above mobile navigation bar
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 99999,
            width: 'calc(100% - 28px)',
            maxWidth: '420px',
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.96), rgba(30, 41, 59, 0.96))',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            borderRadius: '20px',
            border: '1px solid rgba(255, 255, 255, 0.16)',
            padding: '1.1rem 1.2rem',
            boxShadow: '0 20px 45px rgba(0, 0, 0, 0.55), 0 0 25px rgba(99, 102, 241, 0.3)',
            color: 'white',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.85rem'
          }}
        >
          {/* Top Row: Icon + Header + Corner Close Button */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
              <div style={{
                background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                padding: '0.6rem',
                borderRadius: '12px',
                display: 'flex',
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)',
                flexShrink: 0
              }}>
                <Smartphone size={20} color="white" />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <h4 style={{ margin: 0, color: '#ffffff', fontSize: '0.98rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
                    Install GrievanceIQ
                  </h4>
                  <span style={{
                    fontSize: '0.65rem',
                    background: 'rgba(99, 102, 241, 0.3)',
                    color: '#a5b4fc',
                    border: '1px solid rgba(165, 180, 252, 0.3)',
                    padding: '1px 6px',
                    borderRadius: '999px',
                    fontWeight: 600
                  }}>
                    FAST APP
                  </span>
                </div>
                <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.3 }}>
                  {isIOS ? 'Tap Share → Add to Home Screen for full app' : 'Add to home screen for instant alerts & GPS accuracy'}
                </p>
              </div>
            </div>

            {/* Prominent High-Contrast Close 'X' Button */}
            <button 
              onClick={handleDismiss}
              aria-label="Close Install Banner"
              style={{
                background: 'rgba(255, 255, 255, 0.12)',
                color: '#cbd5e1',
                border: '1px solid rgba(255, 255, 255, 0.15)',
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
              onMouseOver={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.85)'; e.currentTarget.style.color = '#ffffff'; }}
              onMouseOut={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)'; e.currentTarget.style.color = '#cbd5e1'; }}
              title="Close"
            >
              <X size={17} strokeWidth={2.5} />
            </button>
          </div>

          {/* Action Row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.6rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '0.65rem' }}>
            <button
              onClick={handleDismiss}
              style={{
                background: 'transparent',
                color: '#94a3b8',
                border: 'none',
                padding: '0.45rem 0.85rem',
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
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  padding: '0.45rem 1.1rem',
                  borderRadius: '10px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: '0.84rem',
                  boxShadow: '0 4px 14px rgba(79, 70, 229, 0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Download size={15} />
                <span>Install Now</span>
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}


