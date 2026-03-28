import { THEME } from '../theme';

interface EditorProps {
  text: string;
  setText: (t: string) => void;
}

export default function NotebookEditor({ text, setText }: EditorProps) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: THEME.BG_DARK }}>
      <div style={{ padding: '12px 24px', borderBottom: `1px solid ${THEME.BORDER}`, backgroundColor: THEME.BG_MEDIUM, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.85rem', color: THEME.FG_SECONDARY, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Experiment Editor</span>
        <span style={{ fontSize: '0.75rem', backgroundColor: THEME.BG_LIGHT, padding: '4px 8px', borderRadius: '4px', color: THEME.FG_SECONDARY }}>Auto-saving to D1...</span>
      </div>
      <textarea 
        value={text} 
        onChange={(e) => setText(e.target.value)} 
        style={{ flex: 1, backgroundColor: 'transparent', color: THEME.FG_PRIMARY, border: 'none', padding: '32px', fontSize: '1rem', fontFamily: 'monospace', lineHeight: '1.6', resize: 'none', outline: 'none' }} 
        placeholder="Your lab notes will appear here..." 
      />
    </div>
  );
}