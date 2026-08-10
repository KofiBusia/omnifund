import React, { useState, useEffect } from 'react';
import { 
  Headphones, 
  MessageSquare, 
  PlusCircle, 
  Search, 
  Filter, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  UserCheck, 
  Send, 
  Lock, 
  Sparkles, 
  User, 
  ShieldCheck, 
  FileText, 
  ChevronRight, 
  CornerDownRight, 
  RefreshCw,
  Tag,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, getDocs, doc, setDoc, updateDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { SupportTicket, SupportMessage, UserRoleType, InvestmentAccount } from '../types';
import { toast } from 'sonner';

interface SupportCenterProps {
  currentUser: any;
  role: string | null;
  accounts: InvestmentAccount[];
  isDemoMode: boolean;
}

const SAMPLE_TICKETS: SupportTicket[] = [
  {
    id: 'tck-1001',
    ticketNumber: 'TCK-1001',
    subject: 'Q1 Investor Statement Re-issuance Request',
    category: 'Statement Inquiry',
    priority: 'medium',
    status: 'in_progress',
    investorUid: 'inv-demo-1',
    investorName: 'Alexander Wright',
    investorEmail: 'alexander.wright@apexholdings.com',
    accountId: 'acc-1',
    assignedToUid: 'staff-demo-2',
    assignedToName: 'Marcus Vance',
    createdAt: '2026-03-28T10:15:00Z',
    updatedAt: '2026-03-28T14:30:00Z',
    messages: [
      {
        id: 'msg-1',
        senderUid: 'inv-demo-1',
        senderName: 'Alexander Wright',
        senderRole: 'investor',
        message: 'Hello Support Team, I am requesting an updated PDF statement for Q1 showing the latest NAV valuation adjustment.',
        timestamp: '2026-03-28T10:15:00Z'
      },
      {
        id: 'msg-2',
        senderUid: 'staff-demo-2',
        senderName: 'Marcus Vance (Ops)',
        senderRole: 'staff',
        message: 'Internal Note: Verified investor holdings. Re-calculated NAV statement ready for dispatch.',
        timestamp: '2026-03-28T14:20:00Z',
        isInternalNote: true
      },
      {
        id: 'msg-3',
        senderUid: 'staff-demo-2',
        senderName: 'Marcus Vance (Ops)',
        senderRole: 'staff',
        message: 'Dear Alexander, your Q1 statement has been generated with the latest valuation updates. You can view or download it under your Statements tab.',
        timestamp: '2026-03-28T14:30:00Z'
      }
    ]
  },
  {
    id: 'tck-1002',
    ticketNumber: 'TCK-1002',
    subject: 'Additional Unit Subscription Deposit Confirmation',
    category: 'Investment Request',
    priority: 'high',
    status: 'open',
    investorUid: 'inv-demo-2',
    investorName: 'Sophia Lin',
    investorEmail: 'sophia.lin@vanguardcap.org',
    accountId: 'acc-1',
    createdAt: '2026-03-29T08:45:00Z',
    updatedAt: '2026-03-29T08:45:00Z',
    messages: [
      {
        id: 'msg-10',
        senderUid: 'inv-demo-2',
        senderName: 'Sophia Lin',
        senderRole: 'investor',
        message: 'We have initiated a $250,000 wire deposit for additional units in OmniFund Growth. Please confirm receipt and unit allocation.',
        timestamp: '2026-03-29T08:45:00Z'
      }
    ]
  },
  {
    id: 'tck-1003',
    ticketNumber: 'TCK-1003',
    subject: 'KYC Document Verification Update',
    category: 'KYC & Account',
    priority: 'low',
    status: 'resolved',
    investorUid: 'inv-demo-3',
    investorName: 'David K. Osei',
    investorEmail: 'david.osei@emeraldholdings.com',
    assignedToUid: 'staff-demo-3',
    assignedToName: 'Elena Rodriguez',
    createdAt: '2026-03-20T11:00:00Z',
    updatedAt: '2026-03-22T09:10:00Z',
    messages: [
      {
        id: 'msg-20',
        senderUid: 'inv-demo-3',
        senderName: 'David K. Osei',
        senderRole: 'investor',
        message: 'Uploaded updated proof of address for annual compliance audit.',
        timestamp: '2026-03-20T11:00:00Z'
      },
      {
        id: 'msg-21',
        senderUid: 'staff-demo-3',
        senderName: 'Elena Rodriguez (Support)',
        senderRole: 'support',
        message: 'Thank you David. Your KYC documents have been reviewed and verified successfully!',
        timestamp: '2026-03-22T09:10:00Z'
      }
    ]
  }
];

export default function SupportCenter({ currentUser, role, accounts, isDemoMode }: SupportCenterProps) {
  const isStaffMember = role === 'admin' || role === 'superadmin' || role === 'staff' || role === 'support';
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isNewTicketModalOpen, setIsNewTicketModalOpen] = useState(false);

  // New Ticket Form State
  const [newTicketForm, setNewTicketForm] = useState({
    subject: '',
    category: 'Statement Inquiry' as SupportTicket['category'],
    priority: 'medium' as SupportTicket['priority'],
    accountId: accounts[0]?.id || '',
    message: ''
  });

  // Reply State
  const [replyMessage, setReplyMessage] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      if (isDemoMode) {
        setTickets(SAMPLE_TICKETS);
        if (SAMPLE_TICKETS.length > 0 && !selectedTicketId) {
          setSelectedTicketId(SAMPLE_TICKETS[0].id);
        }
      } else {
        const ticketsSnap = await getDocs(collection(db, 'support_tickets'));
        const loaded: SupportTicket[] = [];
        ticketsSnap.forEach((docSnap) => {
          const data = docSnap.data();
          // Filter if non-staff investor to show only their tickets
          if (isStaffMember || data.investorUid === currentUser?.uid) {
            loaded.push({
              id: docSnap.id,
              ticketNumber: data.ticketNumber || `TCK-${docSnap.id.slice(0, 4)}`,
              subject: data.subject || 'Support Ticket',
              category: data.category || 'General Inquiry',
              priority: data.priority || 'medium',
              status: data.status || 'open',
              investorUid: data.investorUid || '',
              investorName: data.investorName || 'Investor',
              investorEmail: data.investorEmail || '',
              accountId: data.accountId,
              assignedToUid: data.assignedToUid,
              assignedToName: data.assignedToName,
              createdAt: data.createdAt || new Date().toISOString(),
              updatedAt: data.updatedAt || new Date().toISOString(),
              messages: data.messages || []
            });
          }
        });

        if (loaded.length === 0) {
          setTickets(SAMPLE_TICKETS);
          if (SAMPLE_TICKETS.length > 0) setSelectedTicketId(SAMPLE_TICKETS[0].id);
        } else {
          setTickets(loaded);
          if (loaded.length > 0 && !selectedTicketId) setSelectedTicketId(loaded[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching tickets:', err);
      toast.error('Could not load live support tickets. Displaying demo tickets.');
      setTickets(SAMPLE_TICKETS);
      if (!selectedTicketId) setSelectedTicketId(SAMPLE_TICKETS[0].id);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [isDemoMode, role]);

  const selectedTicket = tickets.find(t => t.id === selectedTicketId);

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTicketForm.subject || !newTicketForm.message) {
      toast.error('Please enter a subject and message.');
      return;
    }

    try {
      const ticketId = `tck-${Date.now()}`;
      const ticketNumber = `TCK-${Math.floor(1000 + Math.random() * 9000)}`;
      const timestamp = new Date().toISOString();

      const newTicket: SupportTicket = {
        id: ticketId,
        ticketNumber,
        subject: newTicketForm.subject,
        category: newTicketForm.category,
        priority: newTicketForm.priority,
        status: 'open',
        investorUid: currentUser?.uid || 'inv-user',
        investorName: currentUser?.displayName || currentUser?.email || 'Investor',
        investorEmail: currentUser?.email || 'investor@omnifund.io',
        accountId: newTicketForm.accountId,
        createdAt: timestamp,
        updatedAt: timestamp,
        messages: [
          {
            id: `msg-${Date.now()}`,
            senderUid: currentUser?.uid || 'inv-user',
            senderName: currentUser?.displayName || currentUser?.email || 'Investor',
            senderRole: (role as UserRoleType) || 'investor',
            message: newTicketForm.message,
            timestamp
          }
        ]
      };

      if (!isDemoMode) {
        await setDoc(doc(db, 'support_tickets', ticketId), {
          ticketNumber,
          subject: newTicketForm.subject,
          category: newTicketForm.category,
          priority: newTicketForm.priority,
          status: 'open',
          investorUid: currentUser?.uid || 'inv-user',
          investorName: currentUser?.displayName || currentUser?.email || 'Investor',
          investorEmail: currentUser?.email || 'investor@omnifund.io',
          accountId: newTicketForm.accountId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          messages: newTicket.messages
        });
      }

      setTickets(prev => [newTicket, ...prev]);
      setSelectedTicketId(ticketId);
      setIsNewTicketModalOpen(false);
      setNewTicketForm({
        subject: '',
        category: 'Statement Inquiry',
        priority: 'medium',
        accountId: accounts[0]?.id || '',
        message: ''
      });
      toast.success(`Support Ticket ${ticketNumber} created successfully! Our team will respond shortly.`);
    } catch (err: any) {
      toast.error('Failed to submit ticket');
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyMessage.trim() || !selectedTicket) return;

    try {
      const timestamp = new Date().toISOString();
      const newMsg: SupportMessage = {
        id: `msg-${Date.now()}`,
        senderUid: currentUser?.uid || 'user',
        senderName: currentUser?.displayName || currentUser?.email || (isStaffMember ? 'Staff Member' : 'Investor'),
        senderRole: (role as UserRoleType) || (isStaffMember ? 'staff' : 'investor'),
        message: replyMessage,
        timestamp,
        isInternalNote: isStaffMember && isInternalNote
      };

      const updatedMessages = [...selectedTicket.messages, newMsg];
      const updatedStatus = isStaffMember && selectedTicket.status === 'open' ? 'in_progress' : selectedTicket.status;

      if (!isDemoMode) {
        await updateDoc(doc(db, 'support_tickets', selectedTicket.id), {
          messages: updatedMessages,
          status: updatedStatus,
          updatedAt: serverTimestamp()
        });
      }

      setTickets(prev => prev.map(t => t.id === selectedTicket.id ? {
        ...t,
        messages: updatedMessages,
        status: updatedStatus,
        updatedAt: timestamp
      } : t));

      setReplyMessage('');
      toast.success(isInternalNote ? 'Internal staff note added' : 'Reply posted to ticket thread');
    } catch (err: any) {
      toast.error('Failed to post reply');
    }
  };

  const handleUpdateTicketStatus = async (ticketId: string, newStatus: SupportTicket['status']) => {
    try {
      if (!isDemoMode) {
        await updateDoc(doc(db, 'support_tickets', ticketId), {
          status: newStatus,
          updatedAt: serverTimestamp()
        });
      }
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: newStatus, updatedAt: new Date().toISOString() } : t));
      toast.success(`Ticket status updated to ${newStatus.replace('_', ' ').toUpperCase()}`);
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  const handleAssignTicket = async (ticketId: string, staffName: string) => {
    try {
      if (!isDemoMode) {
        await updateDoc(doc(db, 'support_tickets', ticketId), {
          assignedToName: staffName,
          assignedToUid: currentUser?.uid || 'staff-uid',
          updatedAt: serverTimestamp()
        });
      }
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, assignedToName: staffName, assignedToUid: currentUser?.uid } : t));
      toast.success(`Assigned ticket to ${staffName}`);
    } catch (err) {
      toast.error('Failed to assign ticket');
    }
  };

  const filteredTickets = tickets.filter(t => {
    const matchesSearch = t.ticketNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          t.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          t.investorName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getPriorityBadge = (priority: SupportTicket['priority']) => {
    switch (priority) {
      case 'urgent':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1 w-fit"><AlertTriangle className="w-3 h-3" /> Urgent</span>;
      case 'high':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30 w-fit">High</span>;
      case 'medium':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 w-fit">Medium</span>;
      default:
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-slate-800 text-slate-400 border border-slate-700 w-fit">Low</span>;
    }
  };

  const getStatusBadge = (status: SupportTicket['status']) => {
    switch (status) {
      case 'open':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Open</span>;
      case 'in_progress':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 flex items-center gap-1"><Clock className="w-3 h-3" /> In Progress</span>;
      case 'resolved':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Resolved</span>;
      case 'closed':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-400 border border-slate-700">Closed</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-cyan-950 to-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-bold flex items-center gap-1.5">
                <Headphones className="w-3.5 h-3.5 text-cyan-400" /> Support Desk Portal
              </span>
              <span className="text-xs text-slate-400 font-medium">
                {isStaffMember ? 'Staff Support Operations' : 'Investor Assistance Desk'}
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">Support & Inquiry Center</h1>
            <p className="text-slate-400 text-sm mt-1 max-w-2xl">
              {isStaffMember 
                ? 'Manage investor inquiries, statement re-issuances, KYC queries, and operational support tickets.' 
                : 'Need assistance with your investment statement or fund transactions? Submit a ticket for immediate staff support.'}
            </p>
          </div>

          <button
            onClick={() => setIsNewTicketModalOpen(true)}
            className="px-5 py-3 rounded-2xl bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white font-bold text-sm shadow-xl shadow-cyan-900/20 flex items-center justify-center gap-2 transition-all shrink-0"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Open Support Ticket</span>
          </button>
        </div>

        {/* Metrics Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8 pt-6 border-t border-slate-800/80">
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4">
            <span className="text-xs font-bold text-slate-400 block uppercase tracking-wider">Total Inquiries</span>
            <span className="text-2xl font-black text-white mt-1 block">{tickets.length}</span>
          </div>
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4">
            <span className="text-xs font-bold text-amber-400 block uppercase tracking-wider">Open / Pending</span>
            <span className="text-2xl font-black text-amber-400 mt-1 block">
              {tickets.filter(t => t.status === 'open' || t.status === 'in_progress').length}
            </span>
          </div>
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4">
            <span className="text-xs font-bold text-emerald-400 block uppercase tracking-wider">Resolved</span>
            <span className="text-2xl font-black text-emerald-400 mt-1 block">
              {tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length}
            </span>
          </div>
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4">
            <span className="text-xs font-bold text-cyan-400 block uppercase tracking-wider">Avg Response Time</span>
            <span className="text-2xl font-black text-cyan-400 mt-1 block">&lt; 15 mins</span>
          </div>
        </div>
      </div>

      {/* Main Support Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Side: Ticket List */}
        <div className="lg:col-span-5 space-y-4">
          {/* Controls */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="relative w-full">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search ticket #, subject, or investor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              {['all', 'open', 'in_progress', 'resolved'].map((filter) => (
                <button
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  className={`px-3 py-1.5 rounded-xl font-bold uppercase tracking-wider text-[10px] whitespace-nowrap transition-all ${
                    statusFilter === filter
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  {filter.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Ticket Queue */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden divide-y divide-slate-800/80 shadow-xl max-h-[600px] overflow-y-auto">
            {filteredTickets.length === 0 ? (
              <div className="p-8 text-center text-slate-500 space-y-2">
                <MessageSquare className="w-8 h-8 mx-auto text-slate-700" />
                <p className="text-sm font-bold text-slate-300">No support tickets match your filter</p>
                <p className="text-xs text-slate-500">Create a ticket or clear your filter settings.</p>
              </div>
            ) : (
              filteredTickets.map((t) => {
                const isSelected = t.id === selectedTicketId;
                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTicketId(t.id)}
                    className={`p-4 cursor-pointer transition-all ${
                      isSelected 
                        ? 'bg-cyan-950/40 border-l-4 border-l-cyan-500' 
                        : 'hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="font-mono text-xs font-black text-cyan-400">{t.ticketNumber}</span>
                      <div className="flex items-center gap-2">
                        {getPriorityBadge(t.priority)}
                        {getStatusBadge(t.status)}
                      </div>
                    </div>

                    <h4 className="text-sm font-bold text-white line-clamp-1 mb-1">{t.subject}</h4>
                    <p className="text-xs text-slate-400 line-clamp-1 mb-2">
                      {t.messages[t.messages.length - 1]?.message || 'No messages yet'}
                    </p>

                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-800/50">
                      <span className="font-semibold text-slate-300 flex items-center gap-1">
                        <User className="w-3 h-3 text-slate-500" /> {t.investorName}
                      </span>
                      <span>{new Date(t.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side: Detailed Conversation Thread */}
        <div className="lg:col-span-7">
          {selectedTicket ? (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col min-h-[600px]">
              {/* Ticket Detail Header */}
              <div className="p-6 border-b border-slate-800 bg-slate-950/60 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs font-black text-cyan-400 bg-cyan-500/10 px-2.5 py-1 rounded-lg border border-cyan-500/20">
                        {selectedTicket.ticketNumber}
                      </span>
                      <span className="text-xs font-bold text-slate-400 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700">
                        {selectedTicket.category}
                      </span>
                    </div>
                    <h2 className="text-lg font-black text-white">{selectedTicket.subject}</h2>
                  </div>

                  <div className="flex items-center gap-2">
                    {getStatusBadge(selectedTicket.status)}
                  </div>
                </div>

                {/* Staff Control Panel for Ticket */}
                {isStaffMember && (
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 font-bold">Status:</span>
                      <select
                        value={selectedTicket.status}
                        onChange={(e) => handleUpdateTicketStatus(selectedTicket.id, e.target.value as any)}
                        className="bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1 text-xs text-white font-bold outline-none cursor-pointer"
                      >
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 font-bold">Assignee:</span>
                      <button
                        onClick={() => handleAssignTicket(selectedTicket.id, currentUser?.displayName || 'Support Specialist')}
                        className="px-3 py-1 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30 flex items-center gap-1 transition-all"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>{selectedTicket.assignedToName || 'Assign to Me'}</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Investor Details */}
                <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                  <span>Investor: <strong className="text-white">{selectedTicket.investorName}</strong> ({selectedTicket.investorEmail})</span>
                  <span>Created: {new Date(selectedTicket.createdAt).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Message Thread */}
              <div className="flex-1 p-6 space-y-4 overflow-y-auto max-h-[380px] bg-slate-950/30">
                {selectedTicket.messages.map((msg) => {
                  const isStaffSender = msg.senderRole === 'admin' || msg.senderRole === 'superadmin' || msg.senderRole === 'staff' || msg.senderRole === 'support';
                  
                  // Hide internal staff notes from investors!
                  if (msg.isInternalNote && !isStaffMember) return null;

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isStaffSender ? 'items-end' : 'items-start'}`}
                    >
                      <div className="flex items-center gap-2 mb-1 text-[11px] text-slate-400">
                        <span className="font-bold text-slate-300">{msg.senderName}</span>
                        {isStaffSender && (
                          <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[9px] font-bold border border-purple-500/30">
                            Staff
                          </span>
                        )}
                        {msg.isInternalNote && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[9px] font-bold border border-amber-500/30 flex items-center gap-1">
                            <Lock className="w-2.5 h-2.5" /> Internal Note
                          </span>
                        )}
                        <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>

                      <div
                        className={`max-w-xl rounded-2xl p-4 text-xs leading-relaxed shadow-md ${
                          msg.isInternalNote
                            ? 'bg-amber-500/10 border border-amber-500/30 text-amber-200'
                            : isStaffSender
                              ? 'bg-cyan-600/20 border border-cyan-500/30 text-slate-100 rounded-tr-none'
                              : 'bg-slate-800 border border-slate-700 text-slate-200 rounded-tl-none'
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{msg.message}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Reply Form Footer */}
              <div className="p-4 border-t border-slate-800 bg-slate-950/80">
                <form onSubmit={handleSendReply} className="space-y-3">
                  {isStaffMember && (
                    <div className="flex items-center justify-between text-xs">
                      <label className="flex items-center gap-2 cursor-pointer text-amber-400 font-bold">
                        <input
                          type="checkbox"
                          checked={isInternalNote}
                          onChange={(e) => setIsInternalNote(e.target.checked)}
                          className="rounded border-slate-700 text-amber-500 focus:ring-amber-500 bg-slate-900"
                        />
                        <Lock className="w-3.5 h-3.5" /> Post as Internal Staff Note (Visible only to team)
                      </label>

                      <span className="text-[11px] text-slate-500">Shift + Enter for new line</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder={isInternalNote ? "Write internal note for staff audit log..." : "Write official reply to investor..."}
                      value={replyMessage}
                      onChange={(e) => setReplyMessage(e.target.value)}
                      className={`flex-1 bg-slate-900 border rounded-2xl px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none transition-all ${
                        isInternalNote ? 'border-amber-500/40 focus:border-amber-400' : 'border-slate-800 focus:border-cyan-500'
                      }`}
                    />

                    <button
                      type="submit"
                      disabled={!replyMessage.trim()}
                      className={`px-5 py-3 rounded-2xl font-bold text-xs shadow-lg flex items-center gap-2 transition-all disabled:opacity-50 ${
                        isInternalNote
                          ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-900/30'
                          : 'bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white shadow-cyan-900/30'
                      }`}
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{isInternalNote ? 'Save Note' : 'Send Reply'}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center text-slate-500 min-h-[600px] flex flex-col items-center justify-center space-y-3">
              <Headphones className="w-12 h-12 text-slate-700" />
              <p className="text-base font-bold text-slate-300">Select a support ticket to view discussion</p>
              <p className="text-xs max-w-sm">Choose an inquiry from the left panel or submit a new support request.</p>
            </div>
          )}
        </div>
      </div>

      {/* New Ticket Modal */}
      <AnimatePresence>
        {isNewTicketModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 md:p-8 shadow-2xl relative"
            >
              <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                    <PlusCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Create Support Ticket</h3>
                    <p className="text-xs text-slate-400">Direct query dispatch to Fund Operations & Support</p>
                  </div>
                </div>

                <button
                  onClick={() => setIsNewTicketModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800/60"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateTicket} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Ticket Subject *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Q1 Dividend Payout Confirmation"
                    value={newTicketForm.subject}
                    onChange={(e) => setNewTicketForm({ ...newTicketForm, subject: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      Category *
                    </label>
                    <select
                      value={newTicketForm.category}
                      onChange={(e) => setNewTicketForm({ ...newTicketForm, category: e.target.value as any })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 outline-none"
                    >
                      <option value="Statement Inquiry">Statement Inquiry</option>
                      <option value="Investment Request">Investment Request</option>
                      <option value="Withdrawal/Redemption">Withdrawal / Redemption</option>
                      <option value="KYC & Account">KYC & Account</option>
                      <option value="Technical Support">Technical Support</option>
                      <option value="General Inquiry">General Inquiry</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      Priority Level
                    </label>
                    <select
                      value={newTicketForm.priority}
                      onChange={(e) => setNewTicketForm({ ...newTicketForm, priority: e.target.value as any })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 outline-none"
                    >
                      <option value="low">Low Priority</option>
                      <option value="medium">Medium Priority</option>
                      <option value="high">High Priority</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Detailed Message *
                  </label>
                  <textarea
                    required
                    rows={4}
                    placeholder="Describe your inquiry or requested operation details..."
                    value={newTicketForm.message}
                    onChange={(e) => setNewTicketForm({ ...newTicketForm, message: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 resize-none"
                  />
                </div>

                <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsNewTicketModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white font-bold text-xs shadow-lg shadow-cyan-900/30 flex items-center gap-2"
                  >
                    <span>Submit Ticket</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
