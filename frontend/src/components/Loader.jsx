// src/components/Loader.jsx
import { motion } from 'framer-motion';

export default function Loader({ text = "Authenticating..." }) {
  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '100vh', 
      background: 'var(--bg-primary)' 
    }}>
      <motion.div
        animate={{ scale: [1, 1.2, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 1.5, ease: "easeInOut", repeat: Infinity }}
        style={{
          fontSize: '4rem',
          lineHeight: 1,
          filter: 'drop-shadow(0 0 20px rgba(99,102,241,0.5))',
          marginBottom: '1.5rem'
        }}
      >
        ⚡
      </motion.div>
      <motion.div 
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 1.5, repeat: Infinity }}
        style={{ 
          fontWeight: 600, 
          letterSpacing: '3px', 
          textTransform: 'uppercase',
          fontSize: '0.9rem',
          color: 'var(--accent)' 
        }}
      >
        {text}
      </motion.div>
      
      <div style={{ 
        width: '150px', 
        height: '3px', 
        background: 'rgba(99,102,241, 0.1)', 
        borderRadius: '3px', 
        marginTop: '1.5rem',
        overflow: 'hidden',
        position: 'relative'
      }}>
        <motion.div
          animate={{ x: ['-100%', '200%'] }}
          transition={{ duration: 1.5, ease: "easeInOut", repeat: Infinity }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '50%',
            height: '100%',
            background: 'linear-gradient(90deg, transparent, var(--accent), transparent)'
          }}
        />
      </div>
    </div>
  );
}
