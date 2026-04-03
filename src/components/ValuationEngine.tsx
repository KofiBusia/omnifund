import { useState } from 'react';
import { Asset, InvestmentAccount, Investor } from '../types';
import { 
  Calculator, 
  History, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle2,
  ArrowRight,
  Info,
  RefreshCw,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { handleFirestoreError, OperationType } from '../lib/utils';

import { cn, formatCurrency } from '../lib/utils';

import { runGlobalValuation } from '../services/valuationService';

interface ValuationEngineProps {
  fund: InvestmentAccount | null;
  portfolio: Asset[];
  investors: Investor[];
}

export default function ValuationEngine({ fund, portfolio, investors }: ValuationEngineProps) {
  const [isCalculating, setIsCalculating] = useState(false);
  const [lastResult, setLastResult] = useState<{ nav: number; aum: number } | null>(null);

  const totalMarketValue = portfolio.reduce((sum, asset) => sum + asset.marketValue, 0);
  const totalUnits = investors.reduce((sum, inv) => sum + inv.unitsOwned, 0);
  const calculatedNAV = totalUnits > 0 ? totalMarketValue / totalUnits : (fund?.nav || 1.0000);
  
  const runValuation = async () => {
    if (!fund) return;
    setIsCalculating(true);
    
    try {
      await runGlobalValuation();
      setLastResult({ nav: calculatedNAV, aum: totalMarketValue });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'valuations');
    } finally {
      setTimeout(() => setIsCalculating(false), 1500);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white">Valuation Engine</h2>
          <p className="text-slate-400 mt-1">Calculate and publish Net Asset Value (NAV)</p>
        </div>
        <button 
          onClick={runValuation}
          disabled={isCalculating}
          className={cn(
            "px-8 py-4 rounded-xl font-bold flex items-center gap-3 transition-all shadow-xl",
            isCalculating 
              ? "bg-slate-800 text-slate-500 cursor-not-allowed" 
              : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20"
          )}
        >
          {isCalculating ? (
            <RefreshCw className="w-6 h-6 animate-spin" />
          ) : (
            <Calculator className="w-6 h-6" />
          )}
          {isCalculating ? 'Processing Valuation...' : 'Run Fund Valuation'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Calculation Logic */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8">
            <h3 className="text-xl font-bold text-white mb-8 flex items-center gap-2">
              <Info className="w-5 h-5 text-emerald-500" />
              NAV Calculation Logic
            </h3>
            
            <div className="space-y-8">
              <div className="flex items-center justify-between p-6 bg-slate-800/30 rounded-2xl border border-slate-800">
                <div>
                  <p className="text-sm text-slate-400 font-medium">Total Portfolio Value (AUM)</p>
                  <p className="text-2xl font-bold text-white mt-1">{formatCurrency(totalMarketValue)}</p>
                </div>
                <div className="text-slate-600 text-2xl font-light">/</div>
                <div className="text-right">
                  <p className="text-sm text-slate-400 font-medium">Total Units Outstanding</p>
                  <p className="text-2xl font-bold text-white mt-1">{totalUnits.toLocaleString()}</p>
                </div>
              </div>

              <div className="flex items-center justify-center py-4">
                <div className="h-px bg-slate-800 flex-1" />
                <div className="px-4 text-slate-500 font-mono text-sm">EQUALS</div>
                <div className="h-px bg-slate-800 flex-1" />
              </div>

              <div className="bg-emerald-500/5 border border-emerald-500/20 p-8 rounded-3xl text-center">
                <p className="text-emerald-500 text-sm font-bold uppercase tracking-widest mb-2">Projected NAV (Net Asset Value)</p>
                <h4 className="text-6xl font-black text-white tracking-tight">
                  {formatCurrency(calculatedNAV)}
                </h4>
                <p className="text-slate-500 mt-4 text-sm max-w-md mx-auto">
                  This value represents the current market price per unit based on the latest portfolio data.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-amber-500/5 border border-amber-500/20 p-6 rounded-2xl flex gap-4">
            <AlertCircle className="w-6 h-6 text-amber-500 flex-shrink-0" />
            <div>
              <h4 className="text-amber-500 font-bold text-sm">Regulatory Compliance Note</h4>
              <p className="text-slate-400 text-sm mt-1">
                Valuations should typically be run at the close of every business day. Ensure all asset prices are verified before publishing.
              </p>
            </div>
          </div>
        </div>

        {/* Recent History */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <History className="w-5 h-5 text-emerald-500" />
            Recent Valuations
          </h3>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="p-4 bg-slate-800/30 rounded-xl border border-slate-800/50 flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500">April {10 - i}, 2024</p>
                  <p className="text-sm font-bold text-white">{formatCurrency(1.2456 - i * 0.01)}</p>
                </div>
                <div className="flex items-center gap-1 text-emerald-500 text-[10px] font-bold">
                  <CheckCircle2 className="w-3 h-3" />
                  VERIFIED
                </div>
              </div>
            ))}
            <button className="w-full py-3 text-sm text-slate-400 hover:text-white transition-colors">
              View Full History
            </button>
          </div>
        </div>
      </div>

      {/* Success Notification */}
      <AnimatePresence>
        {lastResult && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-4 z-50"
          >
            <CheckCircle2 className="w-6 h-6" />
            <div>
              <p className="font-bold">Valuation Published Successfully</p>
              <p className="text-xs text-emerald-100">New NAV: {formatCurrency(lastResult.nav)} | AUM: {formatCurrency(lastResult.aum)}</p>
            </div>
            <button 
              onClick={() => setLastResult(null)}
              className="ml-4 p-1 hover:bg-emerald-500 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
