// src/components/PWAInstallPrompt.jsx
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X } from 'lucide-react';

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // If dismissed in this session, do not annoy user
    if (sessionStorage.getItem('pwa_prompt_dismissed')) {
      return;
    }

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    if (isIOSDevice) setIsIOS(true);

    const timer = setTimeout(() => {
      if (!sessionStorage.getItem('pwa_prompt_dismissed')) {
        setShowPrompt(true);
      }
    }, 2500);

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (!sessionStorage.getItem('pwa_prompt_dismissed')) {
        setShowPrompt(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', () => {
      setShowPrompt(false);
      setDeferredPrompt(null);
    });

    return () => {
      clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleDismiss = () => {
    sessionStorage.setItem('pwa_prompt_dismissed', 'true');
    setShowPrompt(false);
  };

  const handleInstallClick = async () => {
    if (isIOS) {
      handleDismiss();
      return;
    }
    
    if (!deferredPrompt) {
      import('react-hot-toast').then(({ default: toast }) => {
        toast('Open your browser menu (⋮) and select "Install App"', { icon: 'ℹ️', duration: 4000 });
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
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.95 }}
          style={{
            position: 'fixed',
            bottom: '90px', // Placed safely above mobile bottom navigation
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 99999,
            width: 'calc(100% - 32px)',
            maxWidth: '380px',
            background: 'linear-gradient(135deg, #4f46e5, #6366f1)',
            borderRadius: '16px',
            padding: '1rem 1.1rem',
            boxShadow: '0 12px 30px rgba(79, 70, 229, 0.45)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            gap: '0.85rem'
          }}
        >
          <div style={{ background: 'rgba(255,255,255,0.22)', padding: '0.55rem', borderRadius: '50%', display: 'flex', flexShrink: 0 }}>
            <Download size={22} color="white" />
          </div>
          
          <div style={{ flex: 1, minWidth: 0 }}>
            <h4 style={{ margin: '0 0 0.2rem 0', color: 'white', fontSize: '0.95rem', fontWeight: 600 }}>Install GrievanceIQ</h4>
            {isIOS ? (
              <p style={{ margin: 0, fontSize: '0.78rem', opacity: 0.92, lineHeight: 1.3 }}>
                Tap <strong>Share</strong> then <strong>Add to Home Screen</strong>.
              </p>
            ) : (
              <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.92, lineHeight: 1.3 }}>Add to home screen for native speed.</p>
            )}
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
            {!isIOS && (
              <button 
                onClick={handleInstallClick}
                style={{
                  background: 'white',
                  color: '#4f46e5',
                  border: 'none',
                  padding: '0.45rem 0.85rem',
                  borderRadius: '8px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
                }}
              >
                Install
              </button>
            )}

            {/* Easy-to-tap Large Mobile Close Target */}
            <button 
              onClick={handleDismiss}
              aria-label="Close Install Banner"
              style={{
                background: 'rgba(255,255,255,0.25)',
                color: 'white',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                touchAction: 'manipulation',
                transition: 'background 0.2s',
                flexShrink: 0
              }}
              onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.4)'}
              onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.25)'}
              title="Dismiss"
            >
              <X size={18} strokeWidth={2.5} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

