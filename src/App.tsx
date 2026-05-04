import React, { useState, useEffect } from 'react';
import { Transformer, TransformerStatus, Alert, BillingInfo, SubscriptionPlan } from './types';
import TransformerList from './components/TransformerList';
import TransformerDetails from './components/TransformerDetails';
import MapboxComponent from './components/MapboxComponent';
import AddTransformer from './components/AddTransformer';
import BillingModule from './components/BillingModule';
import { nokiaService } from './services/nokiaService';
import { smsService } from './services/smsService';
import { geminiService } from './services/geminiService';
import { firebaseService, auth } from './services/firebaseService';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, addDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './services/firebaseService';
import { Plus, Bell, Settings, Radio, Zap, LogIn, Shield, ShieldAlert, Map as MapIcon, Box, Activity, CreditCard } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [transformers, setTransformers] = useState<Transformer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [transformerToEdit, setTransformerToEdit] = useState<Transformer | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'map' | 'inventory' | 'billing'>('map');
  const [retryQueue, setRetryQueue] = useState<{ id: string; nextTry: number }[]>([]);
  const [securityAlert, setSecurityAlert] = useState<{ id: string; name: string; type: 'BREACH' | 'SIM_SWAP' } | null>(null);
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const alarmIntervalRef = React.useRef<any>(null);
  const transformersRef = React.useRef(transformers);

  useEffect(() => {
    const handleInteraction = () => {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      // Remove all listeners after first interaction
      ['click', 'mousedown', 'keydown', 'touchstart'].forEach(type => {
        window.removeEventListener(type, handleInteraction);
      });
    };

    ['click', 'mousedown', 'keydown', 'touchstart'].forEach(type => {
      window.addEventListener(type, handleInteraction, { once: true });
    });

    // Immediate creation attempt (suspended by default until interaction)
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
    } catch (e) {
      console.warn("Auto-audio initialization blocked, awaiting user interaction.");
    }

    return () => {
      ['click', 'mousedown', 'keydown', 'touchstart'].forEach(type => {
        window.removeEventListener(type, handleInteraction);
      });
    };
  }, []);

  useEffect(() => {
    const isCritical = transformers.some(t => t.status === TransformerStatus.RED);
    if (isCritical) {
      if (!alarmIntervalRef.current) startAlarm();
    } else {
      stopAlarm();
    }
  }, [transformers]);

  const startAlarm = () => {
    if (alarmIntervalRef.current) return;
    
    alarmIntervalRef.current = setInterval(() => {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'suspended') return;
      
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
      
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    }, 500);
  };

  const stopAlarm = () => {
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
  };

  const selectedTransformer = transformers.find(t => t.id === selectedId) || null;

  // 1. Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Reconciliation: Switch plan if period ended
        const billingRef = doc(db, 'billing', u.uid);
        const billingSnap = await getDoc(billingRef);
        let currentBilling: BillingInfo | null = null;

        if (billingSnap.exists()) {
          currentBilling = billingSnap.data() as BillingInfo;
          // Check for period end / upgrade
          if (currentBilling.upcomingPlan && new Date(currentBilling.periodEnd) <= new Date()) {
            currentBilling = {
              ...currentBilling,
              currentPlan: currentBilling.upcomingPlan,
              periodStart: new Date().toISOString(),
              periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              upcomingPlan: undefined
            };
            await setDoc(billingRef, currentBilling);
          }
        } else {
          // Initialize default plan
          currentBilling = {
            currentPlan: SubscriptionPlan.PAY_AS_YOU_GO,
            status: 'active',
            periodStart: new Date().toISOString(),
            periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            cancelAtPeriodEnd: false
          };
          await setDoc(billingRef, currentBilling);

          // Mark existing devices as paid for initial settlement
          // We'll calculate this after the transformers listener finishes or by checking current data
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Data Listener (Conditional on Auth)
  useEffect(() => {
    if (!user) {
      setTransformers([]);
      return;
    }
    const unsubscribe = firebaseService.listenTransformers((data) => {
      setTransformers(data);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    transformersRef.current = transformers;
  }, [transformers]);

  // Periodic Monitoring Logic with Sequence: 1. Get Loc, 2. Verify, 3. Conditional Swap, 4. Retry
  useEffect(() => {
    if (!user) return;

    const performCheck = async (t: Transformer) => {
      // 0. Skip Drafts
      if (t.status === TransformerStatus.DRAFT) return;

      try {
        console.log(`[Security Scan] Starting check for ${t.name} (${t.phoneNumber})`);
        
        // 1. Get Location
        const loc = await nokiaService.getSimLocation(t.phoneNumber);
        
        // 2. Verify Location
        const verification = await nokiaService.verifyLocation(
          t.phoneNumber, 
          t.registrationLocation, 
          t.safeRadius
        );

        const dist = calculateDistance(
          t.registrationLocation.latitude, 
          t.registrationLocation.longitude, 
          loc.latitude, 
          loc.longitude
        );

        let newStatus = TransformerStatus.GREEN;
        // Sticky RED
        if (t.status === TransformerStatus.RED) {
          newStatus = TransformerStatus.RED;
        }

        let updates: Partial<Transformer> = {
          currentLocation: {
            latitude: loc.latitude,
            longitude: loc.longitude,
            lastUpdated: new Date().toISOString()
          }
        };

        // Determine if we need to check for SIM swap
        const locationMismatch = !verification.verificationResult || dist > 50;
        
        // Always process RED assets in the loop, or check locationMismatch for others
        if (locationMismatch || t.status === TransformerStatus.RED) {
          console.warn(`[Security Alert] Incident check for ${t.name}. Status: ${t.status}`);
          const swapResult = await nokiaService.checkSimSwap(t.phoneNumber);
          
          // Determine status if not already RED
          if (t.status !== TransformerStatus.RED) {
            if (swapResult.swapped || dist > 100) {
              newStatus = TransformerStatus.RED;
            } else {
              newStatus = TransformerStatus.ORANGE;
            }
          }

          // Trigger Security Awareness (Alerts + AI)
          // For RED assets, we always process unless special conditions apply, but user said "in a loop"
          const wasGreen = t.status === TransformerStatus.GREEN;
          const isStatusUpgrade = t.status === TransformerStatus.ORANGE && newStatus === TransformerStatus.RED;
          const isNewSwap = swapResult.swapped && !t.simSwapHistory.isFraudPotential;
          const isRedLoop = t.status === TransformerStatus.RED;
          const needsAI = !t.riskAnalysis || wasGreen || isStatusUpgrade || isNewSwap || isRedLoop;

          if (needsAI) {
            console.log(`[Security Event] Alerting for ${t.name}. Type: ${swapResult.swapped ? 'SIM SWAP' : 'BREACH'}`);
            
            // Only show pop-up alert if it's a NEW transition to RED or a NEW swap
            if ((wasGreen && newStatus === TransformerStatus.RED) || isStatusUpgrade || isNewSwap) {
              setSecurityAlert({ 
                id: t.id, 
                name: t.name, 
                type: swapResult.swapped ? 'SIM_SWAP' : 'BREACH' 
              });
            }

            let alertMsg = `GridGuard SECURITY: ${t.name} - ${newStatus} alert.`;
            if (swapResult.swapped) alertMsg += " SIM SWAP DETECTED (Pattern 4A - Stolen Asset).";
            if (dist > 50) alertMsg += ` Asset moved ${dist.toFixed(0)}m from base.`;

            await smsService.sendAlert(t.alertPhoneNumbers[0], alertMsg);

            // Prepare object for AI to analyze
            const updatedObj = { 
              ...t, 
              status: newStatus,
              riskRating: t.riskRating || 0,
              simSwapHistory: { 
                ...t.simSwapHistory, 
                isFraudPotential: swapResult.swapped,
                lastSwapped: swapResult.swapped ? new Date().toISOString() : t.simSwapHistory.lastSwapped
              }
            };

            const aiResult = await geminiService.analyzeRisk(updatedObj, []);
            
            updates = {
              ...updates,
              riskRating: aiResult.rating,
              riskAnalysis: aiResult.analysis,
              realTimeHint: aiResult.realTimeHint,
              simSwapHistory: {
                ...t.simSwapHistory,
                isFraudPotential: swapResult.swapped,
                lastSwapped: swapResult.swapped ? new Date().toISOString() : t.simSwapHistory.lastSwapped
              }
            };

            // Add to in-app notifications if it's a critical RED loop update
            if (aiResult.realTimeHint) {
              setSecurityAlert({ 
                id: t.id, 
                name: t.name, 
                type: swapResult.swapped ? 'SIM_SWAP' : 'BREACH'
              });
            }
          }
        }

        console.log(`[Security Audit] Finalizing audit for ${t.name}: Status=${newStatus}`);
        await firebaseService.updateTransformer(t.id, {
          status: newStatus,
          ...updates
        });

        // Clean up from retry queue if successful
        setRetryQueue(prev => prev.filter(q => q.id !== t.id));
      } catch (err) {
        console.error(`[Security Scan] ${t.name} UNREACHABLE:`, err);
        setRetryQueue(prev => {
          if (prev.some(q => q.id === t.id)) return prev;
          return [...prev, { id: t.id, nextTry: Date.now() + 60000 }];
        });
      }
    };

    // Run initial scan once when user/transformers are ready
    if (transformersRef.current.length > 0) {
      console.log("[Security Scan] Triggering initial baseline audit...");
      transformersRef.current.forEach(t => performCheck(t));
    }

    // Main scan interval
    const mainInterval = setInterval(() => {
      if (transformersRef.current.length === 0) return;
      setIsRefreshing(true);
      Promise.all(transformersRef.current.map(t => performCheck(t)))
        .finally(() => setIsRefreshing(false));
    }, 120000); // 2 minutes main loop

    // Retry processor
    const retryInterval = setInterval(() => {
      const now = Date.now();
      const readyToRetry = retryQueue.filter(q => q.nextTry <= now);
      if (readyToRetry.length > 0) {
        console.log(`[Security Scan] Retrying ${readyToRetry.length} unreachable assets...`);
        readyToRetry.forEach(q => {
          const t = transformersRef.current.find(ts => ts.id === q.id);
          if (t) performCheck(t);
          else setRetryQueue(prev => prev.filter(pq => pq.id !== q.id)); // Clean up if asset gone
        });
      }
    }, 10000); // Check retry queue every 10s

    return () => {
      clearInterval(mainInterval);
      clearInterval(retryInterval);
    };
  }, [user]);

  // Security Integrity Check (SIM Swap) - Every Hour
  useEffect(() => {
    if (!user) return;

    const performIntegrityScan = async () => {
      console.log("Starting hourly integrity scan...");
      for (const t of transformers) {
        try {
          const swap = await nokiaService.checkSimSwap(t.phoneNumber);
          if (swap.swapped && !t.simSwapHistory.isFraudPotential) {
             await smsService.sendAlert(
                t.alertPhoneNumbers[0], 
                `GridGuard SECURITY: Periodic SIM swap check detected a change for ${t.name}.`
              );
              await firebaseService.updateTransformer(t.id, {
                simSwapHistory: {
                  ...t.simSwapHistory,
                  isFraudPotential: true,
                  lastChecked: new Date().toISOString()
                }
              });
          }
        } catch (err) {
          console.error("Hourly integrity check failed for", t.name, err);
        }
      }
    };

    const interval = setInterval(performIntegrityScan, 3600000); // 1 hour
    
    return () => clearInterval(interval);
  }, [user, transformers.length]);

  const calculateProratedAmount = () => {
    const monthlyAmount = Number(import.meta.env.VITE_PLAN_MONTHLY_DEVICE_AMOUNT) || 30;
    const now = new Date();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const totalDays = endOfMonth.getDate();
    const remainingDays = totalDays - now.getDate() + 1;
    return (remainingDays / totalDays) * monthlyAmount;
  };

  const processPayment = async (amount: number, description: string, plan: SubscriptionPlan) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'payments'), {
        userId: user.uid,
        amount: Math.round(amount * 100) / 100,
        date: new Date().toISOString(),
        status: 'succeeded',
        plan,
        description
      });
    } catch (e) {
      console.error("Payment sync failed:", e);
    }
  };

  // Initial settlement trigger
  useEffect(() => {
    if (user && transformers.length > 0) {
      const settle = async () => {
        const billingRef = doc(db, 'billing', user.uid);
        const billingSnap = await getDoc(billingRef);
        if (billingSnap.exists()) {
          const billing = billingSnap.data() as BillingInfo;
          // Check if we've ever made a payment
          const q = query(collection(db, 'payments'), where('userId', '==', user.uid));
          const pSnap = await getDocs(q);
          if (pSnap.empty && billing.currentPlan === SubscriptionPlan.PAY_AS_YOU_GO) {
            console.log("Processing initial settlement for existing devices...");
            const monthlyAmount = Number(import.meta.env.VITE_PLAN_MONTHLY_DEVICE_AMOUNT) || 30;
            await processPayment(
              transformers.length * monthlyAmount, 
              `Initial Balance Settlement - ${transformers.length} assets`,
              SubscriptionPlan.PAY_AS_YOU_GO
            );
          }
        }
      };
      settle();
    }
  }, [user, transformers.length]);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  };

  if (!user) {
    return (
      <div className="h-screen w-full bg-[#09090b] flex flex-col items-center justify-center p-6 text-center dot-grid">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md space-y-8 bento-card border-zinc-800 shadow-2xl p-12"
        >
          <div className="flex justify-center">
            <div className="w-20 h-20 bg-emerald-500 rounded-3xl flex items-center justify-center text-zinc-950 font-black text-4xl shadow-2xl shadow-emerald-500/20">
              GG
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-bold text-zinc-100 tracking-tight">GridGuard</h1>
            <p className="text-zinc-500 text-sm font-medium leading-relaxed">
              Industrial Grid Monitoring System<br/>Powered by Nokia Networkascode
            </p>
          </div>
          <button 
            onClick={() => firebaseService.login()}
            className="w-full py-4 bg-emerald-500 text-zinc-950 font-bold rounded-2xl flex items-center justify-center gap-3 hover:bg-emerald-400 transition-all shadow-xl shadow-emerald-500/20 active:scale-95"
          >
            <LogIn size={20} />
            Access Secure Node
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-[#09090b] text-zinc-100 overflow-hidden font-sans">
      {/* Condensed Bento Sidebar */}
      <aside className="w-20 border-r border-zinc-800 flex flex-col items-center py-8 gap-8 bg-zinc-900/50 backdrop-blur-xl">
        <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-zinc-950 font-black shadow-lg shadow-emerald-500/10">
          GG
        </div>
        <nav className="flex flex-col gap-4">
          <button 
            onClick={() => setActiveTab('map')}
            className={`p-3 rounded-xl transition-all ${activeTab === 'map' ? 'bg-zinc-800 text-emerald-500 shadow-lg' : 'text-zinc-600 hover:text-zinc-300'}`}
          >
            <MapIcon size={24} />
          </button>
          <button 
            onClick={() => setActiveTab('inventory')}
            className={`p-3 rounded-xl transition-all ${activeTab === 'inventory' ? 'bg-zinc-800 text-emerald-500 shadow-lg' : 'text-zinc-600 hover:text-zinc-300'}`}
          >
            <Box size={24} />
          </button>
          <button 
            onClick={() => setActiveTab('billing')}
            className={`p-3 rounded-xl transition-all ${activeTab === 'billing' ? 'bg-zinc-800 text-emerald-500 shadow-lg' : 'text-zinc-600 hover:text-zinc-300'}`}
            title="Billing & Subscriptions"
          >
            <CreditCard size={24} />
          </button>
          <button className="p-3 text-zinc-600 hover:text-zinc-300 transition-all">
            <Activity size={24} />
          </button>
        </nav>
        <div className="mt-auto mb-2 text-zinc-600 text-[9px] uppercase font-bold tracking-[0.2em] [writing-mode:vertical-rl] rotate-180">
          Nokia NAC Secure
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-8 bg-zinc-900/30 backdrop-blur-xl shrink-0">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-bold tracking-tight">GridGuard Core</h1>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-bold border border-emerald-500/20 flex items-center gap-1.5">
                <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                LIVE NODE
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
             <div className="hidden sm:flex items-center gap-2 mr-2">
                <div className={`w-2 h-2 rounded-full ${isRefreshing ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-700'}`} />
                <span className="text-[10px] text-zinc-500 font-mono">
                  {isRefreshing ? 'NAC_SYNC_ACTIVE' : 'SYSTEM_IDLE'}
                </span>
             </div>
             
             <button 
                onClick={() => setIsAddModalOpen(true)}
                className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/10 active:scale-95"
              >
                <Plus size={16} />
                Provision Asset
              </button>
              
              <div className="flex items-center gap-2">
                <button className="p-2.5 bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100 rounded-xl transition-all shadow-sm">
                  <Bell size={18} />
                </button>
                <button className="w-10 h-10 rounded-xl border border-zinc-800 overflow-hidden shadow-sm" onClick={() => auth.signOut()}>
                   <img src={user.photoURL || ''} alt="avatar" className="w-full h-full object-cover" />
                </button>
              </div>
          </div>
        </header>

        <div className="flex-1 p-6 grid grid-cols-12 grid-rows-6 gap-6 overflow-hidden">
          <AnimatePresence>
            {securityAlert && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.8, y: -20, x: '-50%' }}
                animate={{ opacity: 1, scale: 1, y: 0, x: '-50%' }}
                exit={{ opacity: 0, scale: 0.8, y: -20, x: '-50%' }}
                className="fixed top-24 left-1/2 z-50 pointer-events-auto"
              >
                <div 
                  onClick={() => {
                    setSelectedId(securityAlert.id);
                    setSecurityAlert(null);
                  }}
                  className="bg-rose-600 text-white px-6 py-4 rounded-2xl shadow-2xl border border-rose-500 flex items-center gap-4 cursor-pointer hover:bg-rose-500 transition-colors animate-pulse"
                >
                  <ShieldAlert size={24} className="animate-bounce" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest opacity-80">Critical Security Event</p>
                    <p className="text-sm font-black whitespace-nowrap">
                      {securityAlert.type === 'SIM_SWAP' ? 'SIM SWAP DETECTED: ORGANIZED CRIME PATTERN' : 'GEOSPATIAL BREACH DETECTED'}
                    </p>
                    {transformers.find(t => t.id === securityAlert.id)?.realTimeHint && (
                      <p className="text-[11px] font-medium text-rose-100 bg-rose-800/50 px-2 py-1 rounded mt-1 border border-rose-400/30">
                        AI Tip: {transformers.find(t => t.id === securityAlert.id)?.realTimeHint}
                      </p>
                    )}
                    <p className="text-[10px] opacity-70 underline mt-2 text-right">Investigate: {securityAlert.name}</p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <section className="col-span-12 lg:col-span-9 row-span-4 bento-card !p-0 overflow-hidden relative shadow-2xl dot-grid">
            <AnimatePresence mode="wait">
              {activeTab === 'map' && (
                <motion.div
                  key="map"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="w-full h-full"
                >
                  <MapboxComponent 
                    transformers={transformers} 
                    onSelectTransformer={(t) => setSelectedId(t?.id || null)} 
                    selectedTransformerId={selectedId || undefined} 
                  />
                </motion.div>
              )}
              {activeTab === 'inventory' && (
                <motion.div
                  key="inventory"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="w-full h-full bg-zinc-950/20 flex flex-col p-8"
                >
                  <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-500 mb-6">Asset Registry</h3>
                  <div className="flex-1 overflow-auto bg-zinc-900/50 rounded-2xl border border-zinc-800">
                    <table className="w-full text-left">
                      <thead className="text-[10px] uppercase text-zinc-600 border-b border-zinc-800">
                        <tr className="h-12 px-6">
                            <th className="font-bold px-6">Serial</th>
                            <th className="font-bold">Status</th>
                            <th className="font-bold">Last Sync</th>
                        </tr>
                      </thead>
                      <tbody className="text-xs font-mono">
                        {transformers.map(t => (
                          <tr key={t.id} className="h-14 border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                              <td className="px-6 text-zinc-200 font-bold">{t.serialNumber}</td>
                              <td>
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                  t.status === 'GREEN' ? 'bg-emerald-500/10 text-emerald-500' : 
                                  t.status === 'ORANGE' ? 'bg-amber-500/10 text-amber-500' : 
                                  'bg-rose-500/10 text-rose-500'
                                }`}>
                                  {t.status}
                                </span>
                              </td>
                              <td className="text-zinc-600">{new Date(t.currentLocation.lastUpdated).toLocaleTimeString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )}
              {activeTab === 'billing' && (
                <motion.div
                  key="billing"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="w-full h-full bg-zinc-950/20"
                >
                  <BillingModule 
                    onClose={() => setActiveTab('map')} 
                    assetCount={transformers.length}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          <aside className="hidden lg:flex lg:col-span-3 row-span-4 flex-col gap-6">
            <div className="flex-1 bento-card !p-0 overflow-hidden shadow-xl">
               <TransformerList 
                transformers={transformers} 
                onSelect={(t) => {
                  if (t.status === TransformerStatus.DRAFT) {
                    setTransformerToEdit(t);
                    setIsAddModalOpen(true);
                  } else {
                    setSelectedId(t.id);
                  }
                }} 
                selectedId={selectedId || undefined} 
               />
            </div>
          </aside>

          <div className="col-span-12 lg:col-span-4 row-span-2 bento-card flex flex-col justify-between group overflow-hidden relative">
            <div className="relative z-10 flex flex-col h-full">
              <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest flex items-center gap-2">
                <Shield size={14} className="text-emerald-500" />
                Network Integrity
              </div>
              <div className="mt-4">
                 <div className="text-3xl font-black text-zinc-100 flex items-baseline gap-2">100% <span className="text-xs font-normal text-emerald-500">System Uptime</span></div>
                 <p className="text-[11px] text-zinc-500 mt-2 leading-relaxed">AI monitored {transformers.length * 4} data nodes. No systemic faults.</p>
              </div>
            </div>
            <Activity className="absolute -right-4 -bottom-4 text-emerald-500/5" size={140} />
          </div>

          <div className="col-span-12 lg:col-span-5 row-span-2 bento-card bg-zinc-900 shadow-xl flex flex-col justify-between overflow-hidden relative">
             <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest flex items-center justify-between">
                <span>AI Risk Assessment Engine</span>
                <span className="font-mono text-zinc-700 text-[8px]">VERIFIER_V4</span>
             </div>
             {selectedTransformer?.riskRating ? (
               <div className="mt-4 flex items-start gap-4">
                 <div className={`text-4xl font-black font-mono leading-none ${selectedTransformer.riskRating > 70 ? 'text-rose-500' : selectedTransformer.riskRating > 30 ? 'text-amber-500' : 'text-emerald-500'}`}>
                   {selectedTransformer.riskRating}%
                 </div>
                 <p className="text-[11px] text-zinc-400 italic line-clamp-3">"{selectedTransformer.riskAnalysis}"</p>
               </div>
             ) : (
               <div className="flex-1 flex flex-col items-center justify-center text-zinc-700 gap-2 opacity-50"><Shield size={24} /><p className="text-[10px] font-bold uppercase">Select asset</p></div>
             )}
          </div>

          <div className="col-span-12 lg:col-span-3 row-span-2 bento-card border-zinc-800/50 bg-gradient-to-br from-zinc-900 to-zinc-950 flex flex-col items-center justify-center text-center p-4">
             <Radio size={20} className="text-emerald-500 animate-pulse mb-2" />
             <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">RAPIDAPI</h4>
             <div className="text-xs font-mono text-zinc-300 mt-1">200 OK</div>
          </div>
        </div>

        <AnimatePresence>
          {selectedTransformer && (
            <TransformerDetails 
              transformer={selectedTransformer} 
              onClose={() => setSelectedId(null)} 
              onResolve={async (id) => {
                await firebaseService.updateTransformer(id, { 
                  status: TransformerStatus.DRAFT,
                  riskAnalysis: "Asset recovery initiated. Awaiting re-initialization.",
                  riskRating: 0
                });
                setSelectedId(null);
                setSecurityAlert(null);
              }}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {isAddModalOpen && (
            <AddTransformer 
              initialData={transformerToEdit || undefined}
              onAdd={async (t) => { 
                if (transformerToEdit) {
                  await firebaseService.updateTransformer(t.id, {
                    ...t,
                    status: TransformerStatus.GREEN // Re-initialized to GREEN
                  });
                } else {
                  // NEW DEVICE: Prorated payment logic
                  const billingSnap = await getDoc(doc(db, 'billing', user.uid));
                  if (billingSnap.exists()) {
                    const billing = billingSnap.data() as BillingInfo;
                    if (billing.currentPlan === SubscriptionPlan.PAY_AS_YOU_GO) {
                      const amount = calculateProratedAmount();
                      await processPayment(amount, `Prorated Activation: ${t.name}`, SubscriptionPlan.PAY_AS_YOU_GO);
                    }
                  }
                  await firebaseService.addTransformer(t); 
                }
                setIsAddModalOpen(false); 
                setTransformerToEdit(null);
              }} 
              onClose={() => {
                setIsAddModalOpen(false);
                setTransformerToEdit(null);
              }} 
            />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
