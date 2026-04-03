import { InvestmentAccount, Investor, Asset } from '../types';
import { formatCurrency } from '../lib/utils';
import { 
  TrendingUp, 
  Users, 
  DollarSign, 
  PieChart as PieChartIcon,
  ArrowUpRight,
  ArrowDownRight
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
  Cell
} from 'recharts';
import { motion } from 'motion/react';

interface DashboardProps {
  fund: InvestmentAccount | null;
  investors: Investor[];
  portfolio: Asset[];
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function Dashboard({ fund, investors, portfolio }: DashboardProps) {
  const stats = [
    { 
      label: 'AUM (Assets Under Management)', 
      value: fund?.aum ? formatCurrency(fund.aum) : 'GH₵0.00', 
      icon: DollarSign, 
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
      live: true
    },
    { 
      label: 'NAV (Net Asset Value)', 
      value: fund?.nav ? formatCurrency(fund.nav) : 'GH₵0.0000', 
      icon: TrendingUp, 
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
      live: true
    },
    { 
      label: 'Total Investors', 
      value: investors.length.toString(), 
      icon: Users, 
      color: 'text-amber-500',
      bg: 'bg-amber-500/10'
    },
    { 
      label: 'Assets Held', 
      value: portfolio.length.toString(), 
      icon: PieChartIcon, 
      color: 'text-purple-500',
      bg: 'bg-purple-500/10'
    },
  ];

  const chartData = portfolio.map(asset => ({
    name: asset.ticker,
    value: asset.marketValue
  })).sort((a, b) => b.value - a.value).slice(0, 6);

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white">Dashboard Overview</h2>
          <p className="text-slate-400 mt-1">Real-time fund performance and metrics</p>
        </div>
        <div className="text-right flex flex-col items-end">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest">Live Market Data</span>
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
            className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-sm"
          >
            <div className="flex items-start justify-between mb-4">
              <div className={`p-3 rounded-xl ${stat.bg}`}>
                <stat.icon className={`w-6 h-6 ${stat.color}`} />
              </div>
              <div className="flex flex-col items-end gap-1">
                {stat.live && (
                  <div className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    <div className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Live</span>
                  </div>
                )}
                <div className="flex items-center gap-1 text-emerald-500 text-xs font-medium">
                  <ArrowUpRight className="w-3 h-3" />
                  <span>+2.4%</span>
                </div>
              </div>
            </div>
            <p className="text-slate-400 text-sm font-medium">{stat.label}</p>
            <h3 className="text-2xl font-bold text-white mt-1">{stat.value}</h3>
          </motion.div>
        ))}
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
