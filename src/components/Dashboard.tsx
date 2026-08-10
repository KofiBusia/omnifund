import { useMemo, useState } from 'react';
import { InvestmentAccount, Investor, Asset, Valuation } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { toast } from 'sonner';
import { reconcileAccountCash } from '../services/valuationService';
import { calculateNetAssets, roundMoney } from '../services/fundAccountingEngine';
import { 
  TrendingUp, 
  Users, 
  DollarSign, 
  PieChart as PieChartIcon,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  AlertCircle,
  Wand2,
  Table,
  Loader2
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area
} from 'recharts';
import { motion } from 'motion/react';

interface DashboardProps {
  fund: InvestmentAccount | null;
  investors: Investor[];
  portfolio: Asset[];
  valuations: Valuation[];
  onDownloadBackup?: () => void;
  isBackingUp?: boolean;
  role?: 'admin' | 'investor' | null;
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function Dashboard({ 
  fund, 
  investors, 
  portfolio, 
  valuations,
  onDownloadBackup,
  isBackingUp = false,
  role
}: DashboardProps) {
  const [isReconciling, setIsReconciling] = useState(false);

  const handleFixBalance = async () => {
    if (!fund || fund.cashBalance >= 0 || isReconciling) return;
    
    setIsReconciling(true);
    const amountToInject = Math.abs(fund.cashBalance);
    const loadingToast = toast.loading(`Injecting ${formatCurrency(amountToInject)} to cover negative balance...`);
    
    try {
      await reconcileAccountCash(fund.id, amountToInject);
      toast.success("Cash balance reconciled successfully", { id: loadingToast });
    } catch (error: any) {
      toast.error(`Reconciliation failed: ${error.message}`, { id: loadingToast });
    } finally {
      setIsReconciling(false);
    }
  };

  const sortedValuations = useMemo(() => 
    [...valuations].sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0)),
    [valuations]
  );

  const latestValuation = sortedValuations[0];
  const previousValuation = sortedValuations[1];

  const calculateChange = (current: number, previous: number) => {
    if (!previous || previous === 0) return 0;
    return ((current - previous) / previous) * 100;
  };

  const aumChange = useMemo(() => 
    latestValuation && previousValuation 
      ? calculateChange(latestValuation.aum, previousValuation.aum) 
      : 0,
    [latestValuation, previousValuation]
  );
  
  const navChange = useMemo(() => 
    latestValuation && previousValuation 
      ? calculateChange(latestValuation.nav, previousValuation.nav) 
      : 0,
    [latestValuation, previousValuation]
  );

  const stats = useMemo(() => [
    { 
      label: 'AUM (Assets Under Management)', 
      value: fund?.aum ? formatCurrency(fund.aum) : 'GH₵0.00', 
      icon: DollarSign, 
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
      live: true,
      change: aumChange
    },
    { 
      label: 'Price per Unit (NAV)', 
      value: fund?.nav ? formatCurrency(fund.nav) : 'GH₵0.0000', 
      icon: TrendingUp, 
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
      live: true,
      change: navChange
    },
    { 
      label: 'Cash Balance', 
      value: fund?.cashBalance ? formatCurrency(fund.cashBalance) : 'GH₵0.00', 
      icon: DollarSign, 
      color: fund?.cashBalance && fund.cashBalance < 0 ? 'text-red-500' : 'text-amber-500',
      bg: fund?.cashBalance && fund.cashBalance < 0 ? 'bg-red-500/10' : 'bg-amber-500/10',
      warning: fund?.cashBalance && fund.cashBalance < 0 ? 'Negative Cash' : null,
      onAction: fund?.cashBalance && fund.cashBalance < 0 ? handleFixBalance : null,
      actionIcon: Wand2,
      actionLabel: 'Resolve'
    },
    { 
      label: 'Total Investors', 
      value: investors.length.toString(), 
      icon: Users, 
      color: 'text-purple-500',
      bg: 'bg-purple-500/10'
    },
    { 
      label: 'Assets Held', 
      value: portfolio.length.toString(), 
      icon: PieChartIcon, 
      color: 'text-purple-500',
      bg: 'bg-purple-500/10'
    },
  ], [fund?.aum, fund?.nav, fund?.cashBalance, aumChange, navChange, investors.length, portfolio.length]);

  const chartData = useMemo(() => {
    const aggregated = new Map<string, number>();
    portfolio.forEach(asset => {
      aggregated.set(asset.ticker, (aggregated.get(asset.ticker) || 0) + asset.marketValue);
    });

    return Array.from(aggregated.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [portfolio]);

  const performanceData = useMemo(() => 
    [...valuations].reverse().map(v => ({
      date: v.date?.seconds ? new Date(v.date.seconds * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'N/A',
      nav: v.nav,
      aum: v.aum,
      timestamp: v.date?.seconds || 0
    })).sort((a, b) => a.timestamp - b.timestamp),
    [valuations]
  );

  const allTimeHighNav = useMemo(() => Math.max(...valuations.map(v => v.nav), 0), [valuations]);
  
  const totalReturn = useMemo(() => {
    const firstValuation = sortedValuations[sortedValuations.length - 1];
    return firstValuation && latestValuation 
      ? calculateChange(latestValuation.nav, firstValuation.nav) 
      : 0;
  }, [sortedValuations, latestValuation]);

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div className="flex items-start gap-4 flex-wrap sm:flex-nowrap">
          <div>
            <h2 className="text-3xl font-bold text-white">Dashboard Overview</h2>
            <p className="text-slate-400 mt-1">Real-time fund performance and metrics</p>
          </div>
          {role === 'admin' && onDownloadBackup && (
            <button
              onClick={onDownloadBackup}
              disabled={isBackingUp}
              className="bg-amber-600/10 hover:bg-amber-600/20 text-amber-500 border border-amber-500/20 px-3.5 py-1.5 rounded-xl font-medium flex items-center gap-2 transition-all text-xs disabled:opacity-50 mt-1"
              title="Backup complete database"
            >
              {isBackingUp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Table className="w-3.5 h-3.5" />}
              Backup Database
            </button>
          )}
        </div>
        <div className="text-right flex flex-col items-end">
          <div className="flex items-center gap-3 mb-1">
            <button 
              onClick={handleFixBalance}
              disabled={!fund || fund.cashBalance >= 0 || isReconciling}
              className={cn(
                "flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-all",
                fund && fund.cashBalance < 0 
                  ? "bg-red-500 hover:bg-red-400 text-white animate-pulse" 
                  : "bg-slate-800 text-slate-500 cursor-not-allowed"
              )}
            >
              <AlertCircle className="w-3 h-3" />
              {fund && fund.cashBalance < 0 ? `Fix Negative Cash (${formatCurrency(Math.abs(fund.cashBalance))})` : "Cash Balanced"}
            </button>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest">Live Market Data</span>
            </div>
          </div>
          <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider">Last Valuation</p>
          <p className="text-sm text-slate-300">{fund?.lastValuationDate ? new Date(fund.lastValuationDate).toLocaleString() : 'N/A'}</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-sm relative group"
          >
            <div className="flex items-start justify-between mb-4">
              <div className={`p-3 rounded-xl ${stat.bg}`}>
                <stat.icon className={`w-6 h-6 ${stat.color}`} />
              </div>
              <div className="flex flex-col items-end gap-1">
                {(stat as any).warning && (
                  <div className="bg-red-500/10 text-red-500 px-2 py-0.5 rounded-full border border-red-500/20 text-[10px] font-bold uppercase flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {(stat as any).warning}
                  </div>
                )}
                {stat.live && (
                  <div className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    <div className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Live</span>
                  </div>
                )}
                {stat.change !== undefined && (
                  <div className={cn(
                    "flex items-center gap-1 text-xs font-medium",
                    stat.change >= 0 ? "text-emerald-500" : "text-red-500"
                  )}>
                    {stat.change >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    <span>{stat.change >= 0 ? '+' : ''}{stat.change.toFixed(2)}%</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-slate-400 text-sm font-medium">{stat.label}</p>
                <h3 className="text-2xl font-bold text-white mt-1">{stat.value}</h3>
              </div>
              {(stat as any).onAction && (() => {
                const ActionIcon = (stat as any).actionIcon;
                return (
                  <button 
                    onClick={(stat as any).onAction}
                    disabled={isReconciling}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white p-2 rounded-lg transition-all shadow-lg shadow-indigo-600/20 opacity-0 group-hover:opacity-100 flex items-center gap-2 text-[10px] font-bold uppercase"
                  >
                    {isReconciling ? <Loader2 className="w-3 h-3 animate-spin" /> : <ActionIcon className="w-3 h-3" />}
                    {(stat as any).actionLabel}
                  </button>
                );
              })()}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Performance Summary Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
          <p className="text-slate-400 text-sm font-medium">All-time High NAV</p>
          <h3 className="text-2xl font-bold text-white mt-1">{formatCurrency(allTimeHighNav)}</h3>
          <p className="text-xs text-slate-500 mt-2 uppercase tracking-wider font-bold">Peak Performance</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
          <p className="text-slate-400 text-sm font-medium">Total Fund Return</p>
          <h3 className={cn(
            "text-2xl font-bold mt-1",
            totalReturn >= 0 ? "text-emerald-500" : "text-red-500"
          )}>
            {totalReturn >= 0 ? '+' : ''}{totalReturn.toFixed(2)}%
          </h3>
          <p className="text-xs text-slate-500 mt-2 uppercase tracking-wider font-bold">Since Inception</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
          <p className="text-slate-400 text-sm font-medium">Investor Sentiment</p>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex -space-x-2">
              {investors.slice(0, 3).map((investor, i) => (
                <div key={i} className="w-8 h-8 rounded-full bg-slate-800 border-2 border-slate-900 flex items-center justify-center text-[10px] font-bold text-white">
                  {investor.name.charAt(0)}
                </div>
              ))}
            </div>
            <span className="text-sm text-slate-300 font-medium">+{investors.length} Active Investors</span>
          </div>
          <p className="text-xs text-slate-500 mt-2 uppercase tracking-wider font-bold">Community Growth</p>
        </div>
      </div>

      {/* Performance Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Fund Growth (AUM) */}
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-bold text-white">Fund Growth (AUM)</h3>
              <p className="text-sm text-slate-500">Total assets under management over time</p>
            </div>
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <TrendingUp className="w-5 h-5 text-blue-500" />
            </div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={performanceData}>
                <defs>
                  <linearGradient id={`colorAum-${fund?.ticker || 'default'}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis 
                  dataKey="timestamp" 
                  stroke="#64748b" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  minTickGap={30}
                  tickFormatter={(val) => {
                    const entry = performanceData.find(d => d.timestamp === val);
                    return entry ? entry.date : '';
                  }}
                />
                <YAxis 
                  stroke="#64748b" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  tickFormatter={(value) => `GH₵${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                  itemStyle={{ color: '#3b82f6' }}
                  formatter={(value: number) => [formatCurrency(value), 'AUM']}
                  labelFormatter={(val) => {
                    const entry = performanceData.find(d => d.timestamp === val);
                    return entry ? entry.date : '';
                  }}
                />
                <Area type="monotone" dataKey="aum" stroke="#3b82f6" fillOpacity={1} fill={`url(#colorAum-${fund?.ticker || 'default'})`} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* NAV Performance (Investor Returns) */}
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-bold text-white">NAV Performance</h3>
              <p className="text-sm text-slate-500">Net Asset Value per unit (Investor Returns)</p>
            </div>
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <Activity className="w-5 h-5 text-emerald-500" />
            </div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={performanceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis 
                  dataKey="timestamp" 
                  stroke="#64748b" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  minTickGap={30}
                  tickFormatter={(val) => {
                    const entry = performanceData.find(d => d.timestamp === val);
                    return entry ? entry.date : '';
                  }}
                />
                <YAxis 
                  stroke="#64748b" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  domain={['auto', 'auto']}
                  tickFormatter={(value) => `GH₵${value.toFixed(4)}`}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                  itemStyle={{ color: '#10b981' }}
                  formatter={(value: number) => [`GH₵${value.toFixed(4)}`, 'NAV']}
                  labelFormatter={(val) => {
                    const entry = performanceData.find(d => d.timestamp === val);
                    return entry ? entry.date : '';
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="nav" 
                  stroke="#10b981" 
                  strokeWidth={3} 
                  dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#0f172a' }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Portfolio Allocation */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 p-8 rounded-2xl">
          <h3 className="text-xl font-bold text-white mb-6">Portfolio Allocation</h3>
          <div className="h-[350px] min-h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  stroke="#64748b" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false}
                />
                <YAxis 
                  stroke="#64748b" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false}
                  tickFormatter={(value) => `GH₵${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                  itemStyle={{ color: '#10b981' }}
                  formatter={(value: number) => [formatCurrency(value), 'Value']}
                />
                <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Asset Distribution */}
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl">
          <h3 className="text-xl font-bold text-white mb-6">Asset Mix</h3>
          <div className="h-[300px] min-h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                  formatter={(value: number) => [formatCurrency(value), 'Market Value']}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-3 mt-4">
            {chartData.slice(0, 4).map((item, i) => (
              <div key={item.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-slate-400">{item.name}</span>
                </div>
                <span className="text-white font-medium">
                  {((item.value / (fund?.aum || 1)) * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
