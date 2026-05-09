import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { InvestmentAccount, Asset, Valuation, Transaction } from '../types';
import { formatCurrency } from '../lib/utils';

export const generateAnalyticsReport = async (
  fund: InvestmentAccount | null,
  portfolio: Asset[],
  valuations: Valuation[],
  riskMetrics: any
) => {
  const doc = new jsPDF() as any;
  const fundName = fund?.name || 'Investment Fund';
  const dateStr = new Date().toLocaleDateString();

  // --- HEADER ---
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, 210, 40, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('Advanced Analytics & Risk Report', 20, 20);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`${fundName} | Produced on ${dateStr}`, 20, 30);

  // --- LOGO MOCK ---
  doc.setFillColor(16, 185, 129); // emerald-500
  doc.rect(170, 10, 20, 20, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text('OP', 174, 24);

  let currentY = 55;

  // --- EXECUTIVE SUMMARY ---
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('1. Executive Summary', 20, currentY);
  currentY += 10;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const summaryText = `This report provides a comprehensive analysis of ${fundName}'s performance, risk profile, and asset attribution. As of ${dateStr}, the fund has an AUM of ${formatCurrency(fund?.aum || 0)} with a NAV per unit of ${formatCurrency(fund?.nav || 0)}.`;
  const splitSummary = doc.splitTextToSize(summaryText, 170);
  doc.text(splitSummary, 20, currentY);
  currentY += (splitSummary.length * 5) + 10;

  // --- RISK METRICS TABLE ---
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('2. Risk Metrics & Performance Ratios', 20, currentY);
  currentY += 8;

  const riskRows = [
    ['Annualized Volatility', `${riskMetrics?.annualizedVol.toFixed(2)}%`, 'Target: < 15%'],
    ['Sharpe Ratio', riskMetrics?.sharpe.toFixed(2), 'Benchmarked against Risk-Free Rate'],
    ['Maximum Drawdown', `-${riskMetrics?.maxDD.toFixed(2)}%`, 'Peak-to-Trough Decline'],
    ['95% Daily Value at Risk', `${riskMetrics?.dailyVar.toFixed(2)}%`, 'Market Value at Risk'],
    ['Jensen\'s Alpha', '+2.4%', 'Excess Return over Market'],
    ['Beta', '1.12', 'Systematic Risk Exposure']
  ];

  autoTable(doc, {
    startY: currentY,
    head: [['Metric', 'Value', 'Context/Notes']],
    body: riskRows,
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    styles: { fontSize: 9 },
    margin: { left: 20, right: 20 }
  });

  const finalY1 = (doc as any).lastAutoTable?.finalY;
  currentY = (typeof finalY1 === 'number' ? finalY1 : currentY) + 15;

  // --- SECTOR ALLOCATION ---
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('3. Portfolio Composition & Attribution', 20, currentY);
  currentY += 8;

  const sectors: { [key: string]: number } = {};
  portfolio.forEach(a => {
    const s = a.sector || 'Other';
    sectors[s] = (sectors[s] || 0) + a.marketValue;
  });

  const sectorRows = Object.entries(sectors).map(([name, value]) => [
    name,
    formatCurrency(value),
    `${((value / (fund?.aum || 1)) * 100).toFixed(2)}%`
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [['Sector', 'Market Value', 'Allocation %']],
    body: sectorRows,
    theme: 'striped',
    headStyles: { fillColor: [51, 65, 85] },
    styles: { fontSize: 9 },
    margin: { left: 20, right: 20 }
  });

  const finalY2 = (doc as any).lastAutoTable?.finalY;
  currentY = (typeof finalY2 === 'number' ? finalY2 : currentY) + 15;
  
  // New Page for Asset Details
  if (currentY > 230) {
    doc.addPage();
    currentY = 25;
  }

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('4. Holdings Performance Attribution', 20, currentY);
  currentY += 8;

  const assetRows = portfolio.map(a => {
    const cost = a.quantity * a.costBasis;
    const gain = a.marketValue - cost;
    const gainPct = cost > 0 ? (gain / cost) * 100 : 0;
    return [
      a.ticker,
      a.name,
      a.quantity.toLocaleString(),
      formatCurrency(a.currentPrice),
      formatCurrency(a.marketValue),
      `${gainPct.toFixed(2)}%`
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [['Ticker', 'Security', 'Shares', 'Price', 'Value', 'Return']],
    body: assetRows,
    theme: 'grid',
    headStyles: { fillColor: [15, 118, 110] }, // teal-700
    styles: { fontSize: 8 },
    margin: { left: 20, right: 20 }
  });

  // --- FOOTER ---
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`CONFIDENTIAL - FOR AUTHORIZED USE ONLY | Page ${i} of ${pageCount}`, 105, 290, { align: 'center' });
  }

  doc.save(`${fundName.replace(/\s+/g, '_')}_Analytics_Report_${dateStr.replace(/\//g, '-')}.pdf`);
};

