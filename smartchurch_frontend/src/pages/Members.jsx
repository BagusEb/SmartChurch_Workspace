// ============================================================
//  Members.jsx
//  Component for managing church member (Jemaat) data.
//  Features: list, search, add, edit, delete, and view detail.
// ============================================================

// ── Core React hooks
import { useState, useEffect } from 'react';
import { getAllMembers, createMember, updateMember, deleteMember } from '../service/apiClient';

import { Pencil, Trash2, Plus, Eye, X, Users, Search } from 'lucide-react';

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

  // Controls visibility of the Add / Edit modal
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Toggles the modal between "add new" and "edit existing" mode
  const [isEditMode, setIsEditMode] = useState(false);

  // Holds the ID of the member currently being edited
  const [editingId, setEditingId] = useState(null);

  // Controls visibility of the View Detail modal
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);

  // Holds the member object selected for detail view
  const [selectedMember, setSelectedMember] = useState(null);

  // Controls visibility of the Delete Confirmation modal
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Holds the member targeted for deletion
  const [deletingMember, setDeletingMember] = useState(null);

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
    setIsViewModalOpen(true);
  };

  // Submits the form — sends PUT for edit mode, POST for add mode
const handleSubmit = async (e) => {
    e.preventDefault();
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
    }
  };

  // Opens the delete confirmation modal for the given member
  const openDeleteModal = (member) => {
    setDeletingMember(member);
    setIsDeleteModalOpen(true);
  };

  // Sends DELETE request after confirmation in the modal
  const handleDelete = async () => {
    try {
      await deleteMember(deletingMember.id);
      setIsDeleteModalOpen(false);
      setDeletingMember(null);
      fetchMembers();
    } catch (error) {
      console.error("Failed to delete member:", error);
      alert("Failed to delete member.");
    }
  };

  // ============================================================
  //  DERIVED DATA
  // ============================================================

  // Filters members by name or phone number based on the search query
  const filteredMembers = members.filter(m =>
    m.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (m.phone && m.phone.includes(searchQuery))
  );

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

  // ============================================================
  //  REUSABLE STYLE CONSTANTS
  // ============================================================

  // Shared Tailwind classes for all form input / select / textarea elements
  const inputClass = "w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 focus:outline-none bg-slate-50 focus:bg-white transition-all placeholder:text-slate-400";

  // Shared Tailwind classes for all form labels
  const labelClass = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5";

  // ============================================================
  //  RENDER
  // ============================================================
  return (
    <>
      {/* ── Global styles: custom font, animations, and utility classes ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

        /* Apply custom font to the entire component */
        .members-root { font-family: 'Plus Jakarta Sans', sans-serif; }

        /* Fade-in animation for newly rendered table rows */
        .fade-in { animation: fadeIn 0.3s ease; }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* Subtle left-to-right highlight on table row hover */
        .row-hover:hover { background: linear-gradient(90deg, #f8f7ff 0%, #ffffff 100%); }

        /* Primary gradient button — default and hover states */
        .btn-primary { background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); }
        .btn-primary:hover {
          background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%);
          box-shadow: 0 4px 15px rgba(99,102,241,0.4);
        }

        /* Modal backdrop fade-in */
        .modal-backdrop { animation: backdropIn 0.2s ease; }
        @keyframes backdropIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        /* Modal card spring-in animation */
        .modal-card { animation: modalIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1); }
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.92) translateY(20px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);    }
        }

        /* Coloured ring glow on action button hover */
        .delete-btn:hover { box-shadow: 0 0 0 3px rgba(239,68,68,0.15);  }
        .edit-btn:hover   { box-shadow: 0 0 0 3px rgba(234,179,8,0.15);  }
        .view-btn:hover   { box-shadow: 0 0 0 3px rgba(99,102,241,0.15); }
      `}</style>

      <div className="members-root">

        {/* ── PAGE HEADER: title + "Add Member" button ── */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight">Data Jemaat</h2>
            <p className="text-sm text-slate-500 mt-0.5">Kelola seluruh data anggota jemaat</p>
          </div>

          {/* Button opens the blank Add New Member form */}
          <button
            onClick={openAddModal}
            className="btn-primary flex items-center gap-2 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-md"
          >
            <Plus size={16} strokeWidth={2.5} />
            Tambah Jemaat
          </button>
        </div>

        {/* ── STAT CARDS: total / active / inactive summary ── */}
        <div className="grid grid-cols-3 gap-4 mb-6">

          {/* Total members card */}
          <div className="bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl p-4 text-white shadow-lg shadow-indigo-200">
            <p className="text-indigo-200 text-xs font-semibold uppercase tracking-wide">Total Jemaat</p>
            <p className="text-3xl font-extrabold mt-1">{members.length}</p>
            <div className="mt-2 flex items-center gap-1.5">
              <Users size={13} className="text-indigo-300" />
              <span className="text-indigo-200 text-xs">Terdaftar</span>
            </div>
          </div>

          {/* Active members card with progress bar */}
          <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-4 text-white shadow-lg shadow-emerald-200">
            <p className="text-emerald-200 text-xs font-semibold uppercase tracking-wide">Aktif</p>
            <p className="text-3xl font-extrabold mt-1">{activeCount}</p>
            {/* Progress bar showing active ratio out of total */}
            <div className="mt-2 w-full bg-emerald-400/40 rounded-full h-1.5">
              <div
                className="bg-white rounded-full h-1.5 transition-all"
                style={{ width: members.length ? `${(activeCount / members.length) * 100}%` : '0%' }}
              />
            </div>
          </div>

          {/* Inactive members card with progress bar */}
          <div className="bg-gradient-to-br from-slate-500 to-slate-700 rounded-2xl p-4 text-white shadow-lg shadow-slate-200">
            <p className="text-slate-300 text-xs font-semibold uppercase tracking-wide">Tidak Aktif</p>
            <p className="text-3xl font-extrabold mt-1">{inactiveCount}</p>
            {/* Progress bar showing inactive ratio out of total */}
            <div className="mt-2 w-full bg-slate-400/40 rounded-full h-1.5">
              <div
                className="bg-white rounded-full h-1.5 transition-all"
                style={{ width: members.length ? `${(inactiveCount / members.length) * 100}%` : '0%' }}
              />
            </div>
          </div>
        </div>

        {/* ── MAIN TABLE CARD ── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">

          {/* Search bar + live result count */}
          <div className="p-4 border-b border-slate-100 flex items-center gap-3">
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
            {/* Displays how many rows match the current search query */}
            <span className="text-xs text-slate-400 ml-auto">{filteredMembers.length} jemaat ditemukan</span>
          </div>

          {/* Horizontally scrollable table wrapper */}
          <div className="overflow-x-auto">
            <table className="w-full text-left">

              {/* Column headers */}
              <thead>
                <tr className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <th className="px-5 py-3.5">Nama</th>
                  <th className="px-5 py-3.5">Gender</th>
                  <th className="px-5 py-3.5">No. HP</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-center">Aksi</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-50">

                {/* Loading state — spinner shown while API call is in progress */}
                {isLoading ? (
                  <tr>
                    <td colSpan="5" className="py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
                        <span className="text-sm text-slate-400">Memuat data...</span>
                      </div>
                    </td>
                  </tr>

                // Empty state — shown when no members match the search query
                ) : filteredMembers.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-16 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                          <Users size={22} className="text-slate-400" />
                        </div>
                        <p className="text-sm font-medium text-slate-500">Belum ada data jemaat</p>
                        <p className="text-xs text-slate-400">Klik "Tambah Jemaat" untuk mulai menambahkan</p>
                      </div>
                    </td>
                  </tr>

                // Data rows — one row rendered per member in the filtered list
                ) : (
                  filteredMembers.map((member) => (
                    <tr key={member.id} className="row-hover transition-colors fade-in">

                      {/* Name cell: coloured avatar + full name + optional nickname */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          {/* Avatar circle — gradient colour is derived from the first letter of the name */}
                          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${getAvatarColor(member.full_name)} flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm`}>
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
                          <span className={`w-1.5 h-1.5 rounded-full ${member.member_status === 'active' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
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
          <div className="modal-backdrop fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="modal-card bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">

              {/* Modal header: dynamic title based on mode + close button */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">
                    {isEditMode ? "Edit Data Jemaat" : "Tambah Jemaat Baru"}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {isEditMode ? "Perbarui informasi jemaat" : "Isi formulir di bawah ini"}
                  </p>
                </div>
                {/* Close icon — dismisses modal without saving */}
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal body: scrollable area containing the form */}
              <div className="overflow-y-auto flex-1 px-6 py-5">
                <form onSubmit={handleSubmit} id="memberForm" className="space-y-4">

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

                    {/* Phone number */}
                    <div>
                      <label className={labelClass}>No. HP</label>
                      <input type="text" name="phone" value={formData.phone} onChange={handleInputChange} className={inputClass} placeholder="08xxxxxxxxxx" />
                    </div>
                  </div>

                  {/* Email address */}
                  <div>
                    <label className={labelClass}>Email</label>
                    <input type="email" name="email" value={formData.email} onChange={handleInputChange} className={inputClass} placeholder="email@contoh.com" />
                  </div>

                  {/* Full home address — multi-line textarea */}
                  <div>
                    <label className={labelClass}>Alamat Lengkap <span className="text-red-400 normal-case tracking-normal">*</span></label>
                    <textarea required name="address" rows="3" value={formData.address} onChange={handleInputChange} className={`${inputClass} resize-none`} placeholder="Masukkan alamat domisili..." />
                  </div>

                  {/* Membership status dropdown */}
                  <div>
                    <label className={labelClass}>Status Keanggotaan</label>
                    <select name="member_status" value={formData.member_status} onChange={handleInputChange} className={inputClass}>
                      <option value="active">Aktif</option>
                      <option value="inactive">Tidak Aktif</option>
                    </select>
                  </div>

                </form>
              </div>

              {/* Modal footer: Cancel + Submit action buttons */}
              <div className="flex justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl">
                {/* Cancel — closes modal without saving any changes */}
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                >
                  Batal
                </button>
                {/* Submit — triggers form validation then calls handleSubmit */}
                <button
                  type="submit"
                  form="memberForm"
                  className="btn-primary px-5 py-2.5 text-sm font-semibold text-white rounded-xl transition-all shadow-md"
                >
                  {isEditMode ? "Simpan Perubahan" : "Simpan Data"}
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
          <div className="modal-backdrop fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="modal-card bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

              {/* Profile header: gradient background with avatar, name, nickname, and status */}
              <div className="relative bg-gradient-to-br from-indigo-500 via-violet-600 to-purple-700 p-8 text-white">

                {/* Close button — top-right corner */}
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="absolute top-4 right-4 p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all"
                >
                  <X size={18} />
                </button>

                {/* Large avatar showing member initials */}
                <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${getAvatarColor(selectedMember.full_name)} shadow-xl flex items-center justify-center text-white text-2xl font-extrabold mb-4 border-2 border-white/30`}>
                  {getInitials(selectedMember.full_name)}
                </div>

                {/* Full name */}
                <h3 className="text-xl font-extrabold leading-tight">{selectedMember.full_name}</h3>

                {/* Nickname (optional) and gender label */}
                <p className="text-indigo-200 text-sm mt-1 flex items-center gap-2">
                  {selectedMember.nickname && <span>"{selectedMember.nickname}"</span>}
                  {selectedMember.nickname && <span className="text-indigo-300">•</span>}
                  <span>{selectedMember.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</span>
                </p>

                {/* Membership status pill */}
                <span className={`mt-3 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full ${selectedMember.member_status === 'active' ? 'bg-emerald-400/20 text-emerald-200' : 'bg-white/10 text-white/60'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${selectedMember.member_status === 'active' ? 'bg-emerald-400' : 'bg-white/50'}`} />
                  {selectedMember.member_status === 'active' ? 'Aktif' : 'Tidak Aktif'}
                </span>
              </div>

              {/* Detail info fields */}
              <div className="p-6 space-y-4">

                {/* Row: birth date + phone number side by side */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 rounded-xl p-4">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Tanggal Lahir</p>
                    <p className="text-sm font-semibold text-slate-700">{selectedMember.birth_date || '—'}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">No. Handphone</p>
                    <p className="text-sm font-semibold text-slate-700">{selectedMember.phone || '—'}</p>
                  </div>
                </div>

                {/* Email — break-words handles long email addresses gracefully */}
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Email</p>
                  <p className="text-sm font-semibold text-slate-700 break-words">{selectedMember.email || '—'}</p>
                </div>

                {/* Full address */}
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Alamat Domisili</p>
                  <p className="text-sm font-medium text-slate-700 leading-relaxed">{selectedMember.address || 'Alamat belum diisi.'}</p>
                </div>
              </div>

              {/* Footer: single full-width close button */}
              <div className="px-6 pb-6">
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
          <div className="modal-backdrop fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="modal-card bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                    <Trash2 size={18} className="text-red-500" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-800">Hapus Jemaat</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Tindakan ini tidak dapat dibatalkan</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Member preview */}
              <div className="relative bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 p-6 text-white">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${getAvatarColor(deletingMember.full_name)} shadow-lg flex items-center justify-center text-white text-base font-extrabold mb-3 border-2 border-white/30`}>
                  {getInitials(deletingMember.full_name)}
                </div>
                <h4 className="text-base font-extrabold leading-tight">{deletingMember.full_name}</h4>
                <p className="text-slate-300 text-xs mt-1 flex items-center gap-2">
                  {deletingMember.nickname && <span>"{deletingMember.nickname}"</span>}
                  {deletingMember.nickname && <span className="text-slate-400">•</span>}
                  <span>{deletingMember.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</span>
                </p>
                <span className={`mt-2 inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${deletingMember.member_status === 'active' ? 'bg-emerald-400/20 text-emerald-200' : 'bg-white/10 text-white/60'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${deletingMember.member_status === 'active' ? 'bg-emerald-400' : 'bg-white/50'}`} />
                  {deletingMember.member_status === 'active' ? 'Aktif' : 'Tidak Aktif'}
                </span>
              </div>

              {/* Detail fields */}
              <div className="px-6 py-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Tgl Lahir</p>
                    <p className="text-sm font-semibold text-slate-700">{deletingMember.birth_date || '—'}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">No. HP</p>
                    <p className="text-sm font-semibold text-slate-700">{deletingMember.phone || '—'}</p>
                  </div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Email</p>
                  <p className="text-sm font-semibold text-slate-700 break-words">{deletingMember.email || '—'}</p>
                </div>
                <p className="text-xs text-slate-500 text-center pt-1">Data yang dihapus tidak dapat dikembalikan.</p>
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl">
                <button
                  type="button"
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-xl transition-all shadow-md"
                >
                  Hapus
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </>
  );
}