import React from 'react';
import { Transformer } from '../types';
import { MapPin, Phone, ShieldAlert, Cpu, Calendar, History, TrendingUp, AlertCircle, X, Zap } from 'lucide-react';
import { motion } from 'motion/react';

interface TransformerDetailsProps {
  transformer: Transformer;
  onClose: () => void;
  onResolve?: (id: string) => void;
}

const TransformerDetails: React.FC<TransformerDetailsProps> = ({ transformer, onClose, onResolve }) => {
  const isRed = transformer.status === 'RED';
  const isOrange = transformer.status === 'ORANGE';
  const isDraft = transformer.status === 'DRAFT';

  return (
    <motion.div 
      initial={{ x: 450 }}
      animate={{ x: 0 }}
      exit={{ x: 450 }}
      className="fixed right-0 top-0 h-full w-[450px] bg-zinc-950/80 backdrop-blur-2xl border-l border-zinc-800 z-50 shadow-[-50px_0px_100px_rgba(0,0,0,0.5)] flex flex-col"
    >
      <div className="p-8 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
        <div>
          <h2 className="text-xl font-bold text-zinc-100">{transformer.name}</h2>
          <p className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] mt-1 font-mono">{transformer.serialNumber}</p>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-xl transition-colors text-zinc-500 hover:text-zinc-100">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-8">
        {/* Status Card */}
        <div className={`p-6 rounded-3xl border flex items-center gap-5 ${
          isRed ? 'bg-rose-500/5 border-rose-500/20' : 
          isOrange ? 'bg-amber-500/5 border-amber-500/20' : 
          'bg-emerald-500/5 border-emerald-500/20'
        }`}>
          <div className={`p-3 rounded-2xl ${
            isRed ? 'bg-rose-500 text-zinc-950' : 
            isOrange ? 'bg-amber-500 text-zinc-950' : 
            'bg-emerald-500 text-zinc-950'
          }`}>
            {isRed ? <ShieldAlert size={24} /> : <Cpu size={24} />}
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Operational Health</p>
            <p className={`text-2xl font-black ${
              isRed ? 'text-rose-500' : isOrange ? 'text-amber-500' : isDraft ? 'text-zinc-500' : 'text-emerald-500'
            }`}>{transformer.status}</p>
          </div>
        </div>

        {/* Resolve Action for RED status */}
        {isRed && (
          <div className="p-6 rounded-3xl border border-rose-500/20 bg-zinc-950 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <ShieldAlert size={18} className="text-rose-500 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-zinc-100">Manual Resolution Required</p>
                <p className="text-[11px] text-zinc-500 mt-1">This asset is in a critical loop. Mark as resolved to return it to DRAFT state for re-initialization.</p>
              </div>
            </div>
            <button 
              onClick={() => onResolve?.(transformer.id)}
              className="w-full py-3 bg-rose-500 text-zinc-950 font-bold rounded-2xl hover:bg-rose-400 transition-all shadow-lg shadow-rose-500/20 active:scale-95"
            >
              MARK AS RESOLVED
            </button>
          </div>
        )}

        {/* AI Insight Section */}
        {transformer.riskRating !== undefined && (
          <div className="bento-card bg-zinc-900/50 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                <TrendingUp size={14} className="text-blue-500" />
                AI Threat Analysis
              </h4>
              <span className={`text-2xl font-mono font-bold ${
                transformer.riskRating > 70 ? 'text-rose-500' : 
                transformer.riskRating > 30 ? 'text-amber-500' : 
                'text-emerald-500'
              }`}>
                {transformer.riskRating}%
              </span>
            </div>
            <div className="w-full bg-zinc-950 h-1 rounded-full overflow-hidden">
               <motion.div 
                 initial={{ width: 0 }}
                 animate={{ width: `${transformer.riskRating}%` }}
                 className={`h-full ${
                  transformer.riskRating > 70 ? 'bg-rose-500' : 
                  transformer.riskRating > 30 ? 'bg-amber-500' : 
                  'bg-emerald-500'
                }`}
               />
            </div>
            <p className="text-sm text-zinc-400 leading-relaxed italic pr-4">
              "{transformer.riskAnalysis}"
            </p>
            {transformer.realTimeHint && (
              <div className="mt-4 p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-start gap-3">
                <Zap size={16} className="text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Tactical Hint</p>
                  <p className="text-xs text-blue-100 font-medium mt-1 leading-snug">
                    {transformer.realTimeHint}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Details Grid */}
        <div className="grid grid-cols-2 gap-4">
           <div className="bento-card bg-zinc-900/20 p-5 space-y-3">
              <Phone size={16} className="text-zinc-500" />
              <div>
                <p className="text-[9px] font-bold text-zinc-600 uppercase">SIM Endpoint</p>
                <p className="text-xs font-mono text-zinc-300 truncate mt-1">{transformer.phoneNumber}</p>
              </div>
           </div>
           <div className="bento-card bg-zinc-900/20 p-5 space-y-3">
              <History size={16} className="text-zinc-500" />
              <div>
                <p className="text-[9px] font-bold text-zinc-600 uppercase">Last Verification</p>
                <p className="text-xs text-zinc-300 mt-1">{new Date(transformer.currentLocation.lastUpdated).toLocaleTimeString()}</p>
              </div>
           </div>
        </div>

        {/* Fraud Alert */}
        {transformer.simSwapHistory.isFraudPotential && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-start gap-4">
            <AlertCircle size={20} className="text-rose-500 shrink-0" />
            <div>
              <p className="text-xs font-bold text-rose-500 uppercase tracking-wider">Security Breach Detected</p>
              <p className="text-[11px] text-rose-500/70 mt-1">Potential SIM Swap fraud detected on this endpoint. Verification required.</p>
            </div>
          </div>
        )}

        {/* Location Section */}
        <div className="bento-card bg-zinc-950 p-6 space-y-4">
          <h4 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest flex items-center gap-2">
            <MapPin size={14} /> Geospatial Coordinates
          </h4>
          <div className="space-y-4 font-mono text-xs">
            <div className="flex justify-between items-center pb-3 border-b border-zinc-900">
               <span className="text-zinc-600 uppercase text-[9px]">Registered</span>
               <span className="text-zinc-400">{transformer.registrationLocation.latitude.toFixed(6)}, {transformer.registrationLocation.longitude.toFixed(6)}</span>
            </div>
            <div className="flex justify-between items-center">
               <span className="text-zinc-600 uppercase text-[9px]">Current</span>
               <span className={isRed ? 'text-rose-500 font-bold' : 'text-zinc-400'}>
                 {transformer.currentLocation.latitude.toFixed(6)}, {transformer.currentLocation.longitude.toFixed(6)}
               </span>
            </div>
          </div>
        </div>

        {/* Maintenance */}
        <div className="bento-card bg-emerald-500/5 border-emerald-500/10 flex items-center justify-between">
           <div className="flex items-center gap-4">
              <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-500">
                <Calendar size={18} />
              </div>
              <div>
                <p className="text-[9px] font-bold text-zinc-600 uppercase">Maintenance Job</p>
                <p className="text-xs font-bold text-zinc-300">{transformer.maintenanceSchedule?.nextMaintenance || 'Unscheduled'}</p>
              </div>
           </div>
           <button className="text-[10px] font-bold text-emerald-500 hover:underline">SCHEDULE</button>
        </div>
      </div>
    </motion.div>
  );
};

export default TransformerDetails;
