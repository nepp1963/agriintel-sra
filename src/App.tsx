import { useState } from 'react';
import { CloudLightning, Compass, MapPinned } from 'lucide-react';
import { IrrigationDashboard } from './1-irrigation/components/IrrigationDashboard';
import BagyoTrackPH from './components/BagyoTrackPH';
import { SraFieldDrawer } from './sra/components/SraFieldDrawer';

type ActiveView = 'irrigation' | 'bagyotrack' | 'sra';

export function App() {
  const [activeView, setActiveView] = useState<ActiveView>('irrigation');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="sticky top-0 z-[1100] bg-slate-900/95 backdrop-blur-md border-b border-emerald-900/70 px-4 py-2 flex items-center justify-between gap-3">
        <span className="text-xs font-bold tracking-wide text-emerald-400">
          Agri<span className="text-white">i</span>ntelPH-SRA
        </span>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveView('irrigation')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeView === 'irrigation'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Irrigation &amp; Farm</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveView('bagyotrack')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeView === 'bagyotrack'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <CloudLightning className="w-3.5 h-3.5" />
            <span>BagyoTrack PH</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveView('sra')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeView === 'sra'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <MapPinned className="w-3.5 h-3.5" />
            <span>SRA Field Ops</span>
          </button>
        </div>
      </div>

      {activeView === 'bagyotrack' && (
        <div className="p-3">
          <BagyoTrackPH />
        </div>
      )}

      {activeView === 'sra' && (
        <div className="p-3">
          <SraFieldDrawer />
        </div>
      )}

      {activeView === 'irrigation' && (
        <main>
          <IrrigationDashboard />
        </main>
      )}
    </div>
  );
}

export default App;
