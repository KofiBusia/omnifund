import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileUp, 
  Cpu, 
  Database, 
  ShieldCheck, 
  ArrowRight, 
  Loader2, 
  CheckCircle2, 
  AlertTriangle,
  FileText,
  Workflow,
  Search,
  RefreshCcw,
  Layers,
  Sparkles
} from 'lucide-react';
import { db } from '../firebase';
import { collection, writeBatch, doc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { IngestionEngine, IngestionResult } from '../services/ingestionService';
import { STPService } from '../services/stpService';
import { InvestmentAccount, Investor, Asset } from '../types';
import { formatCurrency, cn } from '../lib/utils';

interface IngestionEngineUIProps {
  accounts: InvestmentAccount[];
  investors: Investor[];
  onComplete: () => void;
}

export default function IngestionEngineUI({ accounts, investors, onComplete }: IngestionEngineUIProps) {
  const [step, setStep] = useState<'idle' | 'analyzing' | 'review' | 'success'>('idle');
  const [result, setResult] = useState<IngestionResult | null>(null);
  const [userInstructions, setUserInstructions] = useState('');
  const [stpLogs, setStpLogs] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setStep('analyzing');
    setIsProcessing(true);
    setError(null);

    try {
      const filePromises = Array.from(files).map((file: File) => {
        return new Promise<{ data: string; mimeType: string }>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const base64Data = (reader.result as string).split(',')[1];
            resolve({ data: base64Data, mimeType: file.type });
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      });

      const processedFiles = await Promise.all(filePromises);
      const engine = new IngestionEngine();
      
      const data = await engine.processCustodianExports(
        processedFiles, 
        { accounts, investors },
        userInstructions
      );
      
      setResult(data);
      setStep('review');
    } catch (err) {
      console.error(err);
      setError("Resolution Pipeline Failed. Check file integrity.");
      setStep('idle');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCommit = async () => {
    if (!result) return;
    setIsProcessing(true);
    setError(null);
    setStpLogs([]);
    
    try {
      const stp = new STPService();
      const stpResult = await stp.provision(result, { accounts, investors });
      
      setStpLogs(stpResult.logs);
      
      if (stpResult.success > 0) {
        setStep('success');
        setTimeout(() => {
          onComplete();
          setStep('idle');
        }, 3000);
      } else {
        setError("STP Provisioning Failed: Zero successful commitments.");
      }
    } catch (err: any) {
      console.error(err);
      setError(`Transactional Commitment Failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
      <div className="p-8 border-b border-slate-800 bg-slate-950/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-500/20 rounded-2xl flex items-center justify-center text-blue-500">
              <Cpu className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Automated Custodian Ingestion Engine</h2>
              <p className="text-slate-500 text-sm">Schema-Agnostic Intelligent Mapping Pipeline</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-800 rounded-full border border-slate-700">
            <Layers className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-mono text-slate-300">V2.4 STABLE</span>
          </div>
        </div>
      </div>

      <div className="p-10">
        <AnimatePresence mode="wait">
          {step === 'idle' && (
            <motion.div 
              key="idle"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="group"
            >
              <label className="block border-2 border-dashed border-slate-800 hover:border-blue-500/50 rounded-3xl p-16 text-center cursor-pointer transition-all bg-slate-950/20 hover:bg-blue-500/5">
                <input 
                  type="file" 
                  className="hidden" 
                  onChange={handleFileUpload} 
                  ref={fileInputRef}
                  accept=".csv,.xlsx,.xls,.pdf,.json,.xml"
                  multiple
                />
                <div className="max-w-md mx-auto">
                  <div className="w-20 h-20 bg-slate-800 rounded-3xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 group-hover:bg-blue-500/10 transition-all shadow-xl">
                    <FileUp className="w-10 h-10 text-slate-400 group-hover:text-blue-500" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">Ingest Custodian Export</h3>
                  <p className="text-slate-500 mb-8 leading-relaxed">
                    Drop multiple custodian datasets (XLSX, XML, PDF) to autonomously initialize or reconcile accounts in a single batch.
                  </p>
                  <div className="grid grid-cols-2 gap-4 mb-8">
                    <div className="flex items-center gap-3 p-4 bg-slate-800/50 rounded-2xl border border-slate-700">
                      <Search className="w-5 h-5 text-emerald-500" />
                      <span className="text-xs font-bold text-slate-400">Intelligent Mapping</span>
                    </div>
                    <div className="flex items-center gap-3 p-4 bg-slate-800/50 rounded-2xl border border-slate-700">
                      <ShieldCheck className="w-5 h-5 text-blue-500" />
                      <span className="text-xs font-bold text-slate-400">Ledger Validation</span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-slate-400 px-1">
                      <Workflow className="w-4 h-4" />
                      <span className="text-xs font-bold uppercase tracking-widest">Intelligence Directives (Optional)</span>
                    </div>
                    <textarea 
                      value={userInstructions}
                      onChange={(e) => setUserInstructions(e.target.value)}
                      placeholder="e.g. 'Ignore rows with zero quantity', 'Treat names in column B as primary IDs', 'This file uses MTNGH as shorthand for MTN Ghana'..."
                      className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl p-4 text-sm text-slate-300 focus:outline-none focus:border-blue-500/50 transition-all placeholder:text-slate-700 min-h-[100px] resize-none"
                    />
                  </div>
                </div>
              </label>
            </motion.div>
          )}

          {step === 'analyzing' && (
            <motion.div 
              key="analyzing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-20 text-center space-y-10"
            >
              <div className="relative inline-block">
                <div className="w-32 h-32 border-4 border-blue-500/10 border-t-blue-500 rounded-full animate-spin mx-auto" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Cpu className="w-10 h-10 text-blue-500 animate-pulse" />
                </div>
              </div>
              <div className="max-w-sm mx-auto space-y-4">
                <h3 className="text-3xl font-black text-white">Resolving Spectrums</h3>
                <p className="text-slate-400 font-mono text-sm animate-pulse">
                  ARCHITECTING UNIFIED LEDGER...
                </p>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-4">
                  <motion.div 
                    initial={{ x: '-100%' }}
                    animate={{ x: '100%' }}
                    transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                    className="w-1/2 h-full bg-blue-500"
                  />
                </div>
              </div>
            </motion.div>
          )}

          {step === 'review' && result && (
            <motion.div 
              key="review"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-8"
            >
              <div className="grid grid-cols-3 gap-6">
                <div className="p-6 bg-slate-800/30 rounded-3xl border border-slate-800 hover:border-blue-500/30 transition-all">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-widest text-blue-500">Entities Found</span>
                    <Layers className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center bg-slate-900/50 p-3 rounded-xl border border-slate-800">
                      <span className="text-sm text-slate-400">Investors</span>
                      <span className="text-lg font-bold text-white">{result.entities.investors.length}</span>
                    </div>
                    <div className="flex justify-between items-center bg-slate-900/50 p-3 rounded-xl border border-slate-800">
                      <span className="text-sm text-slate-400">Funds</span>
                      <span className="text-lg font-bold text-white">{result.entities.funds.length}</span>
                    </div>
                  </div>
                </div>

                <div className="col-span-2 p-6 bg-slate-800/30 rounded-3xl border border-slate-800">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-widest text-emerald-500">Mapping Integrity</span>
                    <Workflow className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-900/50 rounded-2xl border border-slate-800">
                      <p className="text-[10px] text-slate-500 mb-1">Entitlement Mapping</p>
                      <p className="text-sm font-bold text-white mb-2">{result.mappings.investorToFund.length} Relationships</p>
                      <div className="h-1 bg-emerald-500/20 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: '100%' }} />
                      </div>
                    </div>
                    <div className="p-4 bg-slate-900/50 rounded-2xl border border-slate-800">
                      <p className="text-[10px] text-slate-500 mb-1">Portfolio Resolution</p>
                      <p className="text-sm font-bold text-white mb-2">{result.mappings.fundToAsset.length} Positions</p>
                      <div className="h-1 bg-blue-500/20 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500" style={{ width: '100%' }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {result.validationErrors.length > 0 && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex gap-3 items-start">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                  <div>
                    <h4 className="text-sm font-bold text-amber-500">Ambiguous Data Clusters Found</h4>
                    <ul className="text-xs text-slate-400 mt-1 list-disc ml-4">
                      {result.validationErrors.map((err, i) => <li key={i}>{err}</li>)}
                    </ul>
                  </div>
                </div>
              )}

              {/* Resolution Chat Refinement */}
              <div className="bg-slate-950/50 border border-slate-800 rounded-3xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="w-4 h-4 text-blue-500" />
                  <span className="text-xs font-bold text-white uppercase tracking-widest">Refine Extracted Data</span>
                </div>
                <div className="flex gap-4">
                  <input 
                    type="text" 
                    placeholder="e.g. 'Map all unknown investors to the Pensioners group', 'Update NAV for MTN to 1.25'..."
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') {
                        const target = e.currentTarget;
                        const directive = target.value;
                        if (!directive) return;
                        setIsProcessing(true);
                        try {
                          const engine = new IngestionEngine();
                          const refined = await engine.processCustodianExports(
                            [], // No new files, just re-running with existing context and new directive
                            { accounts, investors },
                            `REFINEMENT DIRECTIVE: ${directive}\n\nCURRENT EXTRACTED DATA: ${JSON.stringify(result)}`
                          );
                          setResult(refined);
                          target.value = '';
                        } catch (err) {
                          console.error(err);
                        } finally {
                          setIsProcessing(false);
                        }
                      }
                    }}
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-all placeholder:text-slate-700 font-mono"
                  />
                  <div className="flex items-center justify-center p-3 text-slate-500 italic text-[10px]">
                    Press Enter to re-calculate mappings
                  </div>
                </div>
              </div>

              {stpLogs.length > 0 && (
                <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-2xl max-h-40 overflow-y-auto">
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                    <Database className="w-3 h-3" />
                    STP Provisioning Logs
                  </h4>
                  <div className="space-y-1">
                    {stpLogs.map((log, i) => (
                      <div key={i} className="text-[10px] font-mono text-slate-400 border-l border-slate-800 pl-2">
                        {log}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-4">
                <button 
                  onClick={() => setStep('idle')}
                  className="px-8 py-4 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-2xl transition-all flex items-center gap-2"
                >
                  <RefreshCcw className="w-5 h-5" />
                  Reset
                </button>
                <button 
                  onClick={handleCommit}
                  disabled={isProcessing}
                  className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-2xl transition-all shadow-xl shadow-blue-600/20 flex items-center justify-center gap-3 group"
                >
                  {isProcessing ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                    <>
                      Execute Ledger Commitment
                      <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {step === 'success' && (
            <motion.div 
              key="success"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="py-20 text-center space-y-6"
            >
              <div className="w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-emerald-500/30">
                <CheckCircle2 className="w-12 h-12 text-emerald-500" />
              </div>
              <h2 className="text-4xl font-black text-white">Commitment Successful</h2>
              <p className="text-slate-400 text-lg max-w-sm mx-auto leading-relaxed">
                Ledger synchronized across all fragmented entities and portfolios.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {error && (
        <div className="p-4 bg-red-500 text-white text-xs font-bold flex items-center justify-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}
    </div>
  );
}
