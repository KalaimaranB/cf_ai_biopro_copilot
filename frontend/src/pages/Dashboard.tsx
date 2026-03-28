import { useNavigate } from 'react-router-dom';
import { THEME } from '../theme';

// Temporary Mock Data (We will replace this with a D1 fetch later)
const MOCK_PROJECTS = [
  { id: 'proj-001', title: 'CAR-T Cell Receptor Design', experiments: 4, lastActive: '2 hours ago' },
  { id: 'proj-002', title: 'CRISPR Cas9 Off-Target Analysis', experiments: 1, lastActive: 'Yesterday' },
  { id: 'proj-003', title: 'Protein Folding Simulation', experiments: 12, lastActive: '3 days ago' },
];

export default function Dashboard() {
  const navigate = useNavigate();

  return (
    <div style={{ padding: '40px', width: '100%', overflowY: 'auto' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '1.8rem', fontWeight: 600 }}>Active Projects</h2>
          <p style={{ margin: 0, color: THEME.FG_SECONDARY, fontSize: '0.9rem' }}>Select a research project to view its experiments and access the Copilot.</p>
        </div>
        
        <button style={{ padding: '10px 20px', backgroundColor: THEME.ACCENT_PRIMARY, color: '#FFF', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>
          + New Project
        </button>
      </div>

      {/* PROJECT GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
        {MOCK_PROJECTS.map((project) => (
          <div 
            key={project.id}
            onClick={() => navigate(`/project/${project.id}`)}
            style={{ backgroundColor: THEME.BG_DARK, border: `1px solid ${THEME.BORDER}`, borderRadius: '8px', padding: '24px', cursor: 'pointer', transition: 'transform 0.2s, borderColor 0.2s' }}
            onMouseOver={(e) => e.currentTarget.style.borderColor = THEME.ACCENT_PRIMARY}
            onMouseOut={(e) => e.currentTarget.style.borderColor = THEME.BORDER}
          >
            <h3 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', color: THEME.FG_PRIMARY }}>{project.title}</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: THEME.FG_SECONDARY, fontSize: '0.85rem' }}>
              <span>{project.experiments} Experiments</span>
              <span>Updated {project.lastActive}</span>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}