/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';

const RADIAL_GRID_STYLE = {
  backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)',
  backgroundSize: '32px 32px',
};
const BUTTON_HOVER = { scale: 1.02 };
const BUTTON_TAP = { scale: 0.95 };
const STORAGE_KEY = 'homebase:clicks';

export default function App() {
  const [clicks, setClicks] = useState(() => {
    if (typeof window === 'undefined') return 0;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const n = saved ? Number(saved) : 0;
    return Number.isFinite(n) ? n : 0;
  });
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, String(clicks));
    }
  }, [clicks]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(false), 400);
    return () => clearTimeout(t);
  }, [flash]);

  const handleReset = () => {
    setClicks(0);
    setFlash(true);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col font-sans overflow-hidden border border-zinc-800 relative selection:bg-zinc-700">
      {/* Ambient Background Accents */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-blue-900/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-zinc-800/10 rounded-full blur-[120px]"></div>
        <div className="absolute inset-0 opacity-[0.03]" style={RADIAL_GRID_STYLE}></div>
      </div>

      {/* Main Content Area */}
      <main className="flex-grow flex flex-col items-center justify-center relative z-10 px-8">
        {/* Decorative Frame Elements */}
        <div className="absolute top-12 left-12 w-24 h-24 border-t border-l border-zinc-800 opacity-50 hidden sm:block"></div>
        <div className="absolute top-12 right-12 w-24 h-24 border-t border-r border-zinc-800 opacity-50 hidden sm:block"></div>
        <div className="absolute bottom-12 left-12 w-24 h-24 border-b border-l border-zinc-800 opacity-50 hidden sm:block"></div>
        <div className="absolute bottom-12 right-12 w-24 h-24 border-b border-r border-zinc-800 opacity-50 hidden sm:block"></div>

        {/* Header Label */}
        <div className="mb-16 text-center">
          <p className="text-[10px] uppercase tracking-[0.6em] text-zinc-500 font-medium mb-3">Primary Command Interface</p>
          <div className="h-[1px] w-48 bg-gradient-to-r from-transparent via-zinc-700 to-transparent mx-auto"></div>
        </div>

        {/* The Central Action Button */}
        <div className="relative group">
          {/* Button Glow Effect */}
          <div className="absolute inset-0 bg-white/5 rounded-2xl blur-xl group-hover:bg-white/10 transition-all duration-500"></div>
          
          <motion.button
            id="homebase-button"
            whileHover={BUTTON_HOVER}
            whileTap={BUTTON_TAP}
            onClick={() => setClicks(prev => prev + 1)}
            className="relative w-64 h-24 bg-zinc-900 border border-zinc-700 rounded-xl flex items-center justify-center shadow-2xl overflow-hidden cursor-pointer group-active:scale-95 transition-transform"
          >
            {/* Inner bevel */}
            <div className="absolute inset-[1px] border border-white/5 rounded-[10px] pointer-events-none"></div>
            
            {/* Label */}
            <span className="text-2xl font-bold tracking-[0.25em] uppercase text-zinc-100 group-hover:text-white transition-colors">
              Homebase
            </span>

            {/* Decorative corner pips */}
            <div className="absolute top-2 left-2 w-1 h-1 bg-zinc-700"></div>
            <div className="absolute top-2 right-2 w-1 h-1 bg-zinc-700"></div>
            <div className="absolute bottom-2 left-2 w-1 h-1 bg-zinc-700"></div>
            <div className="absolute bottom-2 right-2 w-1 h-1 bg-zinc-700"></div>
          </motion.button>
        </div>

        {/* Secondary Descriptor */}
        <div className="mt-12 text-center">
          <p className="text-[11px] italic font-serif text-zinc-600 tracking-widest">Bridge Connection: Active</p>
        </div>
      </main>

      {/* Footer Status Bar (Strip) */}
      <footer 
        id="footer-status-strip"
        className="h-12 bg-[#0a0a0a] border-t border-zinc-800 flex items-center justify-between px-6 sm:px-10 relative z-20"
      >
        {/* Left Label: Version */}
        <div id="left-label" className="flex items-center gap-3">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse"></div>
          <span className="font-mono text-[11px] font-semibold text-zinc-400 tracking-wider uppercase whitespace-nowrap">
            Homebase <span className="text-zinc-500 font-normal">v0.1.0</span>
          </span>
        </div>

        {/* Right Label: Clicks Counter (double-click to reset) */}
        <div
          id="right-label"
          className="flex items-center gap-4 cursor-pointer select-none"
          onDoubleClick={handleReset}
          title="Double-click to reset"
        >
          <div className="h-4 w-[1px] bg-zinc-800 hidden sm:block"></div>
          <div className="font-mono text-[11px] tracking-wider text-zinc-400 uppercase whitespace-nowrap">
            clicks:{' '}
            <span
              className={`font-bold inline-block min-w-[2ch] transition-colors duration-300 ${flash ? 'text-green-400' : 'text-white'}`}
            >
              {clicks}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
