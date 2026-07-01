// ============================================================
//  Members.jsx
//  Component for managing church member (Jemaat) data.
//  Features: list, search, filter, add, edit, delete, view detail.
// ============================================================

// ── Core React hooks
import { useState, useEffect, useCallback, useMemo } from 'react';
import { getAllMembers, createMember, updateMember, deleteMember, getMemberPhotos } from '../service/apiClient';

import {
  Pencil, Trash2, Plus, Eye, X, Users, Search,
  ChevronLeft, ChevronRight, ImageOff, Calendar, Phone,
  Mail, MapPin, AlertTriangle, UserRound, Loader2,
  UserCheck, UserX, SlidersHorizontal
} from 'lucide-react';

export default function Members() {

  // ============================================================
  //  STATE DECLARATIONS
  // ============================================================

  // Holds the full list of members fetched from the API
  const [members, setMembers] = useState([]);

  // Controls the loading spinner while data is being fetched
  const [isLoading, setIsLoading] = useState(true);

  // Stores the current value of the search input
  const [searchQuery, setSearchQuery] = useState('');

  // Stores the currently active status filter chip ('all' | 'active' | 'inactive')
  const [statusFilter, setStatusFilter] = useState('all');

  // Controls visibility of the Add / Edit modal
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Toggles the modal between "add new" and "edit existing" mode
  const [isEditMode, setIsEditMode] = useState(false);

  // Holds the ID of the member currently being edited
  const [editingId, setEditingId] = useState(null);

  // Tracks in-flight save requests so the submit button can show a spinner
  const [isSaving, setIsSaving] = useState(false);

  // Controls visibility of the View Detail modal
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);

  // Holds the member object selected for detail view
  const [selectedMember, setSelectedMember] = useState(null);

  // Controls visibility of the Delete Confirmation modal
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Holds the member targeted for deletion
  const [deletingMember, setDeletingMember] = useState(null);

  // Tracks the in-flight delete request so the confirm button can show a spinner
  const [isDeleting, setIsDeleting] = useState(false);

  // Photo gallery states
  const [photos, setPhotos] = useState([]);
  const [isPhotosLoading, setIsPhotosLoading] = useState(false);
  const [photoPage, setPhotoPage] = useState(1);
  const [photoPagination, setPhotoPagination] = useState(null);

  // Form fields — mirrors the API payload structure
  const [formData, setFormData] = useState({
    full_name: '',
    nickname: '',
    gender: 'L',
    birth_date: '',
    phone: '',
    email: '',
    address: '',
    member_status: 'active'
  });

  // Tracks whether any modal is currently open (used for the shared Escape-key listener)
  const isAnyModalOpen = isModalOpen || isViewModalOpen || isDeleteModalOpen;

  // ============================================================
  //  API FUNCTIONS
  // ============================================================

  // Fetches all members from the backend and updates state
  const fetchMembers = async () => {
    try {
      // Tinggal panggil fungsi yang sudah ada, datanya langsung keluar!
      const data = await getAllMembers();

      setMembers(data);
      setIsLoading(false);
    } catch (error) {
      console.error("Failed to fetch members:", error);
      setIsLoading(false);
    }
  };

  // Runs fetchMembers once when the component first mounts
  useEffect(() => {
    fetchMembers();
  }, []);

  // Fetches member photos when the view modal opens or page changes
  const fetchMemberPhotos = async () => {
    if (!selectedMember) return;

    setIsPhotosLoading(true);
    try {
      const data = await getMemberPhotos(selectedMember.id, photoPage);
      setPhotos(data.results);
      // DRF's paginated response provides 'count', 'next', 'previous'
      setPhotoPagination({
        count: data.count,
        next: data.next,
        previous: data.previous,
        // Calculate total pages based on count and page size (which is 6 from backend)
        totalPages: Math.ceil(data.count / 6)
      });
    } catch (error) {
      console.error("Failed to fetch member photos:", error);
      setPhotos([]);
      setPhotoPagination(null);
    } finally {
      setIsPhotosLoading(false);
    }
  };

  // This effect runs when the selected member changes or when the photo page changes
  useEffect(() => {
    if (isViewModalOpen && selectedMember) {
      fetchMemberPhotos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isViewModalOpen, selectedMember, photoPage]);

  // Closes whichever modal is currently open (used by the Escape key + backdrop click)
  const closeActiveModal = useCallback(() => {
    if (isModalOpen) setIsModalOpen(false);
    if (isViewModalOpen) setIsViewModalOpen(false);
    if (isDeleteModalOpen) setIsDeleteModalOpen(false);
  }, [isModalOpen, isViewModalOpen, isDeleteModalOpen]);

  // Allows dismissing any open modal with the Escape key
  useEffect(() => {
    if (!isAnyModalOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') closeActiveModal();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAnyModalOpen, closeActiveModal]);

  // Prevents background scroll while a modal is open
  useEffect(() => {
    document.body.style.overflow = isAnyModalOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isAnyModalOpen]);

  // ============================================================
  //  FORM HANDLERS
  // ============================================================

  // Generic handler — updates the matching formData field on every keystroke
  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Resets the form and opens the modal in "add new member" mode
  const openAddModal = () => {
    setFormData({
      full_name: '', nickname: '', gender: 'L',
      birth_date: '', phone: '', email: '',
      address: '', member_status: 'active'
    });
    setIsEditMode(false);
    setEditingId(null);
    setIsModalOpen(true);
  };

  // Pre-fills the form with existing data and opens the modal in "edit" mode
  const openEditModal = (member) => {
    setFormData({
      full_name: member.full_name,
      nickname: member.nickname || '',
      gender: member.gender,
      birth_date: member.birth_date || '',
      phone: member.phone || '',
      email: member.email || '',
      address: member.address || '',
      member_status: member.member_status
    });
    setIsEditMode(true);
    setEditingId(member.id);
    setIsModalOpen(true);
  };

  // Sets the selected member and opens the read-only detail modal
  const openViewModal = (member) => {
    setSelectedMember(member);
    setPhotoPage(1); // Reset to first page whenever a new member is selected
    setPhotos([]); // Clear old photos immediately
    setPhotoPagination(null);
    setIsViewModalOpen(true);
  };

  // Submits the form — sends PUT for edit mode, POST for add mode
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (isEditMode) {
        // Update existing member record
        await updateMember(editingId, formData);
      } else {
        // Create a new member record (Memakai ulang fungsi createMember!)
        await createMember(formData);
      }
      setIsModalOpen(false);
      fetchMembers(); // Refresh the table after save
    } catch (error) {
      console.error("Failed to save member:", error.response?.data || error.message);
      alert("An error occurred! Please check your data format.");
    } finally {
      setIsSaving(false);
    }
  };

  // Opens the delete confirmation modal for the given member
  const openDeleteModal = (member) => {
    setDeletingMember(member);
    setIsDeleteModalOpen(true);
  };

  // Sends DELETE request after confirmation in the modal
  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteMember(deletingMember.id);
      setIsDeleteModalOpen(false);
      setDeletingMember(null);
      fetchMembers();
    } catch (error) {
      console.error("Failed to delete member:", error);
      alert("Failed to delete member.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePhotoNextPage = () => {
    if (photoPagination && photoPagination.next) {
      setPhotoPage(prevPage => prevPage + 1);
    }
  };

  const handlePhotoPrevPage = () => {
    if (photoPagination && photoPagination.previous) {
      setPhotoPage(prevPage => prevPage - 1);
    }
  };

  // ============================================================
  //  DERIVED DATA
  // ============================================================

  // Filters members by name/phone query AND the active status chip
  const filteredMembers = useMemo(() => {
    return members.filter(m => {
      const matchesQuery =
        m.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.phone && m.phone.includes(searchQuery));
      const matchesStatus =
        statusFilter === 'all' ? true : m.member_status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [members, searchQuery, statusFilter]);

  // Counts for the summary stat cards at the top
  const activeCount   = members.filter(m => m.member_status === 'active').length;
  const inactiveCount = members.filter(m => m.member_status === 'inactive').length;

  // ============================================================
  //  HELPER / UTILITY FUNCTIONS
  // ============================================================

  // Extracts up to 2 initials from a full name (e.g. "John Doe" → "JD")
  const getInitials = (name) => {
    return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
  };

  // Tailwind gradient classes used for avatar background colors
  const avatarColors = [
    'from-violet-500 to-purple-600',
    'from-blue-500 to-cyan-600',
    'from-emerald-500 to-teal-600',
    'from-rose-500 to-pink-600',
    'from-amber-500 to-orange-600',
    'from-indigo-500 to-blue-600',
  ];

  // Picks a consistent avatar color based on the first character of the name
  const getAvatarColor = (name) => {
    const idx = name.charCodeAt(0) % avatarColors.length;
    return avatarColors[idx];
  };

  // Formats an ISO date (YYYY-MM-DD) into a friendlier "12 Jan 1998" style string
  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr + 'T00:00:00').toLocaleDateString('id-ID', {
        day: 'numeric', month: 'short', year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  // Stops backdrop-click-to-close from firing when a click lands inside the modal card
  const stopPropagation = (e) => e.stopPropagation();

  // ============================================================
  //  REUSABLE STYLE CONSTANTS
  // ============================================================

  // Shared Tailwind classes for all form input / select / textarea elements
  const inputClass = "w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 focus:outline-none bg-slate-50 focus:bg-white transition-all placeholder:text-slate-400";

  // Shared Tailwind classes for all form labels
  const labelClass = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5";

  // Shared Tailwind classes for the small section eyebrows inside the form
  const sectionLabelClass = "text-xs font-bold text-indigo-500 uppercase tracking-widest";

  // Status filter chip definitions (label + icon + accent color per state)
  const statusChips = [
    { key: 'all',      label: 'Semua',       icon: SlidersHorizontal, count: members.length },
    { key: 'active',   label: 'Aktif',       icon: UserCheck,          count: activeCount },
    { key: 'inactive', label: 'Tidak Aktif', icon: UserX,              count: inactiveCount },
  ];

  // ============================================================
  //  RENDER
  // ============================================================
  return (
    <>
      {/* ── Global styles: custom fonts, animations, and utility classes ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Sora:wght@600;700;800&display=swap');

        /* Body copy + UI chrome uses Jakarta Sans; headings use the sharper Sora face */
        .members-root { font-family: 'Plus Jakarta Sans', sans-serif; position: relative; }
        .font-display { font-family: 'Sora', sans-serif; letter-spacing: -0.02em; }

        /* Soft ambient mesh sitting behind the whole page — the page's one signature flourish */
        .mesh-backdrop {
          position: absolute; inset: -40px -20px auto -20px; height: 340px;
          background:
            radial-gradient(480px 220px at 8% 0%, rgba(99,102,241,0.10), transparent 70%),
            radial-gradient(420px 200px at 85% 10%, rgba(168,85,247,0.09), transparent 70%),
            radial-gradient(300px 180px at 50% 40%, rgba(16,185,129,0.05), transparent 70%);
          pointer-events: none; z-index: 0;
        }

        /* Fade-in animation for newly rendered table rows */
        .fade-in { animation: fadeIn 0.35s ease; }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* Gentle rise-in used for the stat cards on first paint */
        .rise-in { animation: riseIn 0.45s cubic-bezier(0.16,1,0.3,1) both; }
        @keyframes riseIn {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        /* Subtle left-to-right highlight on table row hover */
        .row-hover { position: relative; }
        .row-hover:hover { background: linear-gradient(90deg, #f8f7ff 0%, #ffffff 100%); }
        .row-hover:hover .row-accent { opacity: 1; }
        .row-accent {
          position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
          background: linear-gradient(180deg, #6366f1, #a855f7);
          opacity: 0; transition: opacity 0.2s ease; border-radius: 0 3px 3px 0;
        }

        /* Primary gradient button — default, hover, and disabled states */
        .btn-primary { background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); }
        .btn-primary:hover:not(:disabled) {
          background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%);
          box-shadow: 0 6px 18px rgba(99,102,241,0.4);
          transform: translateY(-1px);
        }
        .btn-primary:active:not(:disabled) { transform: translateY(0); }
        .btn-primary:disabled { opacity: 0.7; cursor: not-allowed; }

        /* Filter chip styling */
        .chip {
          transition: all 0.18s ease; border: 1px solid transparent;
        }
        .chip-inactive { background: #f8fafc; color: #64748b; border-color: #eef1f6; }
        .chip-inactive:hover { background: #f1f5f9; color: #475569; }
        .chip-active-all      { background: linear-gradient(135deg,#6366f1,#4f46e5); color: #fff; box-shadow: 0 4px 12px rgba(99,102,241,0.32); }
        .chip-active-active   { background: linear-gradient(135deg,#10b981,#0d9488); color: #fff; box-shadow: 0 4px 12px rgba(16,185,129,0.30); }
        .chip-active-inactive { background: linear-gradient(135deg,#64748b,#475569); color: #fff; box-shadow: 0 4px 12px rgba(71,85,105,0.28); }

        /* Modal backdrop fade-in */
        .modal-backdrop { animation: backdropIn 0.2s ease-out; }
        @keyframes backdropIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        /* Modal card smooth scale-in animation */
        .modal-card { animation: modalIn 0.25s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.96) translateY(6px); }
          to   { opacity: 1; transform: scale(1) translateY(0);    }
        }

        /* Decorative blurred blobs used behind profile headers in modals */
        .blob { position: absolute; border-radius: 9999px; filter: blur(30px); pointer-events: none; }

        /* Coloured ring glow on action button hover */
        .delete-btn:hover { box-shadow: 0 0 0 3px rgba(239,68,68,0.15); transform: translateY(-1px); }
        .edit-btn:hover   { box-shadow: 0 0 0 3px rgba(234,179,8,0.15); transform: translateY(-1px); }
        .view-btn:hover   { box-shadow: 0 0 0 3px rgba(99,102,241,0.15); transform: translateY(-1px); }
        .delete-btn, .edit-btn, .view-btn { transition: all 0.15s ease; }

        /* Photo thumbnail hover zoom inside the gallery */
        .photo-thumb { transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .photo-thumb:hover { transform: scale(1.04); box-shadow: 0 4px 12px rgba(15,23,42,0.15); }

        /* Avatar ring + subtle glow used across table, view modal and delete modal */
        .avatar-ring { box-shadow: 0 0 0 3px #ffffff, 0 4px 10px rgba(15,23,42,0.12); }

        /* Skeleton loading shimmer for the table */
        .skeleton {
          background: linear-gradient(90deg, #f1f5f9 25%, #e9edf3 37%, #f1f5f9 63%);
          background-size: 400% 100%;
          animation: shimmer 1.4s ease infinite;
          border-radius: 8px;
        }
        @keyframes shimmer {
          0% { background-position: 100% 50%; }
          100% { background-position: 0 50%; }
        }

        /* Custom thin scrollbar for scrollable modal bodies */
        .thin-scroll::-webkit-scrollbar { width: 6px; }
        .thin-scroll::-webkit-scrollbar-track { background: transparent; }
        .thin-scroll::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 999px; }
        .thin-scroll::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
      `}</style>

      <div className="members-root">

        {/* Ambient mesh gradient sitting behind the header + stat cards */}
        <div className="mesh-backdrop" />

        {/* ── PAGE HEADER: eyebrow + title + "Add Member" button ── */}
        <div className="relative z-10 mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-200 flex-shrink-0">
              <Users size={20} className="text-white" strokeWidth={2.2} />
            </div>
            <div>
              <h2 className="font-display text-[28px] font-bold text-slate-800 leading-tight">Data Jemaat</h2>
              <p className="text-sm text-slate-500 mt-1">Kelola seluruh data dan riwayat anggota jemaat di satu tempat</p>
            </div>
          </div>

          {/* Button opens the blank Add New Member form */}
          <button
            onClick={openAddModal}
            className="btn-primary flex items-center gap-2 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-md w-fit"
          >
            <Plus size={16} strokeWidth={2.5} />
            Tambah Jemaat
          </button>
        </div>

        {/* ── STAT CARDS: total / active / inactive summary ── */}
        <div className="relative z-10 grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">

          {/* Total members card */}
          <div className="rise-in bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl p-5 text-white shadow-lg shadow-indigo-200/70 relative overflow-hidden" style={{ animationDelay: '0ms' }}>
            <div className="blob w-24 h-24 bg-white/10 -top-8 -right-8" />
            <div className="relative flex items-start justify-between">
              <div>
                <p className="text-indigo-200 text-xs font-semibold uppercase tracking-wide">Total Jemaat</p>
                <p className="font-display text-3xl font-bold mt-1.5">{members.length}</p>
              </div>
              <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
                <Users size={16} className="text-white" />
              </div>
            </div>
            <p className="relative text-indigo-200 text-xs mt-3">Seluruh anggota yang terdaftar</p>
          </div>

          {/* Active members card with progress bar */}
          <div className="rise-in bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-5 text-white shadow-lg shadow-emerald-200/70 relative overflow-hidden" style={{ animationDelay: '60ms' }}>
            <div className="blob w-24 h-24 bg-white/10 -top-8 -right-8" />
            <div className="relative flex items-start justify-between">
              <div>
                <p className="text-emerald-200 text-xs font-semibold uppercase tracking-wide">Aktif</p>
                <p className="font-display text-3xl font-bold mt-1.5">{activeCount}</p>
              </div>
              <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
                <UserCheck size={16} className="text-white" />
              </div>
            </div>
            {/* Progress bar showing active ratio out of total */}
            <div className="relative mt-3 w-full bg-emerald-400/40 rounded-full h-1.5">
              <div
                className="bg-white rounded-full h-1.5 transition-all duration-500"
                style={{ width: members.length ? `${(activeCount / members.length) * 100}%` : '0%' }}
              />
            </div>
          </div>

          {/* Inactive members card with progress bar */}
          <div className="rise-in bg-gradient-to-br from-slate-500 to-slate-700 rounded-2xl p-5 text-white shadow-lg shadow-slate-200/70 relative overflow-hidden" style={{ animationDelay: '120ms' }}>
            <div className="blob w-24 h-24 bg-white/10 -top-8 -right-8" />
            <div className="relative flex items-start justify-between">
              <div>
                <p className="text-slate-300 text-xs font-semibold uppercase tracking-wide">Tidak Aktif</p>
                <p className="font-display text-3xl font-bold mt-1.5">{inactiveCount}</p>
              </div>
              <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
                <UserX size={16} className="text-white" />
              </div>
            </div>
            {/* Progress bar showing inactive ratio out of total */}
            <div className="relative mt-3 w-full bg-slate-400/40 rounded-full h-1.5">
              <div
                className="bg-white rounded-full h-1.5 transition-all duration-500"
                style={{ width: members.length ? `${(inactiveCount / members.length) * 100}%` : '0%' }}
              />
            </div>
          </div>
        </div>

        {/* ── MAIN TABLE CARD ── */}
        <div className="relative z-10 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">

          {/* Search bar + status filter chips + live result count */}
          <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Cari nama atau nomor HP..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all placeholder:text-slate-400"
              />
            </div>

            {/* Status filter chips — narrows the table to active / inactive / all */}
            <div className="flex items-center gap-2">
              {statusChips.map(({ key, label, icon: Icon, count }) => {
                const isActive = statusFilter === key;
                const activeClass = key === 'all' ? 'chip-active-all' : key === 'active' ? 'chip-active-active' : 'chip-active-inactive';
                return (
                  <button
                    key={key}
                    onClick={() => setStatusFilter(key)}
                    className={`chip flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg ${isActive ? activeClass : 'chip-inactive'}`}
                  >
                    <Icon size={12} strokeWidth={2.5} />
                    {label}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/20' : 'bg-slate-200/70'}`}>{count}</span>
                  </button>
                );
              })}
            </div>

            {/* Displays how many rows match the current search + filter */}
            <span className="text-xs text-slate-400 md:ml-auto">{filteredMembers.length} jemaat ditemukan</span>
          </div>

          {/* Horizontally scrollable table wrapper */}
          <div className="overflow-x-auto">
            <table className="w-full text-left">

              {/* Column headers */}
              <thead>
                <tr className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/60">
                  <th className="px-5 py-3.5">Nama</th>
                  <th className="px-5 py-3.5">Gender</th>
                  <th className="px-5 py-3.5">No. HP</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-center">Aksi</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-50">

                {/* Loading state — skeleton rows shown while API call is in progress */}
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={`skeleton-${i}`}>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="skeleton w-9 h-9 rounded-xl flex-shrink-0" />
                          <div className="skeleton h-3.5 w-32 rounded" />
                        </div>
                      </td>
                      <td className="px-5 py-3.5"><div className="skeleton h-5 w-20 rounded-lg" /></td>
                      <td className="px-5 py-3.5"><div className="skeleton h-3.5 w-24 rounded" /></td>
                      <td className="px-5 py-3.5"><div className="skeleton h-5 w-16 rounded-lg" /></td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-center gap-1.5">
                          <div className="skeleton w-7 h-7 rounded-lg" />
                          <div className="skeleton w-7 h-7 rounded-lg" />
                          <div className="skeleton w-7 h-7 rounded-lg" />
                        </div>
                      </td>
                    </tr>
                  ))

                // Empty state — shown when no members match the search/filter
                ) : filteredMembers.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-16 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                          <Users size={22} className="text-slate-400" />
                        </div>
                        <p className="text-sm font-medium text-slate-500">
                          {members.length === 0 ? 'Belum ada data jemaat' : 'Tidak ada jemaat yang cocok'}
                        </p>
                        <p className="text-xs text-slate-400">
                          {members.length === 0 ? 'Klik "Tambah Jemaat" untuk mulai menambahkan' : 'Coba ubah kata kunci atau filter status'}
                        </p>
                      </div>
                    </td>
                  </tr>

                // Data rows — one row rendered per member in the filtered list
                ) : (
                  filteredMembers.map((member) => (
                    <tr key={member.id} className="row-hover transition-colors fade-in">

                      {/* Name cell: coloured avatar + full name + optional nickname (also anchors the hover accent bar) */}
                      <td className="px-5 py-3.5 relative">
                        <div className="row-accent" />
                        <div className="flex items-center gap-3">
                          {/* Avatar circle — gradient colour is derived from the first letter of the name */}
                          <div className={`avatar-ring w-9 h-9 rounded-xl bg-gradient-to-br ${getAvatarColor(member.full_name)} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                            {getInitials(member.full_name)}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800 text-sm">{member.full_name}</p>
                            {/* Nickname shown in smaller muted text if available */}
                            {member.nickname && (
                              <p className="text-xs text-slate-400">"{member.nickname}"</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Gender cell: blue badge for male (L), pink for female (P) */}
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg ${member.gender === 'L' ? 'bg-blue-50 text-blue-600' : 'bg-pink-50 text-pink-600'}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          {member.gender === 'L' ? 'Laki-laki' : 'Perempuan'}
                        </span>
                      </td>

                      {/* Phone number — displays em dash if the field is empty */}
                      <td className="px-5 py-3.5 text-sm text-slate-600">{member.phone || '—'}</td>

                      {/* Status cell: green badge for active, grey for inactive */}
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg ${member.member_status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${member.member_status === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                          {member.member_status === 'active' ? 'Aktif' : 'Tidak Aktif'}
                        </span>
                      </td>

                      {/* Action buttons: View, Edit, Delete */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-center gap-1.5">

                          {/* View — opens read-only detail modal */}
                          <button
                            onClick={() => openViewModal(member)}
                            className="view-btn p-2 bg-indigo-50 text-indigo-500 hover:bg-indigo-100 rounded-lg transition-all"
                            title="Lihat Detail"
                          >
                            <Eye size={15} />
                          </button>

                          {/* Edit — pre-fills the form and opens the edit modal */}
                          <button
                            onClick={() => openEditModal(member)}
                            className="edit-btn p-2 bg-amber-50 text-amber-500 hover:bg-amber-100 rounded-lg transition-all"
                            title="Edit Data"
                          >
                            <Pencil size={15} />
                          </button>

                          {/* Delete — opens confirmation modal before deleting */}
                          <button
                            onClick={() => openDeleteModal(member)}
                            className="delete-btn p-2 bg-red-50 text-red-500 hover:bg-red-100 rounded-lg transition-all"
                            title="Hapus Data"
                          >
                            <Trash2 size={15} />
                          </button>

                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ============================================================
             ADD / EDIT MODAL
             Shown when isModalOpen is true.
             Renders a form that handles both create and update operations.
        ============================================================ */}
        {isModalOpen && (
          <div
            className="modal-backdrop fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setIsModalOpen(false)}
          >
            <div
              className="modal-card bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col"
              onClick={stopPropagation}
              role="dialog"
              aria-modal="true"
              aria-labelledby="member-modal-title"
            >

              {/* Modal header: dynamic title based on mode + close button */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isEditMode ? 'bg-amber-50 text-amber-500' : 'bg-indigo-50 text-indigo-500'}`}>
                    {isEditMode ? <Pencil size={18} /> : <Plus size={18} strokeWidth={2.5} />}
                  </div>
                  <div>
                    <h3 id="member-modal-title" className="font-display text-lg font-bold text-slate-800 leading-tight">
                      {isEditMode ? "Edit Data Jemaat" : "Tambah Jemaat Baru"}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {isEditMode ? "Perbarui informasi jemaat" : "Isi formulir di bawah ini"}
                    </p>
                  </div>
                </div>
                {/* Close icon — dismisses modal without saving */}
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all flex-shrink-0"
                  aria-label="Tutup"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal body: scrollable area containing the form */}
              <div className="thin-scroll overflow-y-auto flex-1 px-6 py-5">
                <form onSubmit={handleSubmit} id="memberForm" className="space-y-6">

                  {/* Section: Personal information */}
                  <div className="space-y-4">
                    <p className={sectionLabelClass}>Informasi Pribadi</p>

                    <div className="grid grid-cols-2 gap-4">

                      {/* Full name — spans both columns */}
                      <div className="col-span-2">
                        <label className={labelClass}>Nama Lengkap <span className="text-red-400 normal-case tracking-normal">*</span></label>
                        <input required type="text" name="full_name" value={formData.full_name} onChange={handleInputChange} className={inputClass} placeholder="Masukkan nama lengkap" />
                      </div>

                      {/* Nickname */}
                      <div>
                        <label className={labelClass}>Panggilan</label>
                        <input type="text" name="nickname" value={formData.nickname} onChange={handleInputChange} className={inputClass} placeholder="Nama panggilan" />
                      </div>

                      {/* Gender dropdown */}
                      <div>
                        <label className={labelClass}>Gender <span className="text-red-400 normal-case tracking-normal">*</span></label>
                        <select required name="gender" value={formData.gender} onChange={handleInputChange} className={inputClass}>
                          <option value="L">Laki-laki</option>
                          <option value="P">Perempuan</option>
                        </select>
                      </div>

                      {/* Date of birth */}
                      <div>
                        <label className={labelClass}>Tgl Lahir <span className="text-red-400 normal-case tracking-normal">*</span></label>
                        <input required type="date" name="birth_date" value={formData.birth_date} onChange={handleInputChange} className={inputClass} />
                      </div>

                      {/* Membership status dropdown */}
                      <div>
                        <label className={labelClass}>Status Keanggotaan</label>
                        <select name="member_status" value={formData.member_status} onChange={handleInputChange} className={inputClass}>
                          <option value="active">Aktif</option>
                          <option value="inactive">Tidak Aktif</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Divider between sections */}
                  <div className="border-t border-slate-100" />

                  {/* Section: Contact & address */}
                  <div className="space-y-4">
                    <p className={sectionLabelClass}>Kontak &amp; Alamat</p>

                    <div className="grid grid-cols-2 gap-4">
                      {/* Phone number */}
                      <div>
                        <label className={labelClass}>No. HP</label>
                        <input type="text" name="phone" value={formData.phone} onChange={handleInputChange} className={inputClass} placeholder="08xxxxxxxxxx" />
                      </div>

                      {/* Email address */}
                      <div>
                        <label className={labelClass}>Email</label>
                        <input type="email" name="email" value={formData.email} onChange={handleInputChange} className={inputClass} placeholder="email@contoh.com" />
                      </div>
                    </div>

                    {/* Full home address — multi-line textarea */}
                    <div>
                      <label className={labelClass}>Alamat Lengkap <span className="text-red-400 normal-case tracking-normal">*</span></label>
                      <textarea required name="address" rows="3" value={formData.address} onChange={handleInputChange} className={`${inputClass} resize-none`} placeholder="Masukkan alamat domisili..." />
                    </div>
                  </div>

                </form>
              </div>

              {/* Modal footer: Cancel + Submit action buttons */}
              <div className="flex justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex-shrink-0">
                {/* Cancel — closes modal without saving any changes */}
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSaving}
                  className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all disabled:opacity-50"
                >
                  Batal
                </button>
                {/* Submit — triggers form validation then calls handleSubmit */}
                <button
                  type="submit"
                  form="memberForm"
                  disabled={isSaving}
                  className="btn-primary flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-xl transition-all shadow-md min-w-[9.5rem]"
                >
                  {isSaving ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      Menyimpan...
                    </>
                  ) : (
                    isEditMode ? "Simpan Perubahan" : "Simpan Data"
                  )}
                </button>
              </div>

            </div>
          </div>
        )}

        {/* ============================================================
             VIEW DETAIL MODAL
             Read-only modal displaying the full profile of a selected member.
             Shown when isViewModalOpen is true and selectedMember is set.
        ============================================================ */}
        {isViewModalOpen && selectedMember && (
          <div
            className="modal-backdrop fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setIsViewModalOpen(false)}
          >
            <div
              className="modal-card bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col"
              onClick={stopPropagation}
              role="dialog"
              aria-modal="true"
              aria-labelledby="view-modal-title"
            >

              {/* Profile header: gradient background with avatar, name, nickname, and status */}
              <div className="relative bg-gradient-to-br from-indigo-500 via-violet-600 to-purple-700 p-8 text-white flex-shrink-0 overflow-hidden">
                {/* Decorative blurred blobs for depth */}
                <div className="blob w-32 h-32 bg-white/10 -top-10 -right-10" />
                <div className="blob w-24 h-24 bg-white/10 bottom-0 -left-6" />

                {/* Close button — top-right corner */}
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="absolute top-4 right-4 p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all"
                  aria-label="Tutup"
                >
                  <X size={18} />
                </button>

                {/* Large avatar showing member initials */}
                <div className={`relative avatar-ring w-16 h-16 rounded-2xl bg-gradient-to-br ${getAvatarColor(selectedMember.full_name)} shadow-xl flex items-center justify-center text-white text-2xl font-extrabold mb-4 border-2 border-white/30`}>
                  {getInitials(selectedMember.full_name)}
                </div>

                {/* Full name */}
                <h3 id="view-modal-title" className="relative font-display text-xl font-bold leading-tight pr-8">{selectedMember.full_name}</h3>

                {/* Nickname (optional) and gender label */}
                <p className="relative text-indigo-200 text-sm mt-1 flex items-center gap-2">
                  {selectedMember.nickname && <span>"{selectedMember.nickname}"</span>}
                  {selectedMember.nickname && <span className="text-indigo-300">•</span>}
                  <span>{selectedMember.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</span>
                </p>

                {/* Membership status pill */}
                <span className={`relative mt-3 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full ${selectedMember.member_status === 'active' ? 'bg-emerald-400/20 text-emerald-200' : 'bg-white/10 text-white/60'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${selectedMember.member_status === 'active' ? 'bg-emerald-400' : 'bg-white/50'}`} />
                  {selectedMember.member_status === 'active' ? 'Aktif' : 'Tidak Aktif'}
                </span>
              </div>

              <div className="thin-scroll p-6 space-y-4 overflow-y-auto">

                {/* Detail info fields */}
                <div className="space-y-4">

                  {/* Row: birth date + phone number side by side */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 rounded-xl p-4">
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                        <Calendar size={12} /> Tanggal Lahir
                      </p>
                      <p className="text-sm font-semibold text-slate-700">{formatDate(selectedMember.birth_date)}</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-4">
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                        <Phone size={12} /> No. Handphone
                      </p>
                      <p className="text-sm font-semibold text-slate-700">{selectedMember.phone || '—'}</p>
                    </div>
                  </div>

                  {/* Email — break-words handles long email addresses gracefully */}
                  <div className="bg-slate-50 rounded-xl p-4">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                      <Mail size={12} /> Email
                    </p>
                    <p className="text-sm font-semibold text-slate-700 break-words">{selectedMember.email || '—'}</p>
                  </div>

                  {/* Full address */}
                  <div className="bg-slate-50 rounded-xl p-4">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                      <MapPin size={12} /> Alamat Domisili
                    </p>
                    <p className="text-sm font-medium text-slate-700 leading-relaxed">{selectedMember.address || 'Alamat belum diisi.'}</p>
                  </div>
                </div>

                {/* Photo Gallery Section */}
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Galeri Foto Wajah</p>

                  {isPhotosLoading ? (
                    <div className="flex justify-center items-center h-24">
                      <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
                    </div>
                  ) : photos.length > 0 ? (
                    <div>
                      <div className="grid grid-cols-3 gap-2">
                        {photos.map(photo => (
                          <img
                            key={photo.id}
                            src={`data:image/jpeg;base64,${photo.face_image_base64}`}
                            alt={`Face enrollment ${photo.id}`}
                            className="photo-thumb w-full h-full object-cover rounded-md aspect-square bg-slate-200"
                          />
                        ))}
                      </div>
                      {/* Pagination for photos */}
                      {photoPagination && photoPagination.count > 6 && (
                        <div className="mt-4 flex justify-between items-center">
                          <button
                            onClick={handlePhotoPrevPage}
                            disabled={!photoPagination.previous}
                            className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-all flex items-center gap-1"
                          >
                            <ChevronLeft size={14}/>
                            Prev
                          </button>
                          <span className="text-xs text-slate-500">
                            Page {photoPage} of {photoPagination.totalPages}
                          </span>
                          <button
                            onClick={handlePhotoNextPage}
                            disabled={!photoPagination.next}
                            className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-all flex items-center gap-1"
                          >
                            Next
                            <ChevronRight size={14}/>
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-24 text-center bg-slate-100 rounded-lg">
                       <ImageOff size={20} className="text-slate-400 mb-1" />
                       <p className="text-xs font-medium text-slate-500">Tidak ada foto terdaftar</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer: single full-width close button */}
              <div className="px-6 pb-6 pt-2 flex-shrink-0">
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-all"
                >
                  Tutup
                </button>
              </div>

            </div>
          </div>
        )}

        {/* ============================================================
             DELETE CONFIRMATION MODAL
             Shown when isDeleteModalOpen is true.
        ============================================================ */}
        {isDeleteModalOpen && deletingMember && (
          <div
            className="modal-backdrop fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setIsDeleteModalOpen(false)}
          >
            <div
              className="modal-card bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
              onClick={stopPropagation}
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-modal-title"
            >

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle size={18} className="text-red-500" />
                  </div>
                  <div>
                    <h3 id="delete-modal-title" className="font-display text-base font-bold text-slate-800">Hapus Jemaat</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Tindakan ini tidak dapat dibatalkan</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all flex-shrink-0"
                  aria-label="Tutup"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Member preview */}
              <div className="relative bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 p-6 text-white overflow-hidden">
                <div className="blob w-24 h-24 bg-white/5 -top-8 -right-8" />
                <div className={`relative avatar-ring w-12 h-12 rounded-xl bg-gradient-to-br ${getAvatarColor(deletingMember.full_name)} shadow-lg flex items-center justify-center text-white text-base font-extrabold mb-3 border-2 border-white/30`}>
                  {getInitials(deletingMember.full_name)}
                </div>
                <h4 className="relative font-display text-base font-bold leading-tight">{deletingMember.full_name}</h4>
                <p className="relative text-slate-300 text-xs mt-1 flex items-center gap-2">
                  {deletingMember.nickname && <span>"{deletingMember.nickname}"</span>}
                  {deletingMember.nickname && <span className="text-slate-400">•</span>}
                  <span>{deletingMember.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</span>
                </p>
                <span className={`relative mt-2 inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${deletingMember.member_status === 'active' ? 'bg-emerald-400/20 text-emerald-200' : 'bg-white/10 text-white/60'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${deletingMember.member_status === 'active' ? 'bg-emerald-400' : 'bg-white/50'}`} />
                  {deletingMember.member_status === 'active' ? 'Aktif' : 'Tidak Aktif'}
                </span>
              </div>

              {/* Detail fields */}
              <div className="px-6 py-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">
                      <Calendar size={11} /> Tgl Lahir
                    </p>
                    <p className="text-sm font-semibold text-slate-700">{formatDate(deletingMember.birth_date)}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">
                      <Phone size={11} /> No. HP
                    </p>
                    <p className="text-sm font-semibold text-slate-700">{deletingMember.phone || '—'}</p>
                  </div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">
                    <Mail size={11} /> Email
                  </p>
                  <p className="text-sm font-semibold text-slate-700 break-words">{deletingMember.email || '—'}</p>
                </div>
                <p className="flex items-center justify-center gap-1.5 text-xs text-slate-500 text-center pt-1">
                  <UserRound size={12} className="text-slate-400" />
                  Data yang dihapus tidak dapat dikembalikan.
                </p>
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl">
                <button
                  type="button"
                  onClick={() => setIsDeleteModalOpen(false)}
                  disabled={isDeleting}
                  className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-xl transition-all shadow-md disabled:opacity-70 min-w-[7rem]"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      Menghapus...
                    </>
                  ) : (
                    "Hapus"
                  )}
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </>
  );
}