import React, { useState, useEffect } from 'react';
import { 
  Users, 
  UserPlus, 
  ShieldCheck, 
  Shield, 
  Headphones, 
  Briefcase, 
  Search, 
  Filter, 
  MoreVertical, 
  CheckCircle2, 
  XCircle, 
  Edit3, 
  Trash2, 
  Key, 
  Mail, 
  Building2, 
  Sparkles,
  AlertCircle,
  Clock,
  ChevronRight,
  UserCheck,
  Lock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile, UserRoleType } from '../types';
import { toast } from 'sonner';

interface StaffManagementProps {
  currentUser: any;
  role: string | null;
  isDemoMode: boolean;
}

const SAMPLE_STAFF: UserProfile[] = [
  {
    uid: 'staff-demo-1',
    email: 'sarah.jenkins@omnifund.io',
    displayName: 'Sarah Jenkins',
    role: 'admin',
    department: 'Fund Management',
    isActive: true,
    createdAt: '2025-11-10T09:00:00Z',
    createdBy: 'Superadmin'
  },
  {
    uid: 'staff-demo-2',
    email: 'marcus.vance@omnifund.io',
    displayName: 'Marcus Vance',
    role: 'staff',
    department: 'Operations & Compliance',
    isActive: true,
    createdAt: '2026-01-15T10:30:00Z',
    createdBy: 'Superadmin'
  },
  {
    uid: 'staff-demo-3',
    email: 'elena.rodriguez@omnifund.io',
    displayName: 'Elena Rodriguez',
    role: 'support',
    department: 'Investor Support',
    isActive: true,
    createdAt: '2026-02-01T14:20:00Z',
    createdBy: 'Superadmin'
  },
  {
    uid: 'staff-demo-4',
    email: 'david.chen@omnifund.io',
    displayName: 'David Chen',
    role: 'staff',
    department: 'Valuation & Accounting',
    isActive: false,
    createdAt: '2026-03-05T11:00:00Z',
    createdBy: 'Superadmin'
  }
];

