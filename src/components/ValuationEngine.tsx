import { useState, useMemo } from 'react';
import { Asset, InvestmentAccount, Investor, Valuation } from '../types';
import ValuationIntelligence from './ValuationIntelligence';
import { 
  Calculator, 
  History, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle2,
  ArrowRight,
  Info,
  RefreshCw,
  X,
  Zap,
  Plus,
  Minus,
  RotateCcw,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { handleFirestoreError, OperationType } from '../lib/utils';

import { cn, formatCurrency } from '../lib/utils';

import { 
  runGlobalValuation, 
  runManualValuation, 
  deleteLatestValuation, 
  redoLatestValuation, 
  resetAllValuations,
  resetToMagicPerformance
} from '../services/valuationService';

interface ValuationEngineProps {
  fund: InvestmentAccount | null;
  portfolio: Asset[];
  investors: Investor[];
  valuations: Valuation[];
  revertedCount?: number;
}

export default function ValuationEngine({ fund, portfolio, investors, valuations, revertedCount = 0 }: ValuationEngineProps) {
  const [isCalculating, setIsCalculating] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [isRedoing, setIsRedoing] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showUndoConfirm, setShowUndoConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [valMethod, setValMethod] = useState<'automated' | 'manual'>('automated');
  const [manualGain, setManualGain] = useState<string>('');
  const [manualDate, setManualDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [gainLossPct, setGainLossPct] = useState<string>('');
  const [selectedAssetId, setSelectedAssetId] = useState<string>('all');
  const [newAssetPrice, setNewAssetPrice] = useState<string>('');
  const [lastResult, setLastResult] = useState<{ nav: number; aum: number } | null>(null);

  const selectedAsset = useMemo(() => 
    portfolio.find(a => a.id === selectedAssetId),
    [portfolio, selectedAssetId]
  );

  const sortedValuations = [...valuations].sort((a, b) => {
    // Sync sorting with App.tsx: treat pending (null date) as newest
    const timeA = a.date?.seconds || (Date.now() / 1000) + 1000;
    const timeB = b.date?.seconds || (Date.now() / 1000) + 1000;
    return timeB - timeA;
  });

  const totalMarketValue = portfolio.reduce((sum, asset) => sum + asset.marketValue, 0);
  const totalUnits = investors.reduce((sum, inv) => sum + inv.unitsOwned, 0);
  
  const gainValue = parseFloat(manualGain) || 0;
  
  // Calculate gain based on percentage if provided
  const handlePctChange = (pct: string) => {
    setGainLossPct(pct);
    if (!pct) {
      setManualGain('');
      return;
    }
    const val = (parseFloat(pct) / 100) * totalMarketValue;
    setManualGain(val.toFixed(2));
  };

  const handleGainChange = (gain: string) => {
    setManualGain(gain);
    if (!gain || totalMarketValue === 0) {
      setGainLossPct('');
      return;
    }
    const pct = (parseFloat(gain) / totalMarketValue) * 100;
    setGainLossPct(pct.toFixed(2));
  };

  const handlePriceChange = (price: string) => {
    setNewAssetPrice(price);
    if (!price || !selectedAsset) {
      setManualGain('');
      setGainLossPct('');
      return;
    }
    const diff = parseFloat(price) - selectedAsset.currentPrice;
    const totalDiff = diff * selectedAsset.quantity;
    setManualGain(totalDiff.toFixed(2));
    const pct = (totalDiff / totalMarketValue) * 100;
    setGainLossPct(pct.toFixed(2));
  };

  const projectAum = totalMarketValue + (fund?.cashBalance || 0) + (valMethod === 'manual' ? gainValue : 0);
  const calculatedNAV = totalUnits > 0 ? projectAum / totalUnits : (fund?.nav || 1.0000);
  
  const runValuation = async () => {
    if (!fund) return;
    setIsCalculating(true);
    setLastResult(null);
    
    try {
      if (valMethod === 'automated') {
        await runGlobalValuation();
        setLastResult({ nav: calculatedNAV, aum: projectAum });
      } else {
        const notes = selectedAssetId !== 'all' 
          ? `Manual valuation for ${selectedAsset?.ticker}. New Price: ${newAssetPrice || 'N/A'}. Gain/Loss: ${gainLossPct}%`
          : `Manual valuation adjustment. Gain/Loss: ${gainLossPct}%`;
          
        const assetUpdate = selectedAssetId !== 'all' && newAssetPrice 
          ? { id: selectedAssetId, newPrice: parseFloat(newAssetPrice) }
          : undefined;

        const result = await runManualValuation(
          fund.id, 
          gainValue, 
          notes, 
          manualDate, 
          assetUpdate
        );
        if (result) {
          setLastResult(result);
          setManualGain('');
          setGainLossPct('');
          setNewAssetPrice('');
          setSelectedAssetId('all');
        }
      }
    } catch (error) {
      console.error(error);
      alert('Error publishing valuation. Please check logs.');
    } finally {
      setTimeout(() => setIsCalculating(false), 1500);
    }
  };

  const handleUndo = async () => {
    if (!fund || sortedValuations.length === 0 || isCalculating || isUndoing || isRedoing) {
      console.warn('Undo skipped: precondition not met', { fund: !!fund, len: sortedValuations.length, isCalculating, isUndoing, isRedoing });
      return;
    }
    
    const latest = sortedValuations[0];
    const previous = sortedValuations[1];
    
    console.info('Attempting Undo for latest record:', latest);

    if (!latest.id) {
      console.error('Latest valuation missing document ID');
      alert('Cannot undo: Valuation record is not fully synced yet. Please wait 2 seconds and try again.');
      return;
    }

    setShowUndoConfirm(false);
    setIsUndoing(true);
    try {
      await deleteLatestValuation(fund.id, latest.id, previous);
      setLastResult(null); 
      console.info('Undo operation triggered successfully');
    } catch (error: any) {
      console.error('Undo Failed Component Level:', error);
      const errorMessage = error?.message?.includes('{') 
        ? JSON.parse(error.message).error 
        : error?.message || 'Unknown error';
      alert(`Failed to undo: ${errorMessage}`);
    } finally {
      setIsUndoing(false);
    }
  };

  const handleRedo = async () => {
    if (!fund || revertedCount === 0 || isCalculating || isUndoing || isRedoing) {
      console.warn('Redo skipped: precondition not met');
      return;
    }
    
    console.info('Attempting Redo for account:', fund.id);
    setIsRedoing(true);
    try {
      const result = await redoLatestValuation(fund.id);
      if (result) {
        setLastResult(result);
        console.info('Redo operation triggered successfully');
      }
    } catch (error: any) {
      console.error('Redo Failed Component Level:', error);
      const errorMessage = error?.message?.includes('{') 
        ? JSON.parse(error.message).error 
        : error?.message || 'Unknown error';
      alert(`Failed to redo: ${errorMessage}`);
    } finally {
      setIsRedoing(false);
    }
  };

  const handleReset = async () => {
    if (!fund || isResetting) return;
    console.info('Attempting Reset for account:', fund.id);
    
    setShowResetConfirm(false);
    setIsResetting(true);
    try {
      await resetAllValuations(fund.id);
      setLastResult(null);
      setManualGain('');
      console.info('Reset operation completed');
    } catch (error: any) {
      console.error('Reset Failed Component Level:', error);
      alert('Reset failed. Check permissions in console.');
    } finally {
      setIsResetting(false);
    }
  };

  const handleMagicReset = async () => {
    if (!fund || isResetting) return;
    console.info('Attempting Magic Reset for account:', fund.id);
    
    setShowResetConfirm(false);
    setIsResetting(true);
    try {
      await resetToMagicPerformance(fund.id);
      setLastResult(null);
      setManualGain('');
      console.info('Magic Reset operation completed');
    } catch (error: any) {
      console.error('Magic Reset Failed Component Level:', error);
      alert('Magic Reset failed. Check permissions in console.');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-3xl font-bold text-white">Valuation Engine</h2>
            <div className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full border border-emerald-500/20">
              <div className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Live</span>
            </div>
          </div>
          <p className="text-slate-400 mt-1">Calculate and publish Net Asset Value (NAV)</p>
        </div>
        
        <div className="flex items-center gap-4 bg-slate-900 border border-slate-800 p-2 rounded-2xl">
          <button 
            onClick={() => setValMethod('automated')}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
              valMethod === 'automated' ? "bg-emerald-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
            )}
          >
            <TrendingUp className="w-3.5 h-3.5" /> Automated
          </button>
          <button 
            onClick={() => setValMethod('manual')}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
              valMethod === 'manual' ? "bg-blue-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
            )}
          >
            <Zap className="w-3.5 h-3.5" /> Manual Adjustment
          </button>
        </div>

        <button 
          onClick={runValuation}
          disabled={isCalculating}
          className={cn(
            "px-8 py-4 rounded-xl font-bold flex items-center gap-3 transition-all shadow-xl whitespace-nowrap",
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
          {isCalculating ? 'Processing Valuation...' : valMethod === 'manual' ? 'Publish Manual Valuation' : 'Run Fund Valuation'}
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Left Column: Calculation Logic */}
        <div className="space-y-6">
          <AnimatePresence mode="wait">
            {valMethod === 'manual' && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-blue-600/5 border border-blue-500/20 rounded-3xl p-6 overflow-hidden space-y-6"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-600/20 rounded-xl flex items-center justify-center">
                      <Zap className="w-4 h-4 text-blue-500" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider">Manual Adjustment</h3>
                      <p className="text-[10px] text-slate-500">Fine-tune fund performance</p>
                    </div>
                  </div>
                  <input 
                    type="date"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    className="bg-slate-950/50 border border-slate-800 rounded-lg px-3 py-1.5 text-[10px] font-bold text-slate-400 focus:border-blue-500 outline-none"
                  />
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Target Asset</label>
                    <select 
                      value={selectedAssetId}
                      onChange={(e) => {
                        setSelectedAssetId(e.target.value);
                        setNewAssetPrice('');
                        setManualGain('');
                        setGainLossPct('');
                      }}
                      className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:border-blue-500 outline-none"
                    >
                      <option value="all">Entire Portfolio (Global Adjustment)</option>
                      {portfolio.map(asset => (
                        <option key={asset.id} value={asset.id}>{asset.ticker} - {asset.name}</option>
                      ))}
                    </select>
                  </div>

                  {selectedAsset && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="grid grid-cols-2 gap-4 p-4 bg-slate-950/50 border border-slate-800 rounded-2xl"
                    >
                      <div className="space-y-1">
                        <p className="text-[10px] text-slate-500 font-bold uppercase">Current Price</p>
                        <p className="text-lg font-bold text-white">{formatCurrency(selectedAsset.currentPrice)}</p>
                        <p className="text-[10px] text-slate-400">Total Units: {selectedAsset.quantity}</p>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] text-slate-500 font-bold uppercase">New Market Price</label>
                        <div className="relative group">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-600 group-focus-within:text-blue-500">GH₵</span>
                          <input 
                            type="number"
                            value={newAssetPrice}
                            onChange={(e) => handlePriceChange(e.target.value)}
                            placeholder="0.00"
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 pl-10 pr-3 text-sm font-bold text-white focus:outline-none focus:border-blue-500 transition-all"
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Gain/Loss Amount</label>
                      <div className="relative group">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-600 group-focus-within:text-blue-500">GH₵</span>
                        <input 
                          type="number"
                          value={manualGain}
                          onChange={(e) => handleGainChange(e.target.value)}
                          placeholder="0.00"
                          className="w-full bg-slate-950/50 border border-slate-800 rounded-xl py-3 pl-12 pr-4 text-sm font-bold text-white focus:outline-none focus:border-blue-500 transition-all placeholder:text-slate-800"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Performance %</label>
                      <div className="relative group">
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-600 group-focus-within:text-blue-500">%</span>
                        <input 
                          type="number"
                          value={gainLossPct}
                          onChange={(e) => handlePctChange(e.target.value)}
                          placeholder="0.0"
                          className="w-full bg-slate-950/50 border border-slate-800 rounded-xl py-3 pl-4 pr-10 text-sm font-bold text-white focus:outline-none focus:border-blue-500 transition-all placeholder:text-slate-800"
                        />
                      </div>
                    </div>
                  </div>

                  <div className={cn(
                    "p-3 rounded-xl flex items-center gap-3",
                    gainValue >= 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                  )}>
                    <div className="w-6 h-6 rounded-lg bg-current/20 flex items-center justify-center">
                      {gainValue >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingUp className="w-3 h-3 rotate-180" />}
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase">Impact Result</p>
                      <p className="text-xs font-medium">This will {gainValue >= 0 ? 'increase' : 'decrease'} fund AUM by {formatCurrency(Math.abs(gainValue))}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
            <h3 className="text-sm font-bold text-white mb-6 flex items-center gap-2 uppercase tracking-widest">
              <Info className="w-4 h-4 text-emerald-500" />
              NAV Calculation
            </h3>
            
            <div className="space-y-6">
              <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-800">
                <div className="mb-4">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">AUM (Incl. Cash)</p>
                  <p className="text-xl font-bold text-white mt-1">{formatCurrency(projectAum)}</p>
                </div>
                <div className="h-px bg-slate-800 mb-4" />
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Units Outstanding</p>
                  <p className="text-xl font-bold text-white mt-1">{totalUnits.toLocaleString()}</p>
                </div>
              </div>

              <div className="bg-emerald-500/5 border border-emerald-500/20 p-6 rounded-2xl text-center">
                <p className="text-emerald-500 text-[10px] font-bold uppercase tracking-widest mb-1">Projected NAV</p>
                <h4 className="text-4xl font-black text-white tracking-tight">
                  {formatCurrency(calculatedNAV)}
                </h4>
              </div>
              
              <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-xl flex gap-3">
                <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-slate-400 text-[10px] leading-relaxed">
                  Valuations should be run at business close. Verify asset prices before publishing.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Middle Column: Gemini Intelligence Chat */}
        <div className="lg:col-span-1">
          <ValuationIntelligence 
            fund={fund}
            portfolio={portfolio}
            investors={investors}
            valuations={valuations}
          />
        </div>

        {/* Right Column: Recent History */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-col h-[600px]">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-widest">
              <History className="w-4 h-4 text-emerald-500" />
              History
            </h3>
            <div className="flex items-center gap-2 relative">
              <AnimatePresence>
                {showResetConfirm && (
                  <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="absolute right-0 top-full mt-2 p-4 bg-slate-900 border border-red-500/50 rounded-xl shadow-2xl z-50 w-64"
                  >
                    <p className="text-xs text-slate-300 mb-3">CRITICAL: Clear all history and reset NAV to 1.0000? This cannot be undone.</p>
                    <div className="space-y-2">
                      <button 
                        onClick={handleReset}
                        className="w-full py-1.5 bg-red-600 hover:bg-red-500 text-white rounded text-[10px] font-bold"
                      >
                        Reset to 1.0000
                      </button>
                      <button 
                        onClick={handleMagicReset}
                        className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-bold"
                      >
                        Magic Reset (19%)
                      </button>
                      <button 
                        onClick={() => setShowResetConfirm(false)}
                        className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-bold"
                      >
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                )}

                {showUndoConfirm && (
                  <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="absolute right-0 top-full mt-2 p-4 bg-slate-900 border border-amber-500/50 rounded-xl shadow-2xl z-50 w-60"
                  >
                    <p className="text-xs text-slate-300 mb-3">Undo the latest valuation record? Account state will revert.</p>
                    <div className="flex gap-2">
                      <button 
                        onClick={handleUndo}
                        className="flex-1 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-[10px] font-bold"
                      >
                        Undo Record
                      </button>
                      <button 
                        onClick={() => setShowUndoConfirm(false)}
                        className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-bold"
                      >
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {sortedValuations.length > 0 && revertedCount > 0 && (
                <button 
                  onClick={handleRedo}
                  disabled={isRedoing || isResetting}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-all text-xs font-bold disabled:opacity-50"
                  title={`Redo latest undone valuation (${revertedCount} available)`}
                >
                  <RefreshCw className={cn("w-3.5 h-3.5", isRedoing && "animate-spin")} />
                  Redo
                </button>
              )}
              {sortedValuations.length > 0 && (
                <button 
                  onClick={() => setShowUndoConfirm(true)}
                  disabled={isUndoing || isResetting || isRedoing || showUndoConfirm}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-all text-xs font-bold disabled:opacity-50"
                >
                  <RotateCcw className={cn("w-3.5 h-3.5", isUndoing && "animate-spin")} />
                  Undo
                </button>
              )}
              <button 
                onClick={() => setShowResetConfirm(true)}
                disabled={isResetting || isUndoing || isRedoing || isCalculating || showResetConfirm}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-500 hover:bg-red-600 hover:text-white transition-all text-xs font-bold disabled:opacity-50"
                title="Clear all valuation history and reset fund"
              >
                <Trash2 className={cn("w-3.5 h-3.5", isResetting && "animate-pulse")} />
                Reset Record
              </button>
            </div>
          </div>
          <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
            {sortedValuations.length > 0 ? (
              sortedValuations.map((v, idx) => {
                const prevVal = sortedValuations[idx + 1];
                const change = prevVal ? v.nav - prevVal.nav : 0;
                
                return (
                  <div key={v.id} className="p-4 bg-slate-800/30 rounded-xl border border-slate-800/50 group hover:border-slate-700 transition-all">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-slate-500">
                        {v.date?.seconds 
                          ? new Date(v.date.seconds * 1000).toLocaleString() 
                          : 'Just now'}
                      </p>
                      {change !== 0 && (
                        <div className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-bold",
                          change > 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                        )}>
                          {change > 0 ? '+' : ''}{change.toFixed(4)}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-lg font-bold text-white">{formatCurrency(v.nav)}</p>
                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">NAV Price</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-slate-400">{formatCurrency(v.aum)}</p>
                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">AUM</p>
                      </div>
                    </div>
                    {v.notes && (
                      <div className="mt-2 pt-2 border-t border-slate-800/50">
                        <p className="text-[10px] text-slate-500 italic truncate" title={v.notes}>{v.notes}</p>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="py-10 text-center text-slate-500 text-sm">
                No valuation history found.
              </div>
            )}
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
