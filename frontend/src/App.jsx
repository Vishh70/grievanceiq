// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/Navbar';
import PageTransition from './components/PageTransition';
import { AnimatePresence } from 'framer-motion';

import Landing        from './pages/Landing';
import Login          from './pages/Login';
import Register       from './pages/Register';
import SubmitComplaint from './pages/SubmitComplaint';
import MyComplaints   from './pages/MyComplaints';
import ComplaintDetail from './pages/ComplaintDetail';
import PublicFeed     from './pages/PublicFeed';
import Leaderboard    from './pages/Leaderboard';
import Profile        from './pages/Profile';
import AdminDashboard from './pages/AdminDashboard';
import AdminLogin     from './pages/AdminLogin';
import { Toaster }    from 'react-hot-toast';
import PWAInstallPrompt from './components/PWAInstallPrompt';

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        {/* Public routes */}
        <Route path="/"         element={<PageTransition><Landing /></PageTransition>} />
        <Route path="/login"    element={<PageTransition><Navbar /><Login /></PageTransition>} />
        <Route path="/register" element={<PageTransition><Navbar /><Register /></PageTransition>} />

        {/* Citizen routes */}
        <Route path="/leaderboard" element={
          <PageTransition><Navbar /><Leaderboard /></PageTransition>
        } />
        <Route path="/profile" element={
          <ProtectedRoute><PageTransition><Navbar /><Profile /></PageTransition></ProtectedRoute>
        } />
        <Route path="/feed" element={
          <ProtectedRoute><PageTransition><Navbar /><PublicFeed /></PageTransition></ProtectedRoute>
        } />
        <Route path="/complaints/new" element={
          <ProtectedRoute><PageTransition><Navbar /><SubmitComplaint /></PageTransition></ProtectedRoute>
        } />
        <Route path="/complaints" element={
          <ProtectedRoute><PageTransition><Navbar /><MyComplaints /></PageTransition></ProtectedRoute>
        } />
        <Route path="/complaints/:id" element={
          <ProtectedRoute><PageTransition><Navbar /><ComplaintDetail /></PageTransition></ProtectedRoute>
        } />

        {/* Admin routes */}
        <Route path="/admin/login" element={<PageTransition><AdminLogin /></PageTransition>} />
        <Route path="/admin" element={
          <ProtectedRoute adminOnly><PageTransition><Navbar /><AdminDashboard /></PageTransition></ProtectedRoute>
        } />

        {/* Default redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Toaster 
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)'
          }
        }}
      />
      <BrowserRouter>
        <AnimatedRoutes />
      </BrowserRouter>
      <PWAInstallPrompt />
    </AuthProvider>
  );
}
