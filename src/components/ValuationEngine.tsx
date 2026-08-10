import { useState, useMemo, useEffect } from 'react';
import { 
  Asset, 
  InvestmentAccount, 
  Investor, 
  Valuation, 
  ValuationRun, 
  ValuationException, 
  PriceStatus,
  FeeAccrualConfig
} from '../types';
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
  RotateCcw,
  Trash2,
  Send,
  ShieldCheck,
  Scale,
  DollarSign,
  PieChart,
  Layers,
  Sparkles,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Check,
  Calendar,
  Lock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { cn, formatCurrency } from '../lib/utils';
import { 
  runGlobalValuation, 
  runManualValuation, 
  deleteLatestValuation, 
  redoLatestValuation, 
  resetAllValuations,
  resetToMagicPerformance,
  resolveAssetPriceStatuses,
  calculateDailyFeeAccruals,
  detectValuationExceptions,
  calculateNavBridge,
  executeFormalValuationRun,
  DEFAULT_FEE_CONFIG
} from '../services/valuationService';
import { calculateNetAssets, calculateNavPerUnit, roundMoney, roundNav } from '../services/fundAccountingEngine';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

interface ValuationEngineProps {
  fund: InvestmentAccount | null;
  portfolio: Asset[];
  investors: Investor[];
  valuations: Valuation[];
  revertedCount?: number;
}

