import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { authClient } from './authClient';
import { THEME } from './theme';

// Pages & Layouts
import LoginScreen from './components/LoginScreen';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import ProjectDetails from './pages/ProjectDetails';   
import ActiveExperiment from './pages/ActiveExperiment';

export default function App() {
  const { data: session, isPending } = authClient.useSession();

  // Show a loading state while Better-Auth checks the cookie
  if (isPending) {
    return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.BG_DARKEST, color: THEME.FG_PRIMARY }}>Initializing Secure Environment...</div>;
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* PUBLIC ROUTE: The Gatekeeper */}
        <Route 
          path="/" 
          element={session ? <Navigate to="/dashboard" replace /> : <LoginScreen />} 
        />

        {/* PROTECTED ROUTES: Wrapped in the AppLayout Header */}
        <Route element={session ? <AppLayout /> : <Navigate to="/" replace />}>
          <Route path="/dashboard" element={<Dashboard />} />
          
          {/* THE FIX: Actually rendering the pages we built! */}
          <Route path="/project/:projectId" element={<ProjectDetails />} />
          <Route path="/experiment/:experimentId" element={<ActiveExperiment />} />
        </Route>

        {/* CATCH ALL: Send unknown URLs back to the dashboard */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}