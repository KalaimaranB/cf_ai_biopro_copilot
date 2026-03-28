import { useParams, useNavigate } from 'react-router-dom';
import { THEME } from '../theme';

// Mock Data tailored to a synthetic immunology workflow
const MOCK_EXPERIMENTS = [
  { id: 'exp-101', title: 'Flow Cytometry Protocol - T-Cell Activation', status: 'Completed', date: '2 Days Ago' },
  { id: 'exp-102', title: 'CRISPR Knockout Viability Assay', status: 'In Progress', date: 'Today' },
  { id: 'exp-103', title: 'Protein Analyzer Data Parse', status: 'Planning', date: 'Pending' }
];

export default function ProjectDetails() {
  const { projectId } = useParams(); // Grabs the ID from the URL
  const navigate = useNavigate();

  return (
    <div style={{ padding: '40px', width: '100%', overflowY: 'auto' }}>
      
      {/* Navigation Breadcrumb */}
      <div 
        onClick={() => navigate('/dashboard')}
        style={{ color: THEME.ACCENT_PRIMARY, cursor: 'pointer', fontSize: '0.9rem', marginBottom: '16px', display: 'inline-block' }}
      >
        ← Back to Projects Dashboard
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '1.8rem', fontWeight: 600 }}>Project Workspace <span style={{ color: THEME.FG_SECONDARY, fontSize: '1rem', fontWeight: 400 }}>({projectId})</span></h2>
          <p style={{ margin: 0, color: THEME.FG_SECONDARY, fontSize: '0.9rem' }}>Select an experiment to open the Electronic Lab Notebook and Copilot.</p>
        </div>
        <button style={{ padding: '10px 20px', backgroundColor: THEME.ACCENT_PRIMARY, color: '#FFF', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>
          + New Experiment
        </button>
      </div>

      {/* Experiments List */}
      <div style={{ backgroundColor: THEME.BG_DARK, border: `1px solid ${THEME.BORDER}`, borderRadius: '8px', overflow: 'hidden' }}>
        {MOCK_EXPERIMENTS.map((exp, index) => (
          <div 
            key={exp.id}
            onClick={() => navigate(`/experiment/${exp.id}`)}
            style={{ 
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
              padding: '20px 24px', cursor: 'pointer', 
              borderBottom: index === MOCK_EXPERIMENTS.length - 1 ? 'none' : `1px solid ${THEME.BORDER}`,
              backgroundColor: THEME.BG_DARK, transition: 'background 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = THEME.BG_MEDIUM}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = THEME.BG_DARK}
          >
            <div>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '1.05rem', color: THEME.FG_PRIMARY }}>{exp.title}</h3>
              <span style={{ fontSize: '0.85rem', color: THEME.FG_SECONDARY }}>Experiment ID: {exp.id}</span>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
              <span style={{ fontSize: '0.85rem', color: exp.status === 'Completed' ? THEME.ACCENT_PRIMARY : (exp.status === 'In Progress' ? THEME.DNA_PRIMARY : THEME.FG_SECONDARY) }}>
                {exp.status}
              </span>
              <span style={{ fontSize: '0.85rem', color: THEME.FG_SECONDARY, width: '100px', textAlign: 'right' }}>{exp.date}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}