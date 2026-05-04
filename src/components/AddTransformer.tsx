import React, { useState } from 'react';
import { nokiaService } from '../services/nokiaService';
import { auth } from '../services/firebaseService';
import { Transformer, TransformerStatus, SubscriptionPlan } from '../types';
import { MapPin, Phone, Shield, Loader2, AlertCircle, CreditCard, CheckCircle, Package } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AddTransformerProps {
  onAdd: (transformer: Transformer) => void;
  onClose: () => void;
  initialData?: Transformer;
}

const AddTransformer: React.FC<AddTransformerProps> = ({ onAdd, onClose, initialData }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'form' | 'payment'>('form');
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    serialNumber: initialData?.serialNumber || '',
    phoneNumber: initialData?.phoneNumber || '',
    safeRadius: initialData?.safeRadius || 50,
    alertPhone: initialData?.alertPhoneNumbers[0] || ''
  });
  const [pendingTransformer, setPendingTransformer] = useState<Transformer | null>(null);

  const calculateProratedAmount = () => {
    const monthlyAmount = Number(import.meta.env.VITE_PLAN_MONTHLY_DEVICE_AMOUNT) || 30;
    const now = new Date();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const totalDays = endOfMonth.getDate();
    const remainingDays = totalDays - now.getDate() + 1;
    return (remainingDays / totalDays) * monthlyAmount;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // 1. Get SIM Location (Mandatory as per requirements)
      const locationData = await nokiaService.getSimLocation(formData.phoneNumber);
      
      // 2. Check SIM Swap (Bonus check)
      const swapData = await nokiaService.checkSimSwap(formData.phoneNumber);

      const newTransformer: Transformer = {
        id: initialData?.id || Math.random().toString(36).substr(2, 9),
        name: formData.name,
        serialNumber: formData.serialNumber,
        phoneNumber: formData.phoneNumber,
        ownerId: auth.currentUser?.uid || 'anonymous',
        registrationLocation: {
          latitude: locationData.latitude,
          longitude: locationData.longitude
        },
        currentLocation: {
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          lastUpdated: new Date().toISOString()
        },
        safeRadius: formData.safeRadius,
        status: TransformerStatus.GREEN,
        alertPhoneNumbers: [formData.alertPhone],
        simSwapHistory: {
          lastSwapped: locationData.lastLocationTime,
          isFraudPotential: swapData.swapped
        }
      };

      if (initialData) {
        onAdd(newTransformer);
        onClose();
      } else {
        setPendingTransformer(newTransformer);
        setStep('payment');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || "SIM location could not be retrieved. Hardware registration blocked.");
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentConfirm = async () => {
    if (!pendingTransformer) return;
    setLoading(true);
    try {
      onAdd(pendingTransformer);
      onClose();
    } catch (err) {
      setError("Payment processing failed. Try again.");
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-[2.5rem] overflow-hidden shadow-2xl"
      >
        <div className="p-8 border-b border-zinc-800 bg-zinc-900/50">
          <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
            {step === 'form' ? (
              <>
                <Shield className="text-emerald-500" size={20} />
                {initialData ? 'Re-Initialize Asset' : 'Asset Provisioning'}
              </>
            ) : (
              <>
                <CreditCard className="text-emerald-500" size={20} />
                Secure Checkout
              </>
            )}
          </h3>
          <p className="text-[10px] text-zinc-500 mt-1 uppercase tracking-[0.2em] leading-relaxed">
            {step === 'form' ? 'Networkascode Retrieval Protocol' : 'Prorated Consumption Settlement'}
          </p>
        </div>

        <AnimatePresence mode="wait">
          {step === 'form' ? (
            <motion.form 
              key="form"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              onSubmit={handleSubmit} 
              className="p-8 space-y-6"
            >
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Asset Identifier</label>
                <input 
                  required
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-5 py-4 text-sm text-zinc-200 focus:border-emerald-500 outline-none transition-all placeholder:text-zinc-700 font-medium"
                  placeholder="e.g. SUBSTATION_ALPHA_X"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Serial Code</label>
                  <input 
                    required
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-5 py-4 text-sm text-zinc-200 font-mono focus:border-emerald-500 outline-none transition-all"
                    placeholder="TX-000"
                    value={formData.serialNumber}
                    onChange={e => setFormData({...formData, serialNumber: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">SIM Phone</label>
                  <input 
                    required
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-5 py-4 text-sm text-zinc-200 font-mono focus:border-emerald-500 outline-none transition-all"
                    placeholder="+254..."
                    value={formData.phoneNumber}
                    onChange={e => setFormData({...formData, phoneNumber: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Alert SMS Destination</label>
                <input 
                  required
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-5 py-4 text-sm text-zinc-200 font-mono focus:border-emerald-500 outline-none transition-all"
                  placeholder="+254..."
                  value={formData.alertPhone}
                  onChange={e => setFormData({...formData, alertPhone: e.target.value})}
                />
              </div>

              {error && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-start gap-4">
                  <AlertCircle className="text-rose-500 shrink-0" size={18} />
                  <p className="text-[11px] text-rose-500 leading-relaxed font-bold uppercase">{error}</p>
                </div>
              )}

              <div className="pt-4 flex gap-4">
                <button 
                  type="button" 
                  onClick={onClose}
                  className="px-6 py-4 text-xs font-bold text-zinc-500 hover:text-zinc-100 transition-colors uppercase tracking-widest"
                >
                  Abort
                </button>
                <button 
                  disabled={loading}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 text-zinc-950 font-black py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-xl shadow-emerald-500/10 uppercase tracking-tighter"
                >
                  {loading ? (
                    <>
                      <Loader2 className="animate-spin" size={20} />
                      <span>SECURE SYNC...</span>
                    </>
                  ) : (
                    initialData ? 'RE-INITIALIZE ASSET' : 'VERIFY & CONTINUE'
                  )}
                </button>
              </div>
            </motion.form>
          ) : (
            <motion.div 
              key="payment"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-8 space-y-6"
            >
              <div className="p-6 bg-zinc-950 border border-zinc-800 rounded-3xl space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">Activation Fee</p>
                    <p className="text-2xl font-mono text-zinc-100 mt-1">${calculateProratedAmount().toFixed(2)}</p>
                  </div>
                  <Package className="text-zinc-700" size={32} />
                </div>
                <div className="h-px bg-zinc-800" />
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[10px] text-zinc-400 uppercase font-black">
                    <CheckCircle size={10} className="text-emerald-500" />
                    SIM Verified
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-zinc-400 uppercase font-black">
                    <CheckCircle size={10} className="text-emerald-500" />
                    Geofence Ready
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 flex items-center gap-4">
                <div className="w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center">
                  <CreditCard size={18} className="text-zinc-400" />
                </div>
                <div>
                  <p className="text-[10px] text-zinc-100 font-bold uppercase tracking-wider">Default Payment Method</p>
                  <p className="text-[9px] text-zinc-500 font-mono tracking-widest">•••• •••• •••• 4242</p>
                </div>
              </div>

              <div className="pt-4 flex gap-4">
                <button 
                  type="button" 
                  onClick={() => setStep('form')}
                  className="px-6 py-4 text-xs font-bold text-zinc-500 hover:text-zinc-100 transition-colors uppercase tracking-widest"
                >
                  Back
                </button>
                <button 
                  onClick={handlePaymentConfirm}
                  disabled={loading}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 text-zinc-950 font-black py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-xl shadow-emerald-500/10 uppercase tracking-tighter"
                >
                  {loading ? (
                    <>
                      <Loader2 className="animate-spin" size={20} />
                      <span>PROCESSING...</span>
                    </>
                  ) : (
                    'CONFIRM & PAY'
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default AddTransformer;
