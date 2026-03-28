import { Outlet, useNavigate } from 'react-router-dom';
import { authClient } from '../../authClient';
import { THEME, Icons } from '../../theme';

export default function AppLayout() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await authClient.signOut();
    window.location.href = "/"; // Force a full wipe and return to Gatekeeper
  };

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: THEME.BG_DARKEST, color: THEME.FG_PRIMARY, fontFamily: 'Inter, system-ui, sans-serif' }}>
      
      {/* GLOBAL HEADER */}
      <header style={{ padding: '16px 32px', backgroundColor: THEME.BG_DARK, borderBottom: `1px solid ${THEME.BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div 
          onClick={() => navigate('/dashboard')}
          style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
        >
          <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: THEME.ACCENT_PRIMARY, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icons.Brain />
          </div>
          <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>BioPro Copilot</h1>
        </div>
        
        <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', border: 'none', color: THEME.FG_SECONDARY, cursor: 'pointer', fontSize: '0.85rem', transition: 'color 0.2s' }}>
          <Icons.LogOut /> Logout
        </button>
      </header>

      {/* DYNAMIC PAGE CONTENT INJECTED HERE */}
      <main style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <Outlet /> 
      </main>
    </div>
  );
}