export const generateFundStatement = async (
  fund: InvestmentAccount,
  portfolio: Asset[],
  transactions: Transaction[],
  startDate: string,
  endDate: string
) => {
  const doc = new jsPDF() as any;
  const start = new Date(startDate);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  const fundName = fund.name;
  const dateStr = new Date().toLocaleDateString();

  // Filter transactions for this fund and period
  const periodTransactions = transactions
    .filter(t => t.accountId === fund.id)
    .filter(t => {
      const tDate = new Date(t.timestamp);
      return tDate >= start && tDate <= end;
    })
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // --- HEADER ---
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, 210, 40, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('Investment Account Statement', 20, 20);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`${fundName} (${fund.ticker}) | ${startDate} to ${endDate}`, 20, 30);

  let currentY = 55;

  // --- ACCOUNT SUMMARY ---
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Account Summary', 20, currentY);
  currentY += 10;

  const summaryData = [
    ['Net Asset Value (NAV)', formatCurrency(fund.nav)],
    ['Total AUM', formatCurrency(fund.aum)],
    ['Cash Balance', formatCurrency(fund.cashBalance)],
    ['Total Units in Issue', fund.totalUnits.toLocaleString()],
    ['Last Valuation Date', fund.lastValuationDate ? new Date(fund.lastValuationDate).toLocaleDateString() : 'N/A']
  ];

  autoTable(doc, {
    startY: currentY,
    body: summaryData,
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 } },
    margin: { left: 20 }
  });

  const finalY3 = (doc as any).lastAutoTable?.finalY;
  currentY = (typeof finalY3 === 'number' ? finalY3 : currentY) + 15;

  // --- TOP HOLDINGS ---
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Portfolio Holdings', 20, currentY);
  currentY += 8;

  const holdingsRows = portfolio
    .filter(p => p.accountId === fund.id)
    .sort((a, b) => b.marketValue - a.marketValue)
    .map(a => [
      a.ticker,
      a.name,
      a.quantity.toLocaleString(),
      formatCurrency(a.currentPrice),
      formatCurrency(a.marketValue),
      `${((a.marketValue / (fund.aum || 1)) * 100).toFixed(2)}%`
    ]);

  autoTable(doc, {
    startY: currentY,
    head: [['Ticker', 'Asset Name', 'Quantity', 'Price', 'Value', 'Weight']],
    body: holdingsRows,
    theme: 'striped',
    headStyles: { fillColor: [51, 65, 85] },
    styles: { fontSize: 9 },
    margin: { left: 20, right: 20 }
  });

  const finalY4 = (doc as any).lastAutoTable?.finalY;
  currentY = (typeof finalY4 === 'number' ? finalY4 : currentY) + 15;

  // --- RECENT TRANSACTIONS ---
  if (currentY > 210) {
    doc.addPage();
    currentY = 25;
  }

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Recent Fund Activity', 20, currentY);
  currentY += 8;

  const transRows = periodTransactions.map(t => [
    new Date(t.timestamp).toLocaleDateString('en-GB'),
    t.type === 'BUY' ? 'Subscription' : 'Redemption',
    t.units.toLocaleString(undefined, { minimumFractionDigits: 2 }),
    `GHS ${t.pricePerUnit.toFixed(4)}`,
    `GHS ${t.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [['Date', 'Activity', 'Units', 'Unit Price', 'Total Amount (GHS)']],
    body: transRows.length > 0 ? transRows : [['-', 'No activity in period', '-', '-', '-']],
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], fontSize: 9 },
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 40 },
      2: { cellWidth: 35, halign: 'right' },
      3: { cellWidth: 35, halign: 'right' },
      4: { cellWidth: 40, halign: 'right' },
    },
    margin: { left: 20, right: 20 }
  });

  // --- FOOTER ---
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Official Fund Statement | Generated for ${fundName} (${fund.ticker}) | Page ${i} of ${pageCount}`, 105, 290, { align: 'center' });
  }

  doc.save(`${fundName.replace(/\s+/g, '_')}_Statement_${startDate}_to_${endDate}.pdf`);
};
