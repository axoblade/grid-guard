import React from 'react';
import { Transformer } from '../types';
import { Shield, Activity, Search } from 'lucide-react';
import { motion } from 'motion/react';

interface TransformerListProps {
  transformers: Transformer[];
  onSelect: (transformer: Transformer) => void;
  selectedId?: string;
}

const TransformerList: React.FC<TransformerListProps> = ({ transformers, onSelect, selectedId }) => {
  return (
    <div className="flex flex-col h-full bento-card rounded-none border-0 border-r !p-0 overflow-hidden">
      <div className="p-6 border-b border-zinc-800">
        <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-[0.2em] mb-4">
          Asset Inventory
        </h2>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-zinc-500" size={14} />
          <input 
            type="text" 
            placeholder="Search serial no..." 
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg py-2 pl-9 pr-4 text-xs text-zinc-200 outline-none focus:border-emerald-500 transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {transformers.length === 0 ? (
          <div className="p-10 text-center text-zinc-600">
            <Shield className="mx-auto mb-4 opacity-10" size={48} />
            <p className="text-xs font-medium">No assets deployed</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/50">
            {transformers.map(t => (
              <div 
                key={t.id}
                onClick={() => onSelect(t)}
                className={`flex items-center gap-4 p-4 cursor-pointer transition-all ${
                  selectedId === t.id 
                    ? 'bg-zinc-900 border-l-4 border-emerald-500' 
                    : 'hover:bg-zinc-900/50'
                }`}
              >
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  t.status === 'GREEN' ? 'bg-emerald-500' : 
                  t.status === 'ORANGE' ? 'bg-amber-500' : 
                  t.status === 'DRAFT' ? 'bg-zinc-700' : 
                  'bg-rose-500 alert-pulse-rose'
                }`} />
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-bold text-zinc-200 truncate">{t.name}</h4>
                  <p className="text-[10px] text-zinc-500 font-mono mt-0.5">{t.serialNumber}</p>
                  {t.status === 'RED' && t.realTimeHint && (
                    <motion.p 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-[9px] text-rose-500/80 font-bold mt-1 line-clamp-1 italic"
                    >
                      AI: {t.realTimeHint}
                    </motion.p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                   {t.status === 'RED' && (
                     <span className="px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-500 text-[8px] font-black uppercase tracking-widest border border-rose-500/20">
                       CRITICAL
                     </span>
                   )}
                   {t.status === 'DRAFT' && (
                     <span className="px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-500 text-[8px] font-black uppercase tracking-widest border border-zinc-700">
                       RE-INIT
                     </span>
                   )}
                   <span className="text-[9px] font-mono text-zinc-500">
                     {t.currentLocation.latitude.toFixed(2)}, {t.currentLocation.longitude.toFixed(2)}
                   </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TransformerList;
