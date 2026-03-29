import { useState } from 'react';
import { authClient } from '../authClient';
import { THEME, Icons } from '../theme';

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      // This automatically redirects the user to Google, then back to your app!
      await authClient.signIn.social({
          provider: "google",
          callbackURL: window.location.origin, // This ensures it stays on the domain you're currently visiting
      });
    } catch (err: any) {
      setError("Failed to initialize Google Secure Session.");
      setLoading(false);
    }
  };

  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.BG_DARKEST, color: THEME.FG_PRIMARY }}>
      <div style={{ width: '400px', padding: '40px', backgroundColor: THEME.BG_DARK, borderRadius: '12px', border: `1px solid ${THEME.BORDER}`, textAlign: 'center' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '30px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: THEME.ACCENT_PRIMARY, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.Brain /></div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 600 }}>BioPro Access</h1>
        </div>

        <p style={{ color: THEME.FG_SECONDARY, fontSize: '0.9rem', marginBottom: '24px' }}>
          Authenticate using your verified researcher credentials.
        </p>

        {error && <div style={{ color: THEME.ACCENT_DANGER, fontSize: '0.85rem', marginBottom: '16px' }}>{error}</div>}

        <button 
          onClick={handleGoogleSignIn} 
          disabled={loading} 
          style={{ width: '100%', padding: '12px', borderRadius: '6px', border: `1px solid ${THEME.BORDER}`, backgroundColor: THEME.BG_MEDIUM, color: THEME.FG_PRIMARY, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', transition: 'background 0.2s' }}
        >
          {/* Simple Google G SVG */}
          <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          {loading ? 'Redirecting...' : 'Sign in with Google'}
        </button>

      </div>
    </div>
  );
}