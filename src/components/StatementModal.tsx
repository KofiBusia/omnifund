import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Calendar, Download, Loader2, FileText, CheckCircle2, Mail, Send, AlertCircle } from 'lucide-react';
import { Investor, InvestmentAccount, Transaction, Valuation } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface StatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  investor: Investor | null;
  fund: InvestmentAccount | null;
  accounts: InvestmentAccount[];
  transactions: Transaction[];
  valuations: Valuation[];
  isGmailConnected: boolean;
}

export default function StatementModal({ 
  isOpen, 
  onClose, 
  investor, 
  fund, 
  accounts, 
  transactions, 
  valuations,
  isGmailConnected
}: StatementModalProps) {
  const [startDate, setStartDate] = useState(
    new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEmailing, setIsEmailing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [emailStatus, setEmailStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const generatePDFData = async () => {
    if (!investor || !fund) return null;

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
    const closingUnits = investor.unitsOwned;
    const closingNav = fund.nav;
    const closingValue = closingUnits * closingNav;

    // YTD Calculation (Simple version: (Current Value - Net Investment) / Net Investment)
    const ytdPct = netInvestment > 0 ? ((closingValue - netInvestment) / netInvestment) * 100 : 0;

    // --- PDF HEADER ---
    // Fund Name
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(fund.name.toUpperCase(), 20, 25);
    
    // "Statement" text
    doc.setFontSize(12);
    doc.text('Statement', 20, 35);

    // Mock Logo (UMB style)
    // Yellow box
    doc.setFillColor(224, 170, 20); // Gold/Yellow
    doc.rect(130, 15, 25, 15, 'F');
    // "umb" text in white
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('umb', 132, 26);

    // Black box
    doc.setFillColor(30, 30, 30); // Black
    doc.rect(155, 15, 35, 15, 'F');
    // "stockbrokers" text in white
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('stockbrokers', 157, 25);

    // --- INVESTOR INFO ---
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    
    const infoX = 20;
    const infoValueX = 60;
    let currentY = 55;

    doc.text('Name', infoX, currentY);
    doc.text(investor.name, infoValueX, currentY);
    currentY += 7;

    doc.text('Account Number', infoX, currentY);
    doc.text(investor.investorId || 'N/A', infoValueX, currentY);
    currentY += 7;

    const formatDate = (date: Date) => {
      const day = date.getDate();
      const month = date.toLocaleString('default', { month: 'long' });
      const suffix = (d: number) => {
        if (d > 3 && d < 21) return 'th';
        switch (d % 10) {
          case 1: return "st";
          case 2: return "nd";
          case 3: return "rd";
          default: return "th";
        }
      };
      return `${day}${suffix(day)} ${month}`;
    };

    doc.text('Period', infoX, currentY);
    doc.text(`${formatDate(start)} to ${formatDate(end)}`, infoValueX, currentY);

    // --- TRANSACTIONS TABLE ---
    const transRows = periodTransactions.map(t => [
      new Date(t.timestamp).toLocaleDateString('en-GB'),
      t.type === 'BUY' ? 'Buy' : 'Sell',
      `GHS ${t.totalAmount.toFixed(2)}`,
      t.pricePerUnit.toFixed(2),
      `GHS ${(t.units * t.pricePerUnit).toFixed(2)}`
    ]);

    autoTable(doc, {
      startY: 85,
      head: [['Valuation Date', 'Transaction', 'Amount', 'Unit Price', 'Value']],
      body: transRows.length > 0 ? transRows : [['-', 'No transactions', '-', '-', '-']],
      theme: 'plain',
      headStyles: { 
        textColor: [0, 0, 0], 
        fontStyle: 'bold',
        cellPadding: 2,
        lineWidth: { bottom: 0.5 },
        lineColor: [0, 0, 0]
      },
      bodyStyles: { 
        textColor: [0, 0, 0],
        cellPadding: 2
      },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 30 },
        2: { cellWidth: 40 },
        3: { cellWidth: 30 },
        4: { cellWidth: 40 },
      },
      margin: { left: 20, right: 20 }
    });

    // --- SUMMARY SECTION ---
    const summaryY = (doc as any).lastAutoTable.finalY + 20;
    doc.setFontSize(10);
    
    const summaryLabelX = 20;
    const summaryValueX = 120;
    let sY = summaryY;

    const drawSummaryLine = (label: string, value: string, isCurrency: boolean = false) => {
      doc.text(label, summaryLabelX, sY);
      const displayValue = isCurrency ? `GHS ${value}` : value;
      doc.text(displayValue, summaryValueX, sY, { align: 'right' });
      sY += 8;
    };

    drawSummaryLine('Total Number Of Units', closingUnits.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    drawSummaryLine('Total purchase Amount', totalPurchaseAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), true);
    drawSummaryLine('Unit Price', closingNav.toFixed(4), true);
    drawSummaryLine('Current Value', closingValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), true);
    drawSummaryLine('Year To Date(%)', ytdPct.toFixed(2));

    return doc;
  };

  const handleDownload = async () => {
    if (!investor) return;
    setIsGenerating(true);
    try {
      const doc = await generatePDFData();
      if (doc) {
        doc.save(`${investor.name.replace(/\s+/g, '_')}_Statement_${startDate}_to_${endDate}.pdf`);
        setIsSuccess(true);
        setTimeout(() => {
          setIsSuccess(false);
          onClose();
        }, 2000);
      }
    } catch (error) {
      console.error('Download error:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendEmail = async () => {
    if (!investor) return;
    setEmailStatus('sending');
    try {
      const doc = await generatePDFData();
      if (doc) {
        const pdfBase64 = doc.output('datauristring').split(',')[1];
        
        const response = await fetch('/api/send-statement', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            investorEmail: investor.email,
            investorName: investor.name,
            pdfBase64,
            startDate,
            endDate,
            fundName: fund?.name
          })
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to send email');
        }
        
        setEmailStatus('success');
        setTimeout(() => {
          setEmailStatus('idle');
          onClose();
        }, 2000);
      }
    } catch (error) {
      console.error('Email error:', error);
      setEmailStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to send email');
      setTimeout(() => {
        setEmailStatus('idle');
        setErrorMessage(null);
      }, 5000);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
                  <FileText className="w-6 h-6 text-blue-500" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Generate Statement</h3>
                  <p className="text-slate-400 text-xs">{investor?.name || 'Select Investor'}</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Start Date</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input 
                      type="date" 
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">End Date</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input 
                      type="date" 
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-slate-800/50 border border-slate-800 p-4 rounded-2xl">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-white">
                    {investor?.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{investor?.name}</p>
                    <p className="text-[10px] text-slate-500">{investor?.investorId}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-slate-500">Current Units</span>
                    <span className="text-slate-300">{investor?.unitsOwned.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-slate-500">Current NAV</span>
                    <span className="text-slate-300">{formatCurrency(fund?.nav || 1.0000)}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={handleDownload}
                  disabled={isGenerating || isSuccess || emailStatus === 'sending'}
                  className={cn(
                    "w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg",
                    isSuccess 
                      ? "bg-emerald-500 text-white" 
                      : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20"
                  )}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Generating...
                    </>
                  ) : isSuccess ? (
                    <>
                      <CheckCircle2 className="w-5 h-5" />
                      Downloaded
                    </>
                  ) : (
                    <>
                      <Download className="w-5 h-5" />
                      Download
                    </>
                  )}
                </button>

                <button 
                  onClick={handleSendEmail}
                  disabled={emailStatus === 'sending' || isGenerating || isSuccess || !isGmailConnected}
                  className={cn(
                    "w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg",
                    emailStatus === 'success' ? "bg-emerald-500 text-white" :
                    emailStatus === 'error' ? "bg-red-500 text-white" :
                    !isGmailConnected ? "bg-slate-800/50 text-slate-600 cursor-not-allowed border border-slate-800" :
                    "bg-slate-800 hover:bg-slate-700 text-white border border-slate-700"
                  )}
                  title={!isGmailConnected ? "Connect Gmail first" : ""}
                >
                  {emailStatus === 'sending' ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Sending...
                    </>
                  ) : emailStatus === 'success' ? (
                    <>
                      <CheckCircle2 className="w-5 h-5" />
                      Sent!
                    </>
                  ) : emailStatus === 'error' ? (
                    <>
                      <AlertCircle className="w-5 h-5" />
                      Error
                    </>
                  ) : !isGmailConnected ? (
                    <>
                      <Mail className="w-5 h-5" />
                      Connect Gmail
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      Email
                    </>
                  )}
                </button>
              </div>

              {errorMessage && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3"
                >
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-[10px] text-red-400 leading-relaxed">{errorMessage}</p>
                </motion.div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
