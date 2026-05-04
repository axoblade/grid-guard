import React, { useState, useEffect } from 'react';
import { CreditCard, Calendar, Package, ArrowRight, History, CheckCircle, AlertCircle, Clock, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SubscriptionPlan, BillingInfo, PaymentRecord } from '../types';
import { auth, db } from '../services/firebaseService';
import { doc, getDoc, setDoc, collection, query, where, getDocs, addDoc } from 'firebase/firestore';

interface BillingModuleProps {
  onClose: () => void;
  assetCount: number;
}

const BillingModule: React.FC<BillingModuleProps> = ({ onClose, assetCount }) => {
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const fetchBillingData = async () => {
      if (!auth.currentUser) return;
      
      try {
        const billingRef = doc(db, 'billing', auth.currentUser.uid);
        const billingSnap = await getDoc(billingRef);
        
        if (billingSnap.exists()) {
          setBilling(billingSnap.data() as BillingInfo);
        } else {
          // Initialize default plan
          const defaultBilling: BillingInfo = {
            currentPlan: SubscriptionPlan.PAY_AS_YOU_GO,
            status: 'active',
            periodStart: new Date().toISOString(),
            periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            cancelAtPeriodEnd: false
          };
          await setDoc(billingRef, defaultBilling);
          setBilling(defaultBilling);
        }

        const paymentsRef = collection(db, 'payments');
        const q = query(paymentsRef, where('userId', '==', auth.currentUser.uid));
        const paymentsSnap = await getDocs(q);
        const paymentsList = paymentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentRecord));
        setPayments(paymentsList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      } catch (error) {
        console.error('Error fetching billing data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchBillingData();
  }, []);

  const monthlyDeviceAmount = Number(import.meta.env.VITE_PLAN_MONTHLY_DEVICE_AMOUNT) || 30;
  const enterpriseAnnualAmount = Number(import.meta.env.VITE_PLAN_ENTERPRISE_ANNUAL_AMOUNT) || 12000;
  const enterpriseMonthlyEquivalent = Number(import.meta.env.VITE_PLAN_ENTERPRISE_MONTHLY_EQUIVALENT) || 1000;

  const handleUpdatePlan = async (newPlan: SubscriptionPlan) => {
    if (!billing || !auth.currentUser) return;
    setProcessing(true);

    try {
      const billingRef = doc(db, 'billing', auth.currentUser.uid);
      const isAnnual = newPlan === SubscriptionPlan.ANNUAL_UNLIMITED;
      const isUpgrading = billing.currentPlan === SubscriptionPlan.PAY_AS_YOU_GO && isAnnual;

      if (isUpgrading) {
        // Immediate upgrade
        const updated: BillingInfo = {
          ...billing,
          currentPlan: newPlan,
          periodStart: new Date().toISOString(),
          periodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          upcomingPlan: undefined
        };
        await setDoc(billingRef, updated);
        
        // Mock payment
        await addDoc(collection(db, 'payments'), {
          userId: auth.currentUser.uid,
          amount: enterpriseAnnualAmount,
          date: new Date().toISOString(),
          status: 'succeeded',
          plan: newPlan,
          description: 'Annual Unlimited Plan Activation'
        });
        
        setBilling(updated);
      } else if (billing.currentPlan === SubscriptionPlan.ANNUAL_UNLIMITED && newPlan === SubscriptionPlan.PAY_AS_YOU_GO) {
        // Scheduled downgrade
        const updated: BillingInfo = {
          ...billing,
          upcomingPlan: newPlan
        };
        await setDoc(billingRef, updated);
        setBilling(updated);
      }
    } catch (error) {
      console.error('Error updating plan:', error);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return null;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="w-full h-full flex flex-col md:flex-row bg-zinc-950"
    >
      {/* Left: Subscription Info */}
      <div className="flex-1 p-8 border-r border-zinc-800 overflow-y-auto scrollbar-hide">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-black text-zinc-100 tracking-tight flex items-center gap-3">
            <CreditCard className="text-emerald-500" />
            BILLING CENTER
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
            <X size={20} className="text-zinc-500" />
          </button>
        </div>

          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">Current Plan</p>
                  <h3 className="text-xl font-bold text-zinc-100 mt-1">
                    {billing?.currentPlan === SubscriptionPlan.PAY_AS_YOU_GO ? 'Pay As You Go' : 'Annual Unlimited'}
                  </h3>
                </div>
                <div className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-black uppercase tracking-widest border border-emerald-500/20">
                  {billing?.status}
                </div>
              </div>

              <div className="mt-6 flex gap-4">
                <div className="flex-1 p-4 rounded-xl bg-black/40 border border-zinc-800">
                  <p className="text-[10px] text-zinc-500 uppercase font-black">Monthly Est.</p>
                  <p className="text-xl font-mono text-zinc-100 mt-1">
                    ${billing?.currentPlan === SubscriptionPlan.PAY_AS_YOU_GO ? (assetCount * monthlyDeviceAmount).toLocaleString() : enterpriseMonthlyEquivalent.toLocaleString()}
                  </p>
                </div>
                <div className="flex-1 p-4 rounded-xl bg-black/40 border border-zinc-800">
                  <p className="text-[10px] text-zinc-500 uppercase font-black">Active Assets</p>
                  <p className="text-xl font-mono text-zinc-100 mt-1">{assetCount}</p>
                </div>
              </div>

              {billing?.upcomingPlan && (
                <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-3">
                  <Clock size={16} className="text-amber-500" />
                  <p className="text-[10px] text-amber-200 font-bold uppercase tracking-wider">
                    Scheduled downgrade to Pay As You Go on {new Date(billing.periodEnd).toLocaleDateString()}
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Plan Cards */}
              <div 
                onClick={() => billing?.currentPlan !== SubscriptionPlan.PAY_AS_YOU_GO && !billing?.upcomingPlan && handleUpdatePlan(SubscriptionPlan.PAY_AS_YOU_GO)}
                className={`p-6 rounded-2xl border transition-all cursor-pointer ${
                  billing?.currentPlan === SubscriptionPlan.PAY_AS_YOU_GO 
                  ? 'bg-zinc-900 border-zinc-700 opacity-50 cursor-default' 
                  : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Package size={16} className="text-zinc-500" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 text-zinc-400">Flex</span>
                </div>
                <h4 className="text-lg font-bold text-zinc-100">Pay As You Go</h4>
                <p className="text-xs text-zinc-500 mt-2">${monthlyDeviceAmount} / device / month</p>
                {billing?.currentPlan === SubscriptionPlan.PAY_AS_YOU_GO && (
                  <div className="mt-4 text-[10px] font-black text-emerald-500 uppercase tracking-widest">Active Plan</div>
                )}
              </div>

              <div 
                onClick={() => billing?.currentPlan !== SubscriptionPlan.ANNUAL_UNLIMITED && handleUpdatePlan(SubscriptionPlan.ANNUAL_UNLIMITED)}
                className={`p-6 rounded-2xl border transition-all cursor-pointer ${
                  billing?.currentPlan === SubscriptionPlan.ANNUAL_UNLIMITED 
                  ? 'bg-emerald-500/5 border-emerald-500/20 cursor-default' 
                  : 'bg-zinc-900/50 border-zinc-800 hover:border-emerald-500/20 hover:bg-emerald-500/5'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle size={16} className="text-emerald-500" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Enterprise</span>
                </div>
                <h4 className="text-lg font-bold text-zinc-100">Annual Unlimited</h4>
                <p className="text-xs text-zinc-500 mt-2">${enterpriseMonthlyEquivalent.toLocaleString()} / month (${(enterpriseAnnualAmount/1000).toFixed(0)}k billed annually)</p>
                {billing?.currentPlan === SubscriptionPlan.ANNUAL_UNLIMITED ? (
                  <div className="mt-4 text-[10px] font-black text-emerald-500 uppercase tracking-widest">Active Plan</div>
                ) : (
                  <button 
                    disabled={processing}
                    className="mt-4 w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black rounded-lg transition-colors uppercase tracking-widest"
                  >
                    {processing ? 'Processing...' : 'Upgrade Now'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Payment History */}
        <div className="w-full md:w-80 bg-zinc-900/30 p-8 overflow-y-auto">
          <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
            <History size={14} />
            Payment History
          </h3>
          
          <div className="space-y-4">
            {payments.length === 0 ? (
              <p className="text-[10px] text-zinc-600 italic">No transactions found.</p>
            ) : (
              payments.map(payment => (
                <div key={payment.id} className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/50">
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] font-mono text-zinc-500">
                      {new Date(payment.date).toLocaleDateString()}
                    </span>
                    <span className="text-xs font-black text-zinc-100">${payment.amount.toLocaleString()}</span>
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-1 font-medium">{payment.description}</p>
                  <div className="mt-2 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">Successful</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </motion.div>
    );
  };

export default BillingModule;
