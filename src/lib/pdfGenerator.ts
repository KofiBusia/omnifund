import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Investor, InvestmentAccount, Transaction, Asset } from '../types';

export const generateStatementPDF = async (
  investor: Investor,
  fund: InvestmentAccount,
  transactions: Transaction[],
  startDate: string,
  endDate: string,
  overrides?: {
    totalPurchaseAmount?: number;
    closingValue?: number;
    ytdPct?: number;
  }
) => {
  const doc = new jsPDF() as any;
  const start = new Date(startDate);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  // Filter data for the period
  const periodTransactions = transactions
    .filter(t => t.investorId === investor.id)
    .filter(t => {
      const tDate = new Date(t.timestamp);
      return tDate >= start && tDate <= end;
    })
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Calculate Totals
  const allInvestorTransactions = transactions.filter(t => t.investorId === investor.id);
  const totalPurchaseAmount = allInvestorTransactions
    .filter(t => t.type === 'BUY')
    .reduce((acc, t) => acc + t.totalAmount, 0);
  
  const totalRedemptionAmount = allInvestorTransactions
    .filter(t => t.type === 'SELL')
    .reduce((acc, t) => acc + t.totalAmount, 0);

  const netInvestment = totalPurchaseAmount - totalRedemptionAmount;

  // Calculate Closing Balance
  const closingUnits = investor.unitsOwned || 0;
  const closingNav = fund.nav || 0;
  const closingValue = overrides?.closingValue !== undefined ? overrides.closingValue : (closingUnits * closingNav);

  const finalTotalPurchaseAmount = overrides?.totalPurchaseAmount !== undefined ? overrides.totalPurchaseAmount : totalPurchaseAmount;

  // YTD Calculation
  const ytdPct = overrides?.ytdPct !== undefined ? overrides.ytdPct : (netInvestment > 0 ? ((closingValue - netInvestment) / netInvestment) * 100 : 0);

  // --- PDF HEADER ---
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(fund.name.toUpperCase(), 20, 25);
  
  doc.setFontSize(12);
  doc.text('Statement', 20, 33);

  // Logo Placeholder (Simplified to match visual of screenshot)
  doc.setFillColor(224, 170, 20); // Orange/Brown color from UMB logo
  doc.rect(125, 15, 20, 15, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('umb', 127, 26);

  doc.setFillColor(30,30,30);
  doc.rect(145, 15, 45, 15, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('stockbrokers', 148, 25);

  // --- INVESTOR INFO ---
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  
  const infoX = 20;
  const infoValueX = 70;
  let currentY = 50;

  doc.text('Name', infoX, currentY);
  doc.text(investor.name, infoValueX, currentY);
  currentY += 6;

  doc.text('Account Number', infoX, currentY);
  doc.text(investor.investorId || 'N/A', infoValueX, currentY);
  currentY += 6;

  const formatDateLabel = (date: Date) => {
    const day = date.getDate();
    const month = date.toLocaleString('default', { month: 'long' });
    const year = date.getFullYear();
    const suffix = (d: number) => {
      if (d > 3 && d < 21) return 'th';
      switch (d % 10) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
      }
    };
    return `${day}${suffix(day)} ${month} ${year}`;
  };

  doc.text('Period', infoX, currentY);
  doc.text(`${formatDateLabel(start)} to ${formatDateLabel(end)}`, infoValueX, currentY);

  // --- TRANSACTIONS TABLE ---
  const transRows = periodTransactions.map(t => [
    new Date(t.timestamp).toLocaleDateString('en-GB'),
    t.type === 'BUY' ? 'Buy' : 'Sell',
    t.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    t.pricePerUnit.toFixed(4),
    t.units.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  ]);

  autoTable(doc, {
    startY: 75,
    head: [['Valuation Date', 'Transaction', 'AMOUNT (GHS)', 'Price', 'UNITS']],
    body: transRows.length > 0 ? transRows : [['-', 'No transactions', '-', '-', '-']],
    theme: 'plain',
    headStyles: { 
      textColor: [0, 0, 0], 
      fontStyle: 'bold',
      cellPadding: { top: 2, bottom: 2, left: 1, right: 1 },
      lineWidth: { bottom: 0.2 },
      lineColor: [0, 0, 0],
      fontSize: 10
    },
    bodyStyles: { 
      textColor: [0, 0, 0],
      cellPadding: { top: 2, bottom: 2, left: 1, right: 1 },
      fontSize: 10
    },
    columnStyles: {
      0: { cellWidth: 35, halign: 'left' },
      1: { cellWidth: 30, halign: 'left' },
      2: { cellWidth: 35, halign: 'right' },
      3: { cellWidth: 30, halign: 'right' },
      4: { cellWidth: 35, halign: 'right' },
    },
    margin: { left: 15, right: 15 }
  });

  // --- SUMMARY SECTION ---
  const finalY = (doc as any).lastAutoTable?.finalY;
  let sY = (typeof finalY === 'number' ? finalY : 85) + 20;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  
  const summaryLabelX = 20;
  const summaryValueX = 160; // Increased to give more room

  const drawSummaryLine = (label: string, value: string, currency: string = '') => {
    doc.text(label, summaryLabelX, sY);
    const displayValue = currency ? `${currency} ${value}` : value;
    doc.text(displayValue, summaryValueX, sY, { align: 'right' });
    sY += 6;
  };

  drawSummaryLine('Total Number Of Units', closingUnits.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  drawSummaryLine('Total purchase Amount', finalTotalPurchaseAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 'GHS');
  drawSummaryLine('Unit Price', closingNav.toFixed(4), 'GHS');
  drawSummaryLine('Current Value', closingValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 'GHS');
  drawSummaryLine('Year To Date(%)', (ytdPct || 0).toFixed(2));


  // Disclaimer and Signature
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'italic');
  doc.text('This is a computer-generated statement and requires no signature.', 20, sY + 10);
  doc.text('For any discrepancies, please contact our support desk within 7 days.', 20, sY + 14);

  return doc;
};

export interface PortfolioStatementOptions {
  showSector?: boolean;
  showCostBasis?: boolean;
  showMarketValue?: boolean;
  showWeight?: boolean;
  showGainLoss?: boolean;
  showSummary?: boolean;
  showCashBalance?: boolean;
  showDisclaimer?: boolean;
}

export const generatePortfolioStatementPDF = async (
  fund: InvestmentAccount | null,
  portfolio: Asset[],
  options: PortfolioStatementOptions = {}
) => {
  const doc = new jsPDF() as any;
  const targetFund = fund || null;
  const fundName = targetFund ? targetFund.name : 'ALL MUTUAL FUNDS';

  // Default options
  const opts = {
    showSector: options.showSector ?? true,
    showCostBasis: options.showCostBasis ?? true,
    showMarketValue: options.showMarketValue ?? true,
    showWeight: options.showWeight ?? true,
    showGainLoss: options.showGainLoss ?? true,
    showSummary: options.showSummary ?? true,
    showCashBalance: options.showCashBalance ?? true,
    showDisclaimer: options.showDisclaimer ?? true,
  };
  
  // Calculate Totals
  const totalMarketValue = portfolio.reduce((sum, asset) => sum + asset.marketValue, 0);
  const totalCostBasis = portfolio.reduce((sum, asset) => sum + (asset.quantity * asset.costBasis), 0);
  const totalGainLoss = totalMarketValue - totalCostBasis;
  const totalGainLossPct = totalCostBasis > 0 ? (totalGainLoss / totalCostBasis * 100) : 0;
  
  // --- PDF HEADER ---
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(fundName.toUpperCase(), 20, 25);
  
  doc.setFontSize(12);
  doc.text('Portfolio Valuation Statement', 20, 33);

  // Logo Placeholder (matches UMB style)
  doc.setFillColor(224, 170, 20); // Orange/Brown color from UMB logo
  doc.rect(125, 15, 20, 15, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('umb', 127, 26);

  doc.setFillColor(30, 30, 30);
  doc.rect(145, 15, 45, 15, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('stockbrokers', 148, 25);

  // --- STATEMENT METADATA ---
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  
  const infoX = 20;
  const infoValueX = 70;
  let currentY = 50;

  doc.text('Statement Date', infoX, currentY);
  doc.text(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), infoValueX, currentY);
  currentY += 6;

  doc.text('Target Account', infoX, currentY);
  doc.text(targetFund ? `${targetFund.name} (${targetFund.ticker})` : 'Consolidated Portfolio (All Accounts)', infoValueX, currentY);
  currentY += 6;

  doc.text('Unique Holdings', infoX, currentY);
  doc.text(portfolio.length.toString(), infoValueX, currentY);

  // --- PORTFOLIO DETAILS TABLE ---
  const headers = ['Ticker', 'Security'];
  if (opts.showSector) headers.push('Sector');
  headers.push('Quantity');
  if (opts.showCostBasis) headers.push('Avg Cost');
  headers.push('Price');
  if (opts.showMarketValue) headers.push('Market Val');
  if (opts.showWeight) headers.push('Weight');
  if (opts.showGainLoss) headers.push('Gain/Loss (%)');

  const rows = portfolio.map(asset => {
    const weight = totalMarketValue > 0 ? (asset.marketValue / totalMarketValue * 100) : 0;
    const gainLoss = asset.marketValue - (asset.quantity * asset.costBasis);
    const gainLossPct = (asset.quantity * asset.costBasis) > 0 ? (gainLoss / (asset.quantity * asset.costBasis) * 100) : 0;
    
    const row = [
      asset.ticker,
      asset.name
    ];
    if (opts.showSector) row.push(asset.sector || 'N/A');
    row.push(asset.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 }));
    if (opts.showCostBasis) row.push(asset.costBasis.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 }));
    row.push(asset.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 }));
    if (opts.showMarketValue) row.push(asset.marketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    if (opts.showWeight) row.push(`${weight.toFixed(2)}%`);
    if (opts.showGainLoss) row.push(`${gainLoss >= 0 ? '+' : ''}${gainLoss.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${gainLossPct.toFixed(2)}%)`);
    
    return row;
  });

  const columnStyles: any = {};
  let colIndex = 0;
  
  columnStyles[colIndex++] = { cellWidth: 15, halign: 'left' }; // Ticker
  columnStyles[colIndex++] = { cellWidth: 32, halign: 'left' }; // Security
  if (opts.showSector) {
    columnStyles[colIndex++] = { cellWidth: 20, halign: 'left' }; // Sector
  }
  columnStyles[colIndex++] = { cellWidth: 18, halign: 'right' }; // Quantity
  if (opts.showCostBasis) {
    columnStyles[colIndex++] = { cellWidth: 18, halign: 'right' }; // Avg Cost
  }
  columnStyles[colIndex++] = { cellWidth: 18, halign: 'right' }; // Price
  if (opts.showMarketValue) {
    columnStyles[colIndex++] = { cellWidth: 20, halign: 'right' }; // Market Val
  }
  if (opts.showWeight) {
    columnStyles[colIndex++] = { cellWidth: 15, halign: 'right' }; // Weight
  }
  if (opts.showGainLoss) {
    columnStyles[colIndex++] = { cellWidth: 24, halign: 'right' }; // Gain/Loss
  }

  autoTable(doc, {
    startY: 75,
    head: [headers],
    body: rows.length > 0 ? rows : [['-', 'No assets held', '-', '-', '-', '-', '-', '-', '-']],
    theme: 'plain',
    headStyles: { 
      textColor: [0, 0, 0], 
      fontStyle: 'bold',
      cellPadding: { top: 2, bottom: 2, left: 1, right: 1 },
      lineWidth: { bottom: 0.2 },
      lineColor: [0, 0, 0],
      fontSize: 8
    },
    bodyStyles: { 
      textColor: [0, 0, 0],
      cellPadding: { top: 2, bottom: 2, left: 1, right: 1 },
      fontSize: 8
    },
    columnStyles,
    margin: { left: 15, right: 15 }
  });

  // --- SUMMARY SECTION ---
  const finalY = (doc as any).lastAutoTable?.finalY;
  let sY = (typeof finalY === 'number' ? finalY : 85) + 15;
  
  if (opts.showSummary) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    
    const summaryLabelX = 20;
    const summaryValueX = 160;

    const drawSummaryLine = (label: string, value: string, currency: string = '') => {
      doc.text(label, summaryLabelX, sY);
      const displayValue = currency ? `${currency} ${value}` : value;
      doc.text(displayValue, summaryValueX, sY, { align: 'right' });
      sY += 6;
    };

    doc.setFont('helvetica', 'bold');
    doc.text('Portfolio Summary', summaryLabelX, sY);
    sY += 8;
    doc.setFont('helvetica', 'normal');

    if (opts.showCostBasis) {
      drawSummaryLine('Total Cost Basis', totalCostBasis.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 'GHS');
    }
    if (opts.showMarketValue) {
      drawSummaryLine('Total Market Value (Assets)', totalMarketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 'GHS');
    }
    
    if (targetFund && opts.showCashBalance) {
      drawSummaryLine('Cash Balance', targetFund.cashBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 'GHS');
      const netAssets = totalMarketValue + targetFund.cashBalance;
      drawSummaryLine('Total Portfolio Net Assets (AUM)', netAssets.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 'GHS');
      drawSummaryLine('Net Asset Value (NAV per Unit)', targetFund.nav.toFixed(4), 'GHS');
    }

    if (opts.showGainLoss) {
      drawSummaryLine('Overall Unrealized Gain/Loss', `${totalGainLoss >= 0 ? '+' : ''}${totalGainLoss.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${totalGainLossPct.toFixed(2)}%)`, 'GHS');
    }
  }

  // Disclaimer and Signature
  if (opts.showDisclaimer) {
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'italic');
    doc.text('This is an official automated portfolio statement generated by OmniFund.', 20, sY + 10);
    doc.text('Asset prices are refreshed from active market feeds. Unit prices and cash values are reconciled to general ledger.', 20, sY + 14);
  }

  return doc;
};
