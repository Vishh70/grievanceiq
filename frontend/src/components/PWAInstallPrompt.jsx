// src/components/PWAInstallPrompt.jsx
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X } from 'lucide-react';

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);

  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if it's already installed (standalone mode)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (isStandalone) return;

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    if (isIOSDevice) setIsIOS(true);

    // ALWAYS show the prompt after 2.5 seconds so the user can physically see the UI!
    const timer = setTimeout(() => {
      setShowPrompt(true);
    }, 2500);

    // Listen for Android/Chrome native event to capture the actual install trigger
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true); // Show immediately if native event fires
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', () => {
      setShowPrompt(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isIOS) {
      // We can't trigger install on iOS programmatically, just hide the prompt
      setShowPrompt(false);
      return;
    }
    
    if (!deferredPrompt) {
      import('react-hot-toast').then(({ default: toast }) => {
        toast('Open your browser menu (⋮) and select "Install App"', { icon: 'ℹ️', duration: 4000 });
      });
      setShowPrompt(false);
      return;
    }

    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  return (
    <AnimatePresence>
      {showPrompt && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          style={{
            position: 'fixed',
            bottom: '80px', // Above mobile nav if present
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            width: '90%',
            maxWidth: '400px',
            background: 'linear-gradient(135deg, var(--accent), var(--accent-light))',
            borderRadius: '16px',
            padding: '1rem',
            boxShadow: '0 10px 25px rgba(99,102,241,0.4)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem'
          }}
        >
          <div style={{ background: 'rgba(255,255,255,0.2)', padding: '0.5rem', borderRadius: '50%', display: 'flex' }}>
            <Download size={24} color="white" />
          </div>
          
          <div style={{ flex: 1 }}>
            <h4 style={{ margin: '0 0 0.25rem 0', color: 'white' }}>Install GrievanceIQ</h4>
            {isIOS ? (
              <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.9 }}>
                Tap the <strong>Share</strong> button and select <strong>Add to Home Screen</strong> to install.
              </p>
            ) : (
              <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.9 }}>Add to home screen for a native experience.</p>
            )}
          </div>
          
          {!isIOS && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <button 
                onClick={handleInstallClick}
                style={{
                  background: 'white',
                  color: 'var(--accent-dark)',
                  border: 'none',
                  padding: '0.4rem 0.8rem',
                  borderRadius: '8px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                Install
              </button>
            </div>
          )}

          <button 
            onClick={() => setShowPrompt(false)}
            style={{
              position: 'absolute',
              top: '-10px',
              right: '-10px',
              background: 'var(--bg-card)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
              borderRadius: '50%',
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <X size={14} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