export default function ValuationEngine({ 
  fund, 
  portfolio, 
  investors, 
  valuations, 
  revertedCount = 0 
}: ValuationEngineProps) {
  const [activeTab, setActiveTab] = useState<'workspace' | 'nav_bridge' | 'exceptions' | 'history'>('workspace');
  const [isCalculating, setIsCalculating] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [isRedoing, setIsRedoing] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showUndoConfirm, setShowUndoConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Valuation Parameters
  const [valMethod, setValMethod] = useState<'automated' | 'manual'>('automated');
  const [manualGain, setManualGain] = useState<string>('');
  const [targetPricePerUnit, setTargetPricePerUnit] = useState<string>('');
  const [manualDate, setManualDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [gainLossPct, setGainLossPct] = useState<string>('');
  const [selectedAssetId, setSelectedAssetId] = useState<string>('all');
  const [newAssetPrice, setNewAssetPrice] = useState<string>('');
  const [lastResult, setLastResult] = useState<{ nav: number; aum: number } | null>(null);

  // Fee Accruals Config
  const [feeConfig, setFeeConfig] = useState<FeeAccrualConfig>(DEFAULT_FEE_CONFIG);

  // Formal Valuation Runs State
  const [formalRuns, setFormalRuns] = useState<ValuationRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<ValuationRun | null>(null);
  const [isLoadingRuns, setIsLoadingRuns] = useState(false);

  const activeInvestors = useMemo(() => 
    fund ? investors.filter(i => i.accountId === fund.id) : investors,
    [investors, fund]
  );

  const activePortfolio = useMemo(() => 
    fund ? portfolio.filter(p => p.accountId === fund.id) : portfolio,
    [portfolio, fund]
  );

  // Asset Price Statuses & Stale Price Detection
  const assetStatuses = useMemo(() => 
    resolveAssetPriceStatuses(activePortfolio, 7, manualDate),
    [activePortfolio, manualDate]
  );

  const totalMarketValue = useMemo(() => 
    activePortfolio.reduce((sum, a) => sum + (a.marketValue || 0), 0),
    [activePortfolio]
  );

  const totalUnits = useMemo(() => 
    activeInvestors.reduce((sum, inv) => sum + (inv.unitsOwned || 0), 0),
    [activeInvestors]
  );

  const gainValue = parseFloat(manualGain) || 0;

  // Real-time Calculated Net Assets & Fee Accruals
  const feeAccruals = useMemo(() => {
    const grossAssets = totalMarketValue + (fund?.cashBalance || 0) + (fund?.receivables || 0);
    return calculateDailyFeeAccruals(grossAssets, feeConfig);
  }, [totalMarketValue, fund, feeConfig]);

  const { totalAssets, totalLiabilities, netAssets } = useMemo(() => {
    const currentAccrued = (fund?.accruedFees || 0) + feeAccruals.totalDailyAccrual;
    return calculateNetAssets(
      totalMarketValue + (valMethod === 'manual' ? gainValue : 0),
      fund?.cashBalance || 0,
      fund?.receivables || 0,
      fund?.liabilities || 0,
      currentAccrued
    );
  }, [totalMarketValue, valMethod, gainValue, fund, feeAccruals]);

  const targetNavNumber = parseFloat(targetPricePerUnit);
  const calculatedNAV = useMemo(() => {
    if (targetNavNumber > 0) return targetNavNumber;
    return calculateNavPerUnit(netAssets, totalUnits, fund?.nav || 1.0000);
  }, [targetNavNumber, netAssets, totalUnits, fund?.nav]);

  const projectedAUM = useMemo(() => {
    if (targetNavNumber > 0 && totalUnits > 0) return roundMoney(totalUnits * targetNavNumber);
    return netAssets;
  }, [targetNavNumber, totalUnits, netAssets]);

  // Detected Valuation Exceptions
  const exceptions = useMemo(() => {
    if (!fund) return [];
    return detectValuationExceptions(fund, activePortfolio, activeInvestors, fund.nav || 1.0000, calculatedNAV);
  }, [fund, activePortfolio, activeInvestors, calculatedNAV]);

  // NAV Bridge Calculation
  const navBridge = useMemo(() => {
    const portfolioGain = totalMarketValue - activePortfolio.reduce((sum, a) => sum + (a.totalCostBasis || 0), 0);
    return calculateNavBridge(
      fund?.nav || 1.0000,
      calculatedNAV,
      portfolioGain,
      0,
      feeAccruals.totalDailyAccrual,
      0,
      totalUnits
    );
  }, [fund?.nav, calculatedNAV, totalMarketValue, activePortfolio, feeAccruals, totalUnits]);

  // Fetch Valuation Runs from Firestore
  const fetchValuationRuns = async () => {
    if (!fund) return;
    setIsLoadingRuns(true);
    try {
      const q = query(
        collection(db, 'valuation_runs'),
        where('accountId', '==', fund.id)
      );
      const snap = await getDocs(q);
      const runs = snap.docs.map(d => ({ ...d.data(), id: d.id } as ValuationRun));
      runs.sort((a, b) => new Date(b.runTimestamp).getTime() - new Date(a.runTimestamp).getTime());
      setFormalRuns(runs);
    } catch (err) {
      console.error('Failed to fetch valuation runs:', err);
    } finally {
      setIsLoadingRuns(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') {
      fetchValuationRuns();
    }
  }, [activeTab, fund?.id]);

  const handleTargetNavChange = (targetNavStr: string) => {
    setTargetPricePerUnit(targetNavStr);
    if (!targetNavStr || isNaN(parseFloat(targetNavStr))) {
      setManualGain('');
      setGainLossPct('');
      return;
    }
    const targetNavVal = parseFloat(targetNavStr);
    const requiredAum = totalUnits > 0 ? totalUnits * targetNavVal : totalMarketValue + (fund?.cashBalance || 0);
    const requiredGain = requiredAum - (totalMarketValue + (fund?.cashBalance || 0));
    setManualGain(requiredGain.toFixed(2));
    if (totalMarketValue > 0) {
      setGainLossPct(((requiredGain / totalMarketValue) * 100).toFixed(2));
    }
  };

  const handlePctChange = (pct: string) => {
    setGainLossPct(pct);
    setTargetPricePerUnit('');
    if (!pct) {
      setManualGain('');
      return;
    }
    const val = (parseFloat(pct) / 100) * totalMarketValue;
    setManualGain(val.toFixed(2));
  };

  const handleGainChange = (gain: string) => {
    setManualGain(gain);
    setTargetPricePerUnit('');
    if (!gain || totalMarketValue === 0) {
      setGainLossPct('');
      return;
    }
    const pct = (parseFloat(gain) / totalMarketValue) * 100;
    setGainLossPct(pct.toFixed(2));
  };

  const handlePriceChange = (price: string) => {
    setNewAssetPrice(price);
    setTargetPricePerUnit('');
    const selectedAsset = activePortfolio.find(a => a.id === selectedAssetId);
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

  const runValuation = async () => {
    if (!fund) {
      toast.error("Please select an active fund/account first.");
      return;
    }

    if (exceptions.some(e => e.severity === 'CRITICAL')) {
      toast.warning("Critical valuation exceptions detected. Review exceptions before final publication.");
    }

    setIsCalculating(true);
    setLastResult(null);

    try {
      if (valMethod === 'automated' && !targetPricePerUnit) {
        await runGlobalValuation();
        const result = await runManualValuation(fund.id, 0, 'Automated Market Valuation');
        if (result) {
          setLastResult(result);
          toast.success(`Valuation published for "${fund.name}"! New NAV: GH₵${result.nav.toFixed(4)}`);
        }
      } else {
        const notes = targetPricePerUnit 
          ? `Published Target Price per Unit (NAV): GH₵${targetPricePerUnit}`
          : selectedAssetId !== 'all' 
            ? `Manual price adjustment for asset ${selectedAssetId}`
            : `Manual performance adjustment: ${gainLossPct}%`;
          
        const assetUpdate = selectedAssetId !== 'all' && newAssetPrice 
          ? { id: selectedAssetId, newPrice: parseFloat(newAssetPrice) }
          : undefined;

        const result = await runManualValuation(
          fund.id, 
          gainValue, 
          notes, 
          manualDate, 
          assetUpdate,
          targetPricePerUnit ? parseFloat(targetPricePerUnit) : undefined
        );

        // Also record formal ValuationRun snapshot
        await executeFormalValuationRun(fund.id, manualDate, 'System Admin', feeConfig, gainValue, notes);

        if (result) {
          setLastResult(result);
          toast.success(`Valuation Run Published for "${fund.name}"! NAV: GH₵${result.nav.toFixed(4)}`);
          setManualGain('');
          setTargetPricePerUnit('');
          setGainLossPct('');
          setNewAssetPrice('');
          setSelectedAssetId('all');
        }
      }
    } catch (error: any) {
      console.error(error);
      toast.error('Error publishing valuation: ' + (error?.message || 'Check logs'));
    } finally {
      setTimeout(() => setIsCalculating(false), 1000);
    }
  };

  const handleUndo = async () => {
    if (!fund || valuations.length === 0 || isCalculating || isUndoing || isRedoing) return;
    const latest = valuations[0];
    const previous = valuations[1];

    setShowUndoConfirm(false);
    setIsUndoing(true);
    try {
      await deleteLatestValuation(fund.id, latest.id, previous);
      setLastResult(null);
      toast.success("Valuation run undone successfully");
    } catch (error: any) {
      toast.error(`Undo failed: ${error.message}`);
    } finally {
      setIsUndoing(false);
    }
  };

  const handleRedo = async () => {
    if (!fund || revertedCount === 0 || isCalculating || isUndoing || isRedoing) return;
    setIsRedoing(true);
    try {
      const result = await redoLatestValuation(fund.id);
      if (result) {
        setLastResult(result);
        toast.success(`Valuation redone! NAV: GH₵${result.nav.toFixed(4)}`);
      }
    } catch (error: any) {
      toast.error(`Redo failed: ${error.message}`);
    } finally {
      setIsRedoing(false);
    }
  };

  const handleReset = async () => {
    if (!fund || isResetting) return;
    setShowResetConfirm(false);
    setIsResetting(true);
    try {
      await resetAllValuations(fund.id);
      setLastResult(null);
      setManualGain('');
      toast.success("Fund valuation history reset to 1.0000 baseline");
    } catch (error: any) {
      toast.error("Reset failed. Check permissions.");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Institutional Top KPI Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-3xl font-black text-white">{fund?.name || 'Global Fund'}</h2>
              <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full text-xs font-bold font-mono">
                {fund?.ticker || 'FND'}
              </span>
            </div>
            <p className="text-xs text-slate-400">Authoritative Fund Valuation Engine & NAV Center</p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setValMethod('automated')}
              className={cn(
                "px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                valMethod === 'automated' ? "bg-emerald-600 text-white shadow-lg" : "bg-slate-800 text-slate-400 hover:text-white"
              )}
            >
              <TrendingUp className="w-4 h-4" /> Automated GSE Market Run
            </button>
            <button 
              onClick={() => setValMethod('manual')}
              className={cn(
                "px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                valMethod === 'manual' ? "bg-blue-600 text-white shadow-lg" : "bg-slate-800 text-slate-400 hover:text-white"
              )}
            >
              <Zap className="w-4 h-4" /> Manual Adjustment Run
            </button>

            <button 
              onClick={runValuation}
              disabled={isCalculating || !fund}
              className="px-8 py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-2xl transition-all shadow-xl shadow-emerald-600/30 flex items-center gap-3 text-sm"
            >
              {isCalculating ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              {isCalculating ? 'Publishing Valuation...' : 'Publish Valuation'}
            </button>
          </div>
        </div>

        {/* Core Financial Metrics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 pt-6 text-xs">
          <div className="space-y-1">
            <span className="text-slate-500 uppercase font-bold text-[10px] tracking-wider">NAV Per Unit</span>
            <p className="text-2xl font-black text-emerald-400 font-mono">
              GH₵{calculatedNAV.toFixed(4)}
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-slate-500 uppercase font-bold text-[10px] tracking-wider">Net Assets (NAV)</span>
            <p className="text-xl font-bold text-white">
              {formatCurrency(netAssets)}
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-slate-500 uppercase font-bold text-[10px] tracking-wider">Total Assets</span>
            <p className="text-xl font-bold text-slate-200">
              {formatCurrency(totalAssets)}
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-slate-500 uppercase font-bold text-[10px] tracking-wider">Total Liabilities</span>
            <p className="text-xl font-bold text-red-400">
              {formatCurrency(totalLiabilities)}
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-slate-500 uppercase font-bold text-[10px] tracking-wider">Units Outstanding</span>
            <p className="text-xl font-bold text-slate-200 font-mono">
              {totalUnits.toLocaleString()}
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-slate-500 uppercase font-bold text-[10px] tracking-wider">Exceptions Status</span>
            <div>
              {exceptions.some(e => e.severity === 'CRITICAL') ? (
                <span className="bg-red-500/10 text-red-400 border border-red-500/20 px-2.5 py-1 rounded-full font-bold text-[10px]">
                  ⚠️ {exceptions.length} Critical Exceptions
                </span>
              ) : exceptions.length > 0 ? (
                <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-1 rounded-full font-bold text-[10px]">
                  ⚡ {exceptions.length} Warnings
                </span>
              ) : (
                <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full font-bold text-[10px]">
                  ✅ Clean & Verified
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sub-Navigation Bar */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-4 overflow-x-auto">
        <button 
          onClick={() => setActiveTab('workspace')}
          className={cn(
            "px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap",
            activeTab === 'workspace' ? "bg-emerald-600 text-white shadow-lg" : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
          )}
        >
          <Calculator className="w-4 h-4" /> Valuation Workspace
        </button>
        <button 
          onClick={() => setActiveTab('nav_bridge')}
          className={cn(
            "px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap",
            activeTab === 'nav_bridge' ? "bg-emerald-600 text-white shadow-lg" : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
          )}
        >
          <Layers className="w-4 h-4" /> NAV Movement Bridge
        </button>
        <button 
          onClick={() => setActiveTab('exceptions')}
          className={cn(
            "px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap relative",
            activeTab === 'exceptions' ? "bg-emerald-600 text-white shadow-lg" : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
          )}
        >
          <Scale className="w-4 h-4" /> Reconciliation & Exception Center
          {exceptions.length > 0 && (
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
          )}
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          className={cn(
            "px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap",
            activeTab === 'history' ? "bg-emerald-600 text-white shadow-lg" : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
          )}
        >
          <History className="w-4 h-4" /> Valuation Runs History
        </button>
      </div>

      {/* SUB-TAB 1: VALUATION WORKSPACE */}
      {activeTab === 'workspace' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          {/* Left 2 Columns: Calculation & Asset Pricing Table */}
          <div className="xl:col-span-2 space-y-6">
            {/* Manual Adjustment Inputs if Manual Mode */}
            {valMethod === 'manual' && (
              <div className="bg-blue-600/10 border border-blue-500/30 rounded-3xl p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-500/20 rounded-xl flex items-center justify-center text-blue-400">
                      <Zap className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider">Manual Valuation Adjustment</h3>
                      <p className="text-[10px] text-slate-400">Override asset prices or set target published NAV</p>
                    </div>
                  </div>
                  <input 
                    type="date"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Direct Target NAV per Unit</label>
                    <input 
                      type="number"
                      step="0.0001"
                      value={targetPricePerUnit}
                      onChange={(e) => handleTargetNavChange(e.target.value)}
                      placeholder="e.g. 0.2700"
                      className="w-full bg-slate-950 border border-emerald-500/40 rounded-xl px-4 py-3 text-base font-bold text-white outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Gain / Loss Amount (GH₵)</label>
                    <input 
                      type="number"
                      value={manualGain}
                      onChange={(e) => handleGainChange(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm font-bold text-white outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Asset Valuation Table with Price Status Badges */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
              <div className="p-6 bg-slate-800/40 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white">Portfolio Securities & Price Status</h3>
                  <p className="text-xs text-slate-400">Market-traded securities and price status inspection</p>
                </div>
                <span className="text-xs bg-slate-800 text-slate-300 border border-slate-700 px-3 py-1 rounded-full font-bold">
                  {activePortfolio.length} Assets Held
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-950/50 border-b border-slate-800 text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                      <th className="px-6 py-4">Ticker / Asset</th>
                      <th className="px-6 py-4 text-right">Holdings</th>
                      <th className="px-6 py-4 text-right">Avg Cost</th>
                      <th className="px-6 py-4 text-right">Market Price</th>
                      <th className="px-6 py-4 text-right">Market Value</th>
                      <th className="px-6 py-4 text-right">Unrealized P/L</th>
                      <th className="px-6 py-4 text-center">Price Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs">
                    {assetStatuses.map((ast) => {
                      const origAsset = activePortfolio.find(a => a.id === ast.assetId);
                      const gainLoss = ast.marketValue - (origAsset?.totalCostBasis || 0);

                      return (
                        <tr key={ast.assetId} className="hover:bg-slate-800/30 transition-colors">
                          <td className="px-6 py-4 font-bold text-white">
                            <div>{ast.ticker}</div>
                            <div className="text-[10px] text-slate-500 font-normal">{ast.name}</div>
                          </td>
                          <td className="px-6 py-4 text-right font-mono text-slate-300">
                            {origAsset?.quantity.toLocaleString()}
                          </td>
                          <td className="px-6 py-4 text-right font-mono text-slate-400">
                            {formatCurrency(origAsset?.costBasis || 0)}
                          </td>
                          <td className="px-6 py-4 text-right font-mono font-bold text-white">
                            {formatCurrency(ast.currentPrice)}
                          </td>
                          <td className="px-6 py-4 text-right font-mono font-bold text-emerald-400">
                            {formatCurrency(ast.marketValue)}
                          </td>
                          <td className={cn("px-6 py-4 text-right font-mono font-bold", gainLoss >= 0 ? "text-emerald-400" : "text-red-400")}>
                            {gainLoss >= 0 ? '+' : ''}{formatCurrency(gainLoss)}
                          </td>
                          <td className="px-6 py-4 text-center">
                            {ast.status === 'PRICED' && (
                              <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                                PRICED
                              </span>
                            )}
                            {ast.status === 'STALE' && (
                              <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-0.5 rounded-full text-[10px] font-bold" title={ast.warningMessage}>
                                STALE ({ast.daysStale}d)
                              </span>
                            )}
                            {ast.status === 'MANUAL' && (
                              <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                                MANUAL
                              </span>
                            )}
                            {ast.status === 'MISSING' && (
                              <span className="bg-red-500/10 text-red-400 border border-red-500/20 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                                MISSING
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Fee Accrual Widget */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-amber-500" />
                  Daily Expense & Fee Accruals Engine
                </h3>
                <span className="text-xs text-slate-400 font-mono">365-Day Count Convention</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                <div className="p-4 bg-slate-800/40 rounded-2xl border border-slate-800 space-y-1">
                  <span className="text-slate-500 uppercase text-[10px] font-bold">Daily Mgmt Fee (1.50%)</span>
                  <p className="text-lg font-bold text-white">{formatCurrency(feeAccruals.dailyManagementFee)}</p>
                </div>
                <div className="p-4 bg-slate-800/40 rounded-2xl border border-slate-800 space-y-1">
                  <span className="text-slate-500 uppercase text-[10px] font-bold">Daily Custody Fee (0.25%)</span>
                  <p className="text-lg font-bold text-white">{formatCurrency(feeAccruals.dailyCustodyFee)}</p>
                </div>
                <div className="p-4 bg-slate-800/40 rounded-2xl border border-slate-800 space-y-1">
                  <span className="text-slate-500 uppercase text-[10px] font-bold">Daily Admin Fee (0.10%)</span>
                  <p className="text-lg font-bold text-white">{formatCurrency(feeAccruals.dailyAdminFee)}</p>
                </div>
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl space-y-1">
                  <span className="text-amber-400 uppercase text-[10px] font-bold">Total Daily Accrual</span>
                  <p className="text-lg font-bold text-amber-300">{formatCurrency(feeAccruals.totalDailyAccrual)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: AI Valuation Intelligence Chat */}
          <div>
            <ValuationIntelligence 
              fund={fund}
              portfolio={activePortfolio}
              investors={activeInvestors}
              valuations={valuations}
            />
          </div>
        </div>
      )}

      {/* SUB-TAB 2: NAV MOVEMENT BRIDGE */}
      {activeTab === 'nav_bridge' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-8 shadow-2xl">
          <div>
            <h3 className="text-2xl font-bold text-white">NAV Waterfall Movement Bridge</h3>
            <p className="text-slate-400 text-sm mt-1">
              Decomposes per-unit NAV movement from Previous Valuation into performance vs cash flow components.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-6 gap-4 text-center">
            <div className="p-5 bg-slate-800/40 border border-slate-800 rounded-2xl space-y-1">
              <span className="text-slate-500 uppercase text-[10px] font-bold">Opening NAV</span>
              <p className="text-xl font-bold text-white font-mono">GH₵{navBridge.previousNav.toFixed(4)}</p>
            </div>
            <div className="p-5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl space-y-1">
              <span className="text-emerald-400 uppercase text-[10px] font-bold">Portfolio Impact</span>
              <p className="text-xl font-bold text-emerald-400 font-mono">
                {navBridge.portfolioMovement >= 0 ? '+' : ''}{navBridge.portfolioMovement.toFixed(4)}
              </p>
            </div>
            <div className="p-5 bg-blue-500/10 border border-blue-500/20 rounded-2xl space-y-1">
              <span className="text-blue-400 uppercase text-[10px] font-bold">Realized Gains</span>
              <p className="text-xl font-bold text-blue-400 font-mono">
                +{navBridge.realizedGainMovement.toFixed(4)}
              </p>
            </div>
            <div className="p-5 bg-red-500/10 border border-red-500/20 rounded-2xl space-y-1">
              <span className="text-red-400 uppercase text-[10px] font-bold">Fee Accruals</span>
              <p className="text-xl font-bold text-red-400 font-mono">
                {navBridge.expenseMovement.toFixed(4)}
              </p>
            </div>
            <div className="p-5 bg-slate-800/40 border border-slate-800 rounded-2xl space-y-1">
              <span className="text-slate-400 uppercase text-[10px] font-bold">Cash Flows</span>
              <p className="text-xl font-bold text-slate-200 font-mono">
                {navBridge.netCashFlowMovement.toFixed(4)}
              </p>
            </div>
            <div className="p-5 bg-emerald-600 text-white rounded-2xl space-y-1 shadow-lg shadow-emerald-600/20">
              <span className="text-emerald-100 uppercase text-[10px] font-bold">Closing NAV</span>
              <p className="text-2xl font-black font-mono">GH₵{navBridge.closingNav.toFixed(4)}</p>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: RECONCILIATION & EXCEPTIONS */}
      {activeTab === 'exceptions' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6">
            <h3 className="text-2xl font-bold text-white flex items-center gap-3">
              <Scale className="w-6 h-6 text-amber-500" />
              Valuation Exceptions & Anomaly Inspector
            </h3>

            {exceptions.length === 0 ? (
              <div className="p-8 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-center space-y-2">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
                <h4 className="text-lg font-bold text-white">No Valuation Exceptions Detected</h4>
                <p className="text-xs text-slate-400">All pricing, cash balances, liabilities, and unit ledgers reconcile cleanly.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {exceptions.map(exc => (
                  <div key={exc.id} className={cn(
                    "p-6 rounded-2xl border space-y-2",
                    exc.severity === 'CRITICAL' ? "bg-red-500/10 border-red-500/30" : "bg-amber-500/10 border-amber-500/30"
                  )}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "px-2.5 py-0.5 rounded text-[10px] font-bold uppercase",
                          exc.severity === 'CRITICAL' ? "bg-red-500/20 text-red-300" : "bg-amber-500/20 text-amber-300"
                        )}>
                          {exc.severity}
                        </span>
                        <span className="font-mono text-xs text-slate-300 font-bold">{exc.code}</span>
                      </div>
                      <span className="text-xs text-slate-400">Affected Item: <strong className="text-white">{exc.item}</strong></span>
                    </div>

                    <p className="text-sm font-semibold text-white">{exc.description}</p>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      💡 <strong className="text-slate-200">Recommended Action:</strong> {exc.recommendedAction}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 4: HISTORICAL VALUATION RUNS */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 flex items-center justify-between">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <History className="w-5 h-5 text-emerald-500" />
              Formal Valuation Runs History & Immutability Audit
            </h3>

            <div className="flex items-center gap-2">
              {valuations.length > 0 && (
                <button 
                  onClick={handleUndo}
                  disabled={isUndoing}
                  className="px-3.5 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
                >
                  <RotateCcw className={cn("w-3.5 h-3.5", isUndoing && "animate-spin")} /> Undo Latest Run
                </button>
              )}
              <button 
                onClick={() => setShowResetConfirm(true)}
                className="px-3.5 py-2 bg-slate-800 hover:bg-red-600 text-slate-400 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2"
              >
                <Trash2 className="w-3.5 h-3.5" /> Reset Record
              </button>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950/50 border-b border-slate-800 text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                    <th className="px-6 py-4">Valuation Date</th>
                    <th className="px-6 py-4">Run Number</th>
                    <th className="px-6 py-4 text-right">Published NAV</th>
                    <th className="px-6 py-4 text-right">Net Assets (AUM)</th>
                    <th className="px-6 py-4 text-center">Status</th>
                    <th className="px-6 py-4">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {valuations.map((v, idx) => (
                    <tr key={v.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4 font-mono text-slate-300">
                        {v.date?.seconds ? new Date(v.date.seconds * 1000).toLocaleString() : 'Just now'}
                      </td>
                      <td className="px-6 py-4 font-mono font-bold text-blue-400">
                        VAL-{v.id.substring(0, 8)}
                      </td>
                      <td className="px-6 py-4 text-right font-mono font-bold text-emerald-400">
                        {formatCurrency(v.nav)}
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-white">
                        {formatCurrency(v.aum)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center justify-center gap-1 w-fit mx-auto">
                          <Lock className="w-3 h-3" /> FINAL
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-400 italic">
                        {v.notes || 'Published Valuation'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {valuations.length === 0 && (
                <div className="py-16 text-center text-slate-500 text-sm">
                  No valuation history logged yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
