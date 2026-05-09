import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Investor, InvestmentAccount, Transaction } from '../types';

export const generateStatementPDF = async (
  investor: Investor,
  fund: InvestmentAccount,
  transactions: Transaction[],
  startDate: string,
  endDate: string
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
  const closingValue = closingUnits * closingNav;

  // YTD Calculation
  const ytdPct = netInvestment > 0 ? ((closingValue - netInvestment) / netInvestment) * 100 : 0;

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
  drawSummaryLine('Total purchase Amount', totalPurchaseAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 'GHS');
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
