import { useState, useEffect } from 'react';
import { THEME, Icons } from '../theme';

// Set your URLs
const PARSER_URL = 'https://biopro-parser.biopro.workers.dev'; 
const BACKEND_URL = 'https://backend.biopro.workers.dev';

interface Document {
  id: string;
  project_id: string;
  filename: string;
  status: string;
  pages_processed: number;
  uploaded_at: string;
}

interface Project {
  id: string;
  title: string;
}

export default function KnowledgeBase() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState('');
  
  const [creditsUsed, setCreditsUsed] = useState(0);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState('global');
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);

  // --- 1. DATA FETCHING ---
  const fetchDashboardData = async () => {
    setIsLoadingDocs(true);
    try {
      // Fetch total credits
      const statsRes = await fetch(`${BACKEND_URL}/api/knowledge/stats`, { credentials: 'include' });
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setCreditsUsed(statsData.totalCredits || 0);
      }

      // Fetch document roster
      const docsRes = await fetch(`${BACKEND_URL}/api/knowledge/documents`, { credentials: 'include' });
      if (docsRes.ok) {
        const docsData = await docsRes.json();
        setDocuments(docsData.documents || []);
      }

      // Fetch active projects for the dropdown
      const projRes = await fetch(`${BACKEND_URL}/api/projects`, { credentials: 'include' });
      if (projRes.ok) {
        const projData = await projRes.json();
        setProjects(projData.projects || []);
      }
    } catch (err) {
      console.error("Failed to fetch knowledge base data:", err);
    } finally {
      setIsLoadingDocs(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // --- 2. UPLOAD & POLL ---
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setStatusText('Initiating secure proxy upload...');
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('projectId', selectedProject); 

      const uploadRes = await fetch(`${PARSER_URL}/api/parse/upload`, {
        method: 'POST',
        body: formData
      });
      
      if (!uploadRes.ok) throw new Error("Upload failed to connect to microservice.");
      const uploadData = await uploadRes.json();

      setStatusText('Multimodal Vision Engine analyzing document...');
      
      let isDone = false;
      while (!isDone) {
        await new Promise(r => setTimeout(r, 3000)); // Poll every 3 seconds
        
        const pollRes = await fetch(`${PARSER_URL}/api/parse/status?jobId=${uploadData.jobId}&documentId=${uploadData.documentId}`);
        const pollData = await pollRes.json();

        if (pollData.status === 'SUCCESS') {
          setStatusText('Success! Data chunked and embedded into Vectorize.');
          isDone = true;
          // Refresh the UI to show the new document and updated credits!
          fetchDashboardData();
          setTimeout(() => setIsProcessing(false), 3000);
        } else if (pollData.status === 'FAILED') {
          throw new Error("LlamaParse rejected the document.");
        }
      }
    } catch (err) {
      console.error(err);
      setStatusText('Error processing document. Check console.');
      setTimeout(() => setIsProcessing(false), 4000);
    }
  };

  // --- 3. CASCADING DELETE ---
  const handleDelete = async (docId: string, filename: string) => {
    if (!window.confirm(`Are you sure you want to delete "${filename}"? This will permanently erase it from the AI's memory.`)) return;

    try {
      const res = await fetch(`${BACKEND_URL}/api/knowledge/documents?id=${docId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        fetchDashboardData(); // Refresh roster and credits
      }
    } catch (err) {
      console.error("Failed to delete document", err);
    }
  };

  const creditPercentage = Math.min((creditsUsed / 10000) * 100, 100);

  return (
    <div style={{ padding: '40px', color: THEME.FG_PRIMARY, maxWidth: '1000px', margin: '0 auto', overflowY: 'auto' }}>
      
      {/* Header & Stats */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '40px' }}>
        <div>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '1.8rem', fontWeight: 600 }}>Lab Knowledge Base</h2>
          <p style={{ margin: 0, color: THEME.FG_SECONDARY }}>Ingest standard operating procedures and external literature.</p>
        </div>
        
        <div style={{ backgroundColor: THEME.BG_MEDIUM, padding: '16px', borderRadius: '8px', border: `1px solid ${THEME.BORDER}`, minWidth: '220px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.85rem' }}>
            <span>API Credits Used</span>
            <span style={{ color: THEME.DNA_PRIMARY, fontWeight: 600 }}>{creditsUsed} / 10K</span>
          </div>
          <div style={{ height: '6px', backgroundColor: THEME.BG_DARKEST, borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ width: `${creditPercentage}%`, height: '100%', backgroundColor: THEME.DNA_PRIMARY, transition: 'width 0.5s ease' }} />
          </div>
        </div>
      </div>
      
      {/* Upload Dropzone */}
      <div style={{ padding: '40px', border: `2px dashed ${THEME.BORDER}`, borderRadius: '12px', textAlign: 'center', backgroundColor: THEME.BG_DARK, marginBottom: '40px', transition: 'all 0.3s' }}>
        {isProcessing ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div className="pulse-animation" style={{ color: THEME.ACCENT_PRIMARY, marginBottom: '16px' }}>
              <Icons.Brain />
            </div>
            <p style={{ margin: 0, color: THEME.FG_PRIMARY, fontWeight: 500 }}>{statusText}</p>
            <p style={{ margin: '8px 0 0 0', color: THEME.FG_SECONDARY, fontSize: '0.85rem' }}>Please keep this tab open.</p>
          </div>
        ) : (
          <div>
            <div style={{ color: THEME.FG_SECONDARY, marginBottom: '16px' }}><Icons.Notebook /></div>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem' }}>Upload Protocol (PDF)</h3>
            
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
              <select 
                value={selectedProject} 
                onChange={(e) => setSelectedProject(e.target.value)}
                style={{ padding: '10px', borderRadius: '6px', backgroundColor: THEME.BG_MEDIUM, color: THEME.FG_PRIMARY, border: `1px solid ${THEME.BORDER}`, outline: 'none' }}
              >
                <option value="global">Assign: Global (All Projects)</option>
                {projects.map(p => <option key={p.id} value={p.id}>Assign: {p.title}</option>)}
              </select>

              <label style={{ backgroundColor: THEME.ACCENT_PRIMARY, color: '#FFF', padding: '10px 24px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, display: 'inline-block' }}>
                Browse Files
                <input type="file" accept=".pdf" onChange={handleFileUpload} style={{ display: 'none' }} />
              </label>
            </div>
            <p style={{ margin: 0, color: THEME.FG_SECONDARY, fontSize: '0.85rem' }}>The Vision Agent will extract figures, tables, and text for Vectorize.</p>
          </div>
        )}
      </div>

      {/* Document Library Roster */}
      <div>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '1.3rem', borderBottom: `1px solid ${THEME.BORDER}`, paddingBottom: '12px' }}>Document Library</h3>
        
        {isLoadingDocs ? (
          <p style={{ color: THEME.FG_SECONDARY }}>Loading secure document roster...</p>
        ) : documents.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: THEME.FG_SECONDARY, backgroundColor: THEME.BG_DARK, borderRadius: '8px', border: `1px solid ${THEME.BORDER}` }}>
            No documents in the knowledge base. Upload a PDF above.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {documents.map((doc) => (
              <div key={doc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', backgroundColor: THEME.BG_DARK, borderRadius: '8px', border: `1px solid ${THEME.BORDER}` }}>
                
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 600, fontSize: '1.05rem' }}>{doc.filename}</span>
                    {/* Status Badge */}
                    <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px', fontWeight: 600, textTransform: 'uppercase', backgroundColor: doc.status === 'Ready' ? 'rgba(46, 204, 113, 0.1)' : 'rgba(241, 196, 15, 0.1)', color: doc.status === 'Ready' ? '#2ecc71' : '#f1c40f' }}>
                      {doc.status}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '16px', color: THEME.FG_SECONDARY, fontSize: '0.85rem' }}>
                    <span>{new Date(doc.uploaded_at).toLocaleDateString()}</span>
                    <span>•</span>
                    <span>{doc.project_id === 'global' ? 'Global Access' : 'Project Specific'}</span>
                    <span>•</span>
                    <span>Cost: {doc.pages_processed} Credits</span>
                  </div>
                </div>

                <button 
                  onClick={() => handleDelete(doc.id, doc.filename)}
                  style={{ padding: '8px 16px', backgroundColor: 'transparent', color: THEME.ACCENT_DANGER, border: `1px solid ${THEME.BORDER}`, borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s', opacity: 0.8 }}
                  onMouseOver={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.borderColor = THEME.ACCENT_DANGER; }}
                  onMouseOut={(e) => { e.currentTarget.style.opacity = '0.8'; e.currentTarget.style.borderColor = THEME.BORDER; }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}