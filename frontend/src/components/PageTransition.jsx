import { motion } from 'framer-motion';

export default function PageTransition({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      style={{ width: '100%', display: 'flex', flexDirection: 'column', minHeight: '100vh' }}
    >
      {children}
    </motion.div>
  );
}