export default function StaffManagement({ currentUser, role, isDemoMode }: StaffManagementProps) {
  const [staffList, setStaffList] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<UserProfile | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    role: 'staff' as UserRoleType,
    department: 'Fund Operations',
    isActive: true
  });

  const fetchStaff = async () => {
    setLoading(true);
    try {
      if (isDemoMode) {
        setStaffList(SAMPLE_STAFF);
      } else {
        const usersSnap = await getDocs(collection(db, 'users'));
        const fetchedUsers: UserProfile[] = [];
        usersSnap.forEach((docSnap) => {
          const data = docSnap.data();
          // Filter staff roles (non-investors or users explicitly marked as staff/admin/support/superadmin)
          if (data.role && data.role !== 'investor') {
            fetchedUsers.push({
              uid: docSnap.id,
              email: data.email || 'No email',
              displayName: data.displayName || data.email?.split('@')[0] || 'Staff Member',
              role: data.role as UserRoleType,
              department: data.department || 'General Operations',
              isActive: data.isActive !== false,
              createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt || new Date().toISOString(),
              createdBy: data.createdBy || 'Admin'
            });
          }
        });

        if (fetchedUsers.length === 0) {
          setStaffList(SAMPLE_STAFF);
        } else {
          setStaffList(fetchedUsers);
        }
      }
    } catch (err) {
      console.error('Error fetching staff list:', err);
      toast.error('Failed to load staff profiles. Using cached view.');
      setStaffList(SAMPLE_STAFF);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, [isDemoMode]);

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email || !formData.displayName) {
      toast.error('Please complete all required fields');
      return;
    }

    try {
      const targetUid = editingStaff ? editingStaff.uid : `staff-${Date.now()}`;
      const payload: UserProfile = {
        uid: targetUid,
        email: formData.email,
        displayName: formData.displayName,
        role: formData.role,
        department: formData.department,
        isActive: formData.isActive,
        createdAt: editingStaff ? editingStaff.createdAt : new Date().toISOString(),
        createdBy: currentUser?.displayName || currentUser?.email || 'Superadmin'
      };

      if (!isDemoMode) {
        await setDoc(doc(db, 'users', targetUid), {
          email: formData.email,
          displayName: formData.displayName,
          role: formData.role,
          department: formData.department,
          isActive: formData.isActive,
          updatedAt: serverTimestamp(),
          ...(editingStaff ? {} : { createdAt: serverTimestamp(), createdBy: currentUser?.email })
        }, { merge: true });
      }

      if (editingStaff) {
        setStaffList(prev => prev.map(s => s.uid === targetUid ? payload : s));
        toast.success(`Updated staff profile for ${formData.displayName}`);
      } else {
        setStaffList(prev => [payload, ...prev]);
        toast.success(`Created staff login for ${formData.displayName} as ${formData.role.toUpperCase()}`);
      }

      setIsAddModalOpen(false);
      setEditingStaff(null);
      setFormData({
        displayName: '',
        email: '',
        role: 'staff',
        department: 'Fund Operations',
        isActive: true
      });
    } catch (err: any) {
      console.error('Error saving staff:', err);
      toast.error(err.message || 'Failed to save staff profile');
    }
  };

  const isSuperAdminUser = role === 'superadmin' || currentUser?.email === 'emmanuelagbanyo8@gmail.com';

  const handleToggleStatus = async (staffMember: UserProfile) => {
    if (staffMember.role === 'superadmin' || staffMember.email === 'emmanuelagbanyo8@gmail.com') {
      toast.error('Security Restriction: Superadmin master accounts cannot be suspended.');
      return;
    }

    if (!isSuperAdminUser) {
      toast.error('Permission Denied: Staff and Admin logins created by Superadmin cannot be suspended by non-superadmins.');
      return;
    }

    const updatedStatus = !staffMember.isActive;
    try {
      if (!isDemoMode) {
        await updateDoc(doc(db, 'users', staffMember.uid), {
          isActive: updatedStatus,
          updatedAt: serverTimestamp()
        });
      }
      setStaffList(prev => prev.map(s => s.uid === staffMember.uid ? { ...s, isActive: updatedStatus } : s));
      toast.success(`${staffMember.displayName} is now ${updatedStatus ? 'Active' : 'Suspended'}`);
    } catch (err: any) {
      toast.error('Failed to update status');
    }
  };

  const handleDeleteStaff = async (staffMember: UserProfile) => {
    if (staffMember.role === 'superadmin' || staffMember.email === 'emmanuelagbanyo8@gmail.com') {
      toast.error('Security Restriction: Superadmin master accounts cannot be removed.');
      return;
    }

    if (!isSuperAdminUser) {
      toast.error('Permission Denied: Staff and Admin logins created by Superadmin cannot be removed by non-superadmins.');
      return;
    }

    const name = staffMember.displayName || staffMember.email;
    if (!confirm(`Are you sure you want to revoke staff access for ${name}?`)) return;
    try {
      if (!isDemoMode) {
        await deleteDoc(doc(db, 'users', staffMember.uid));
      }
      setStaffList(prev => prev.filter(s => s.uid !== staffMember.uid));
      toast.success(`Staff account for ${name} has been removed`);
    } catch (err: any) {
      toast.error('Failed to remove staff account');
    }
  };

  const openEditModal = (staffMember: UserProfile) => {
    setEditingStaff(staffMember);
    setFormData({
      displayName: staffMember.displayName || '',
      email: staffMember.email,
      role: staffMember.role,
      department: staffMember.department || 'Fund Operations',
      isActive: staffMember.isActive !== false
    });
    setIsAddModalOpen(true);
  };

  const filteredStaff = staffList.filter(s => {
    const matchesSearch = s.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          s.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          s.department?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'all' || s.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const getRoleBadge = (roleType: UserRoleType) => {
    switch (roleType) {
      case 'superadmin':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-500/10 text-purple-400 border border-purple-500/30 flex items-center gap-1 w-fit"><ShieldCheck className="w-3.5 h-3.5" /> Super Admin</span>;
      case 'admin':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1 w-fit"><Shield className="w-3.5 h-3.5" /> Fund Admin</span>;
      case 'support':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 flex items-center gap-1 w-fit"><Headphones className="w-3.5 h-3.5" /> Support Specialist</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 w-fit"><Briefcase className="w-3.5 h-3.5" /> Operations Staff</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-purple-950 to-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-bold flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-purple-400" /> Superadmin Portal
              </span>
              <span className="text-xs text-slate-400 font-medium">RBAC Security Enabled</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">Staff & Administrative Logins</h1>
            <p className="text-slate-400 text-sm mt-1 max-w-2xl">
              Create and manage staff credentials with tailored operational privileges (Admin, Operations, Support Specialists).
            </p>
          </div>

          <button
            onClick={() => {
              setEditingStaff(null);
              setFormData({
                displayName: '',
                email: '',
                role: 'staff',
                department: 'Fund Operations',
                isActive: true
              });
              setIsAddModalOpen(true);
            }}
            className="px-5 py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-emerald-600 hover:from-purple-500 hover:to-emerald-500 text-white font-bold text-sm shadow-xl shadow-purple-900/20 flex items-center justify-center gap-2 transition-all shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span>Create Staff Login</span>
          </button>
        </div>

        {/* Stats Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8 pt-6 border-t border-slate-800/80">
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4">
            <span className="text-xs font-bold text-slate-400 block uppercase tracking-wider">Total Staff</span>
            <span className="text-2xl font-black text-white mt-1 block">{staffList.length}</span>
          </div>
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4">
            <span className="text-xs font-bold text-emerald-400 block uppercase tracking-wider">Active Credentials</span>
            <span className="text-2xl font-black text-emerald-400 mt-1 block">{staffList.filter(s => s.isActive).length}</span>
          </div>
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4">
            <span className="text-xs font-bold text-cyan-400 block uppercase tracking-wider">Support Team</span>
            <span className="text-2xl font-black text-cyan-400 mt-1 block">{staffList.filter(s => s.role === 'support').length}</span>
          </div>
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4">
            <span className="text-xs font-bold text-amber-400 block uppercase tracking-wider">Admins & Ops</span>
            <span className="text-2xl font-black text-amber-400 mt-1 block">{staffList.filter(s => s.role === 'admin' || s.role === 'superadmin' || s.role === 'staff').length}</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search staff by name, email, or department..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-slate-300 focus:outline-none focus:border-purple-500 outline-none cursor-pointer w-full md:w-auto"
          >
            <option value="all">All Roles</option>
            <option value="superadmin">Super Admin</option>
            <option value="admin">Fund Admin</option>
            <option value="staff">Operations Staff</option>
            <option value="support">Support Specialist</option>
          </select>
        </div>
      </div>

      {/* Staff Table / Cards */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-400" /> Active Staff Directory
          </h2>
          <span className="text-xs text-slate-400 font-medium">
            Showing {filteredStaff.length} of {staffList.length} staff users
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm font-medium">Loading staff accounts...</p>
          </div>
        ) : filteredStaff.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-3">
            <UserCheck className="w-12 h-12 text-slate-700 mx-auto" />
            <p className="text-base font-semibold text-slate-300">No staff members found</p>
            <p className="text-xs max-w-sm mx-auto">Try adjusting your search criteria or click "Create Staff Login" to add a new account.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] font-black text-slate-400 uppercase tracking-wider bg-slate-950/50">
                  <th className="p-4 pl-6">Staff Member</th>
                  <th className="p-4">Assigned Role</th>
                  <th className="p-4">Department</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Created Date</th>
                  <th className="p-4 pr-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-sm">
                {filteredStaff.map((staffMember) => (
                  <tr key={staffMember.uid} className="hover:bg-slate-800/40 transition-colors group">
                    <td className="p-4 pl-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500/20 to-slate-800 border border-purple-500/20 flex items-center justify-center font-black text-purple-300 shrink-0">
                          {staffMember.displayName?.charAt(0).toUpperCase() || 'S'}
                        </div>
                        <div>
                          <p className="font-bold text-white group-hover:text-purple-300 transition-colors">{staffMember.displayName}</p>
                          <p className="text-xs text-slate-400 font-mono flex items-center gap-1">
                            <Mail className="w-3 h-3 text-slate-500" /> {staffMember.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      {getRoleBadge(staffMember.role)}
                    </td>
                    <td className="p-4 text-xs font-semibold text-slate-300">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-500" />
                        <span>{staffMember.department || 'Fund Operations'}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      {staffMember.isActive !== false ? (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1 w-fit">
                          <CheckCircle2 className="w-3 h-3" /> Active
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1 w-fit">
                          <XCircle className="w-3 h-3" /> Suspended
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-xs text-slate-400 font-mono">
                      {new Date(staffMember.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-4 pr-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {staffMember.role === 'superadmin' || staffMember.email === 'emmanuelagbanyo8@gmail.com' ? (
                          <span className="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-purple-500/10 text-purple-300 border border-purple-500/30 flex items-center gap-1.5 shadow-sm">
                            <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                            <span>Master Admin</span>
                          </span>
                        ) : !isSuperAdminUser ? (
                          <span className="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-slate-950 text-slate-400 border border-slate-800 flex items-center gap-1.5 shadow-sm">
                            <Lock className="w-3.5 h-3.5 text-amber-400" />
                            <span>Protected</span>
                          </span>
                        ) : (
                          <>
                            <button
                              onClick={() => handleToggleStatus(staffMember)}
                              title={staffMember.isActive ? 'Deactivate Login' : 'Activate Login'}
                              className={`p-2 rounded-xl border text-xs font-bold transition-all ${
                                staffMember.isActive 
                                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20' 
                                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                              }`}
                            >
                              {staffMember.isActive ? 'Suspend' : 'Activate'}
                            </button>

                            <button
                              onClick={() => openEditModal(staffMember)}
                              title="Edit Staff Member"
                              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => handleDeleteStaff(staffMember)}
                              title="Delete Staff Login"
                              className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Staff Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
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
              className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 md:p-8 shadow-2xl relative overflow-hidden"
            >
              <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      {editingStaff ? 'Edit Staff Credentials' : 'Create Staff Login'}
                    </h3>
                    <p className="text-xs text-slate-400">Assign role permissions and operational access</p>
                  </div>
                </div>

                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800/60"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveStaff} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Full Name / Staff Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Amanda Cole"
                    value={formData.displayName}
                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Staff Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. amanda.cole@omnifund.io"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      Assigned Privilege Role *
                    </label>
                    <select
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRoleType })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 outline-none"
                    >
                      <option value="staff">Operations Staff</option>
                      <option value="support">Support Specialist</option>
                      <option value="admin">Fund Manager (Admin)</option>
                      <option value="superadmin">Super Admin</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      Department
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Investor Support"
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>

                {/* Role Description Card */}
                <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-2xl text-xs space-y-1 text-slate-300">
                  <p className="font-bold text-purple-400 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> Permissions Overview:
                  </p>
                  {formData.role === 'support' && (
                    <p className="text-slate-400">Can view investor query tickets, respond to support messages, and manage statement requests.</p>
                  )}
                  {formData.role === 'staff' && (
                    <p className="text-slate-400">Full operational access to investor records, transaction processing, statements, and support ticketing.</p>
                  )}
                  {formData.role === 'admin' && (
                    <p className="text-slate-400">Full administrative powers including NAV valuation updates, ingestion engine, accounts, and reports.</p>
                  )}
                  {formData.role === 'superadmin' && (
                    <p className="text-slate-400">Master access including staff credential creation, role assignments, system backups, and security settings.</p>
                  )}
                </div>

                <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-emerald-600 hover:from-purple-500 hover:to-emerald-500 text-white font-bold text-xs shadow-lg shadow-purple-900/30 flex items-center gap-2"
                  >
                    <span>{editingStaff ? 'Update Staff Member' : 'Create Credentials'}</span>
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
