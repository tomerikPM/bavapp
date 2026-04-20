import { useState, lazy, Suspense } from 'react';

const ElectricalDiagram = lazy(() => import('./ElectricalDiagram.jsx'));
const NmeaDiagram       = lazy(() => import('./NmeaDiagram.jsx'));

const TABS = [
  { id: 'electrical', label: 'Elektrisk 12V / 230V',       component: ElectricalDiagram },
  { id: 'nmea',       label: 'NMEA 2000 / Digital infra',  component: NmeaDiagram },
];

function Spinner() {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', gap:10, color:'#8a8a8a', fontFamily:'Barlow Condensed, sans-serif', fontSize:13, letterSpacing:'.1em', textTransform:'uppercase' }}>
      <div style={{ width:14, height:14, border:'2px solid #e8e8e8', borderTopColor:'#003b7e', borderRadius:'50%', animation:'spin .75s linear infinite' }} />
      Laster diagram…
    </div>
  );
}

export default function App() {
  const [active, setActive] = useState('electrical');
  const ActiveDiagram = TABS.find(t => t.id === active)?.component;

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">Summer<em>.</em></div>
        <nav className="tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`tab-btn${active === t.id ? ' active' : ''}`}
              onClick={() => setActive(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="canvas-wrap">
        <Suspense fallback={<Spinner />}>
          {ActiveDiagram && <ActiveDiagram />}
        </Suspense>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
