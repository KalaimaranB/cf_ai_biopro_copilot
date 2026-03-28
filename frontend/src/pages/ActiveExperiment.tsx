import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { THEME } from '../theme';
import type { Message } from '../types';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';

// Import our specialized components
import ChatSidebar from '../components/ChatSidebar';
import NotebookEditor from '../components/NotebookEditor';

export default function ActiveExperiment() {
  const { experimentId } = useParams();
  const navigate = useNavigate();
  
  const [mode, setMode] = useState<'general' | 'notebook'>('notebook');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [notebookText, setNotebookText] = useState<string>("Loading lab protocol...");

  // (We will replace these useEffects with real D1 database calls in the next phase)
  useEffect(() => {
    // MOCK FETCH: Pretend we are loading this specific experiment's notes
    setTimeout(() => {
      setNotebookText(`# Experiment: ${experimentId}\n\n### Objective\nLog findings for the current run here.\n\n`);
    }, 500);
  }, [experimentId]);

  const handleSpeechComplete = async (text: string) => {
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setIsLoading(true);
    
    // MOCK AI RESPONSE (Until we wire the backend back up)
    setTimeout(() => {
      const responseText = `I have logged that observation for ${experimentId}. Notebook Entry: ${text}`;
      setMessages(prev => [...prev, { role: 'assistant', content: responseText }]);
      
      if (mode === 'notebook') {
         const timestamp = new Date().toLocaleTimeString();
         setNotebookText(prev => prev + `\n\n### Copilot Entry [${timestamp}]\n${text}`);
      }
      setIsLoading(false);
    }, 1000);
  };

  const { isListening, liveTranscript, startMic, stopMic } = useSpeechRecognition(handleSpeechComplete);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      
      {/* Experiment Sub-Header */}
      <div style={{ padding: '12px 32px', backgroundColor: THEME.BG_MEDIUM, borderBottom: `1px solid ${THEME.BORDER}`, display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button 
          onClick={() => navigate(-1)} // Goes back to the Project Details
          style={{ background: 'transparent', border: 'none', color: THEME.ACCENT_PRIMARY, cursor: 'pointer', fontSize: '0.9rem' }}
        >
          ← Back
        </button>
        <span style={{ color: THEME.FG_SECONDARY }}>|</span>
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 500, color: THEME.FG_PRIMARY }}>Active Run: {experimentId}</h2>
      </div>

      {/* The Split Workspace */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <ChatSidebar 
          messages={messages} 
          liveTranscript={liveTranscript} 
          isLoading={isLoading} 
          isListening={isListening} 
          onStart={startMic} 
          onStop={stopMic} 
          mode={mode} 
        />
        {mode === 'notebook' && (
          <NotebookEditor text={notebookText} setText={setNotebookText} />
        )}
      </div>
    </div>
  );
}