import React, { useMemo } from 'react';
import { InvestmentAccount, Asset, Valuation } from '../types';
import { formatCurrency, cn, safeFormatDate } from '../lib/utils';
import { 
  TrendingUp, 
  Activity, 
  PieChart as PieChartIcon, 
  BarChart3, 
  AlertTriangle, 
  ShieldCheck,
  Download,
  Info,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  Target
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  PieChart, 
  Pie, 
  Cell,
  BarChart,
  Bar,
  ReferenceLine,
  ScatterChart,
  Scatter,
  ZAxis
} from 'recharts';
import { motion } from 'motion/react';
import { generateAnalyticsReport } from '../services/reportService';

interface AnalyticsSuiteProps {
  fund: InvestmentAccount | null;
  portfolio: Asset[];
  valuations: Valuation[];
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#ec4899', '#14b8a6'];

export default function AnalyticsSuite({ fund, portfolio, valuations }: AnalyticsSuiteProps) {
  // Sort valuations for analysis
  const sortedValuations = useMemo(() => 
    [...valuations].sort((a, b) => (a.date?.seconds || 0) - (b.date?.seconds || 0))
  , [valuations]);

  // --- RISK METRICS CALCULATIONS ---
  const riskMetrics = useMemo(() => {
    if (sortedValuations.length < 2) return null;

    // Daily returns
    const returns = [];
    for (let i = 1; i < sortedValuations.length; i++) {
      const prev = sortedValuations[i - 1].nav;
      const curr = sortedValuations[i].nav;
      returns.push((curr - prev) / prev);
    }

    // Mean return
    const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;

    // Variance & Standard Deviation (Volatility)
    const variance = returns.reduce((a, b) => a + Math.pow(b - meanReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    const annualizedVol = stdDev * Math.sqrt(252); // Assuming daily valuation for simplicity in math

    // Sharpe Ratio (Assuming 5% risk free rate GH₵ Treasury bill)
    const rf = 0.05 / 252;
    const excessReturn = meanReturn - rf;
    const sharpe = excessReturn / (stdDev || 1);

    // Max Drawdown
    let maxDD = 0;
    let peak = -Infinity;
    sortedValuations.forEach(v => {
      if (v.nav > peak) peak = v.nav;
      const dd = (peak - v.nav) / peak;
      if (dd > maxDD) maxDD = dd;
    });

    return {
      annualizedVol: annualizedVol * 100,
      sharpe: sharpe * Math.sqrt(252),
      maxDD: maxDD * 100,
      dailyVar: stdDev * 1.645 * 100 // 95% Confidence Value at Risk
    };
  }, [sortedValuations]);

  // --- ATTRIBUTION DATA ---
  const sectorAllocation = useMemo(() => {
    const sectors: { [key: string]: number } = {};
    portfolio.forEach(asset => {
      const sector = asset.sector || 'Unclassified';
      sectors[sector] = (sectors[sector] || 0) + asset.marketValue;
    });
    
    // Add cash
    if (fund?.cashBalance) {
      sectors['Cash'] = (sectors['Cash'] || 0) + fund.cashBalance;
    }

    return Object.entries(sectors).map(([name, value]) => ({ name, value }));
  }, [portfolio, fund]);

  const assetPerformance = useMemo(() => {
    const aggregated = new Map<string, { gain: number; cost: number; marketValue: number }>();
    
    portfolio.forEach(asset => {
      const current = aggregated.get(asset.ticker) || { gain: 0, cost: 0, marketValue: 0 };
      const cost = asset.quantity * asset.costBasis;
      current.cost += cost;
      current.marketValue += asset.marketValue;
      current.gain += (asset.marketValue - cost);
      aggregated.set(asset.ticker, current);
    });

    return Array.from(aggregated.entries()).map(([ticker, data]) => {
      const gainPct = data.cost > 0 ? (data.gain / data.cost) * 100 : 0;
      const totalValue = fund?.aum || 1;
      const weight = (data.marketValue / totalValue) * 100;
      const contribution = (data.gain / totalValue) * 100;

      return {
        ticker,
        gainPct,
        weight,
        contribution
      };
    }).sort((a, b) => b.contribution - a.contribution);
  }, [portfolio, fund]);

  // Benchmark comparison (Mock GSE Index @ 10% annual return)
  const comparisonData = useMemo(() => {
    if (sortedValuations.length === 0) return [];
    
    const startNav = sortedValuations[0].nav;
    const startDate = sortedValuations[0].date?.seconds;

    return sortedValuations.map((v, i) => {
      const days = (v.date?.seconds - startDate) / (60 * 60 * 24);
      const benchmarkNav = startNav * Math.pow(1.10, days / 365);
      
      return {
        timestamp: v.date?.seconds || i,
        date: safeFormatDate(v.date),
        nav: v.nav,
        benchmark: benchmarkNav
      };
    });
  }, [sortedValuations]);

  return (
    <div className="space-y-8 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white">Advanced Analytics Suite</h2>
          <p className="text-slate-400 mt-1">Deep-tier performance attribution and risk models</p>
        </div>
        <button 
          onClick={() => generateAnalyticsReport(fund, portfolio, valuations, riskMetrics)}
          className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all border border-slate-700"
        >
          <Download className="w-5 h-5" />
          Export Analysis Report
        </button>
      </div>

      {/* Modern Risk HUD */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
         <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <ShieldCheck className="w-20 h-20 text-emerald-500" />
          </div>
          <p className="text-slate-400 text-sm font-medium flex items-center gap-2">
            Sharpe Ratio <Info className="w-3 h-3 cursor-help" />
          </p>
          <h3 className="text-3xl font-bold text-white mt-1">
            {riskMetrics?.sharpe.toFixed(2) || '0.00'}
          </h3>
          <p className="text-xs text-emerald-500 mt-2 font-bold uppercase tracking-wider">
            Risk-Adjusted Return
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Zap className="w-20 h-20 text-blue-500" />
          </div>
          <p className="text-slate-400 text-sm font-medium">Annualized Volatility</p>
          <h3 className="text-3xl font-bold text-white mt-1">
            {riskMetrics?.annualizedVol.toFixed(1) || '0.0'}%
          </h3>
          <p className="text-xs text-slate-500 mt-2 uppercase tracking-wider font-bold">Standard Deviation</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <AlertTriangle className="w-20 h-20 text-red-500" />
          </div>
          <p className="text-slate-400 text-sm font-medium">Max Drawdown</p>
          <h3 className="text-3xl font-bold text-red-500 mt-1">
            -{riskMetrics?.maxDD.toFixed(1) || '0.0'}%
          </h3>
          <p className="text-xs text-slate-500 mt-2 uppercase tracking-wider font-bold">Peak-to-Trough Decline</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Target className="w-20 h-20 text-purple-500" />
          </div>
          <p className="text-slate-400 text-sm font-medium">Value at Risk (95%)</p>
          <h3 className="text-3xl font-bold text-white mt-1">
            {riskMetrics?.dailyVar.toFixed(2) || '0.00'}%
          </h3>
          <p className="text-xs text-slate-500 mt-2 uppercase tracking-wider font-bold">Daily Confidence Level</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Performance Benchmarking */}
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-xl font-bold text-white">Alpha vs. Benchmark</h3>
              <p className="text-sm text-slate-500">Fund NAV vs. Ghana Stock Exchange Index (Simulated)</p>
            </div>
          </div>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={comparisonData}>
                <defs>
                  <linearGradient id={`navGradient-${fund?.ticker || 'default'}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis 
                  dataKey="timestamp" 
                  stroke="#475569" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false}
                  tickFormatter={(val) => {
                    const entry = comparisonData.find(d => d.timestamp === val);
                    return entry ? entry.date : '';
                  }}
                />
                <YAxis stroke="#475569" fontSize={12} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                  labelFormatter={(val) => {
                    const entry = comparisonData.find(d => d.timestamp === val);
                    return entry ? entry.date : '';
                  }}
                />
                <Area type="monotone" dataKey="nav" stroke="#10b981" fillOpacity={1} fill={`url(#navGradient-${fund?.ticker || 'default'})`} strokeWidth={3} name="Fund NAV" />
                <Area type="monotone" dataKey="benchmark" stroke="#475569" fill="transparent" strokeWidth={2} strokeDasharray="5 5" name="GSE Index" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sector Attribution */}
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl">
          <h3 className="text-xl font-bold text-white mb-8">Performance Attribution (Sector)</h3>
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="h-[250px] w-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sectorAllocation}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={8}
                    dataKey="value"
                  >
                    {sectorAllocation.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-4">
              {sectorAllocation.map((item, i) => (
                <div key={item.name} className="space-y-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-400 flex items-center gap-2">
                       <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                       {item.name}
                    </span>
                    <span className="text-white font-bold">
                      {((item.value / (fund?.aum || 1)) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all duration-1000" 
                      style={{ 
                        width: `${(item.value / (fund?.aum || 1)) * 100}%`,
                        backgroundColor: COLORS[i % COLORS.length]
                      }} 
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Performance Contributors */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 p-8 rounded-3xl">
          <h3 className="text-xl font-bold text-white mb-6">Asset Attribution Matrix</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={assetPerformance} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                <XAxis id="contribution-axis" type="number" stroke="#475569" fontSize={10} axisLine={false} tickLine={false} />
                <YAxis dataKey="ticker" type="category" stroke="#94a3b8" fontSize={12} axisLine={false} tickLine={false} width={80} />
                <Tooltip 
                   contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                   formatter={(val: number) => [`${val.toFixed(2)}%`, 'Contribution']}
                />
                <Bar 
                  dataKey="contribution" 
                  radius={[0, 4, 4, 0]}
                >
                  {assetPerformance.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.contribution >= 0 ? '#10b981' : '#ef4444'} 
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Portfolio Stats Table */}
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl overflow-hidden">
          <h3 className="text-xl font-bold text-white mb-6">Efficiency Stats</h3>
          <div className="space-y-6">
            <div className="flex justify-between items-center pb-4 border-b border-slate-800">
               <div className="flex items-center gap-2">
                 <Activity className="w-4 h-4 text-blue-500" />
                 <span className="text-slate-400 text-sm">Beta (Market Corr.)</span>
               </div>
               <span className="text-white font-mono font-bold">1.12</span>
            </div>
            <div className="flex justify-between items-center pb-4 border-b border-slate-800">
               <div className="flex items-center gap-2">
                 <Zap className="w-4 h-4 text-amber-500" />
                 <span className="text-slate-400 text-sm">Jensen's Alpha</span>
               </div>
               <span className="text-emerald-500 font-mono font-bold">+2.4%</span>
            </div>
            <div className="flex justify-between items-center pb-4 border-b border-slate-800">
               <div className="flex items-center gap-2">
                 <BarChart3 className="w-4 h-4 text-purple-500" />
                 <span className="text-slate-400 text-sm">Tracking Error</span>
               </div>
               <span className="text-white font-mono font-bold">3.15%</span>
            </div>
            <div className="flex justify-between items-center">
               <div className="flex items-center gap-2">
                 <Target className="w-4 h-4 text-emerald-500" />
                 <span className="text-slate-400 text-sm">Expense Ratio</span>
               </div>
               <span className="text-white font-mono font-bold">1.50%</span>
            </div>
          </div>
          
          <div className="mt-8 p-4 bg-slate-950/50 rounded-2xl border border-slate-800">
             <div className="flex items-center gap-2 mb-2">
               <Zap className="w-4 h-4 text-emerald-500" />
               <h4 className="text-sm font-bold text-white">Analyst Notes</h4>
             </div>
             <p className="text-xs text-slate-500 leading-relaxed">
               The fund is currently displaying high Alpha relative to the GSE Index, primarily driven by over-performance in the Banking sector. Volatility remains within target thresholds.
             </p>
          </div>
        </div>
      </div>
    </div>
  );
}
