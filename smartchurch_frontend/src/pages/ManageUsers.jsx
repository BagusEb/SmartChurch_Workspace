// ============================================================
//  ManageUsers.jsx  (v2 — with email, first_name, last_name)
//  User access management page — create, edit, delete system
//  accounts and assign roles (Admin / Church Leader).
//  All API logic is preserved; only the visual layer is enhanced.
// ============================================================

// ── React hooks
import { useState, useEffect } from 'react';
import { getAllUsers, createUser, updateUser, deleteUser } from '../service/apiClient';
// ── Icon set from Lucide
import {
  UserPlus, Edit, Trash2, Shield, UserX,
  CheckCircle, X, Mail, Signature,
  Users, ShieldCheck, Loader2, AtSign, KeyRound,
} from 'lucide-react';

export default function ManageUsers() {

  // ── Full list of system users fetched from the API
  const [users, setUsers] = useState([]);

  // ── Controls visibility of the Add / Edit modal
  const [isModalOpen, setIsModalOpen] = useState(false);

  // ── ID of the user currently being edited (null = add mode)
  const [editingId, setEditingId] = useState(null);

  // ── Loading state — disables submit button while request is in flight
  const [isLoading, setIsLoading] = useState(false);

  // ── Controls visibility of the Delete Confirmation modal
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // ── Holds the user targeted for deletion
  const [deletingUser, setDeletingUser] = useState(null);

  // ── Default blank form state (reset on "add new")
  const initialFormState = {
    username:   '',
    email:      '',
    first_name: '',
    last_name:  '',
    password:   '',
    role:       'leader',
    is_active:  true,
  };

  // ── Form field values — mirrors the API payload structure
  const [formData, setFormData] = useState(initialFormState);

  // ============================================================
  //  API FUNCTIONS
  // ============================================================

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const data = await getAllUsers(); 
      setUsers(data); 
    } catch (error) {
      console.error("Gagal mengambil data user:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch users once on component mount
  useEffect(() => {
    fetchUsers();
  }, []);

  // ============================================================
  //  MODAL HANDLERS
  // ============================================================

  // Opens the modal — pre-fills with existing data if editing, resets if adding
  const openModal = (user = null) => {
    if (user) {
      setEditingId(user.id);
      setFormData({
        username:   user.username,
        email:      user.email      || '',
        first_name: user.first_name || '',
        last_name:  user.last_name  || '',
        password:   '', // Always blank on edit — only send if user types a new one
        role:       user.role || 'leader',
        is_active:  user.is_active,
      });
    } else {
      setEditingId(null);
      setFormData(initialFormState); // Reset to empty form
    }
    setIsModalOpen(true);
  };

  // Closes the modal and clears the editing ID
  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
  };

  // ============================================================
  //  FORM CHANGE HANDLERS
  // ============================================================

  // Generic text/email/password input handler — updates by field name
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  // Select/dropdown handler — converts is_active string back to boolean
  const handleSelectChange = (name, value) => {
    setFormData({
      ...formData,
      [name]: name === 'is_active' ? value === 'true' : value,
    });
  };

  // ============================================================
  //  FORM SUBMIT — CREATE or UPDATE
  // ============================================================

  // Sends POST (create) or PUT (update) depending on mode
const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      // If editing and password is blank, omit it from the payload
      const dataToSend = { ...formData };
      if (editingId && !dataToSend.password) {
        delete dataToSend.password;
      }

      if (editingId) {
        // Update existing user record (Tanpa perlu nulis URL dan Token manual!)
        await updateUser(editingId, dataToSend);
      } else {
        // Create a new user record (Tanpa perlu nulis URL dan Token manual!)
        await createUser(dataToSend);
      }

      closeModal();
      fetchUsers(); // Refresh the table after save
    } catch (error) {
      alert("Failed to save! Username might already be taken or data is invalid.");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================================
  //  DELETE USER
  // ============================================================

  // Opens the delete confirmation modal for the given user
  const openDeleteModal = (user) => {
    setDeletingUser(user);
    setIsDeleteModalOpen(true);
  };

  // Sends DELETE request after confirmation in the modal
  const handleDelete = async () => {
    try {
      await deleteUser(deletingUser.id);
      setIsDeleteModalOpen(false);
      setDeletingUser(null);
      fetchUsers();
    } catch (error) {
      alert("Failed to delete user.");
      console.error(error);
    }
  };
  
  // ============================================================
  //  DERIVED STATS
  // ============================================================

  const adminCount  = users.filter(u => u.role === 'admin').length;
  const activeCount = users.filter(u => u.is_active).length;

  // Generates a gradient color class for the avatar based on role
  const avatarGradient = (role) =>
    role === 'admin'
      ? 'from-indigo-500 to-violet-600'
      : 'from-emerald-500 to-teal-600';

  // Builds the display name from first + last name, falls back to username
  const displayName = (u) =>
    [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username;

  // ============================================================
  //  REUSABLE STYLE CONSTANTS
  // ============================================================

  // Shared classes for all form input / select elements
  const inputBase = "w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 focus:outline-none bg-slate-50 focus:bg-white transition-all placeholder:text-slate-400";

  // Input with left icon padding
  const inputWithIcon = `${inputBase} pl-9`;

  // Shared label classes
  const labelClass = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5";

  // ============================================================
  //  RENDER
  // ============================================================
  return (
    <>
      {/* ── Global styles: custom font + animations ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

        /* Apply font across the whole component */
        .mu-root { font-family: 'Plus Jakarta Sans', sans-serif; }

        /* Staggered fade-in for table rows */
        .mu-row { animation: muFade 0.35s ease both; }
        @keyframes muFade {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* Subtle left sweep on row hover */
        .mu-row:hover { background: linear-gradient(90deg, #f5f3ff 0%, #ffffff 100%); }

        /* Primary gradient button */
        .btn-indigo { background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); transition: all 0.2s ease; }
        .btn-indigo:hover:not(:disabled) {
          background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%);
          box-shadow: 0 4px 16px rgba(99,102,241,0.45);
          transform: translateY(-1px);
        }
        .btn-indigo:disabled { opacity: 0.55; cursor: not-allowed; }

        /* Modal backdrop + card spring animation */
        .mu-backdrop { animation: muBD 0.2s ease; }
        @keyframes muBD { from { opacity: 0; } to { opacity: 1; } }
        .mu-modal { animation: muMod 0.28s cubic-bezier(0.34,1.56,0.64,1); }
        @keyframes muMod {
          from { opacity: 0; transform: scale(0.92) translateY(24px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }

        /* Action button glow rings */
        .edit-btn:hover   { box-shadow: 0 0 0 3px rgba(245,158,11,0.18); }
        .delete-btn:hover { box-shadow: 0 0 0 3px rgba(239,68,68,0.15); }

        /* Spinner */
        .spin { animation: spin 0.85s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Divider dashes between form sections */
        .form-divider {
          border: none;
          border-top: 1px dashed #e2e8f0;
          margin: 4px 0;
        }
      `}</style>

      <div className="mu-root flex flex-col gap-5">

        {/* ── PAGE HEADER: title + add button ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Page icon with indigo glow */}
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                boxShadow: '0 4px 16px rgba(99,102,241,0.38)',
              }}
            >
              <Shield size={22} className="text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight">Manajemen Hak Akses</h2>
              <p className="text-slate-500 text-sm mt-0.5">Tambah, edit, atau nonaktifkan akun pengguna sistem</p>
            </div>
          </div>

          {/* Add new account button */}
          <button
            onClick={() => openModal()}
            className="btn-indigo flex items-center gap-2 text-white px-5 py-2.5 rounded-xl font-semibold text-sm shadow-md"
          >
            <UserPlus size={16} strokeWidth={2.5} />
            Tambah Akun Baru
          </button>
        </div>

        {/* ── STAT CARDS ── */}
        <div className="grid grid-cols-3 gap-4">

          {/* Total accounts */}
          <div
            className="rounded-2xl p-4 text-white"
            style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 4px 18px rgba(99,102,241,0.28)' }}
          >
            <p className="text-indigo-200 text-xs font-semibold uppercase tracking-wide">Total Akun</p>
            <p className="text-3xl font-extrabold mt-1">{users.length}</p>
            <div className="mt-2 flex items-center gap-1.5">
              <Users size={13} className="text-indigo-300" />
              <span className="text-indigo-200 text-xs">Terdaftar</span>
            </div>
          </div>

          {/* Active accounts with progress bar */}
          <div
            className="rounded-2xl p-4 text-white"
            style={{ background: 'linear-gradient(135deg,#10b981,#059669)', boxShadow: '0 4px 18px rgba(16,185,129,0.28)' }}
          >
            <p className="text-emerald-200 text-xs font-semibold uppercase tracking-wide">Akun Aktif</p>
            <p className="text-3xl font-extrabold mt-1">{activeCount}</p>
            {/* Progress bar showing active ratio */}
            <div className="mt-2 w-full bg-emerald-400/40 rounded-full h-1.5">
              <div
                className="bg-white rounded-full h-1.5 transition-all"
                style={{ width: users.length ? `${(activeCount / users.length) * 100}%` : '0%' }}
              />
            </div>
          </div>

          {/* Admin role count */}
          <div
            className="rounded-2xl p-4 text-white"
            style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', boxShadow: '0 4px 18px rgba(245,158,11,0.28)' }}
          >
            <p className="text-amber-200 text-xs font-semibold uppercase tracking-wide">Admin</p>
            <p className="text-3xl font-extrabold mt-1">{adminCount}</p>
            <div className="mt-2 flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-amber-200" />
              <span className="text-amber-200 text-xs">Full access</span>
            </div>
          </div>
        </div>

        {/* ── MAIN TABLE CARD ── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">

          {/* Table toolbar */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-600">Daftar Pengguna Sistem</p>
            <span className="text-xs text-slate-400">{users.length} akun terdaftar</span>
          </div>

          {/* Horizontally scrollable table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[680px]">

              {/* Column headers */}
              <thead>
                <tr className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <th className="px-5 py-3.5">Nama Lengkap</th>
                  <th className="px-5 py-3.5">Username / Email</th>
                  <th className="px-5 py-3.5">Role</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-center">Aksi</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-50">

                {/* Empty state — no users yet */}
                {users.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-16 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                          <Users size={22} className="text-slate-400" />
                        </div>
                        <p className="text-sm font-medium text-slate-500">Belum ada akun pengguna</p>
                        <p className="text-xs text-slate-400">Klik "Tambah Akun Baru" untuk memulai</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  // One row per user — staggered fade-in via CSS delay
                  users.map((u, i) => (
                    <tr
                      key={u.id}
                      className="mu-row transition-colors"
                      style={{ animationDelay: `${i * 0.05}s` }}
                    >
                      {/* Name cell: coloured avatar + full name + user ID */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          {/* Avatar — colour matches role */}
                          <div
                            className={`w-10 h-10 rounded-xl bg-gradient-to-br ${avatarGradient(u.role)} flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-sm`}
                          >
                            {(u.first_name || u.username).charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800 text-sm">{displayName(u)}</p>
                            <p className="text-xs text-slate-400">ID #{u.id}</p>
                          </div>
                        </div>
                      </td>

                      {/* Username + email cell */}
                      <td className="px-5 py-4">
                        {/* Username shown in monospace pill */}
                        <span className="inline-block font-mono text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-lg">
                          {u.username}
                        </span>
                        <p className="text-xs text-slate-400 mt-1">{u.email || '—'}</p>
                      </td>

                      {/* Role badge — indigo for admin, emerald for leader */}
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg ${
                            u.role === 'admin'
                              ? 'bg-indigo-50 text-indigo-700'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          <Shield size={11} />
                          {u.role === 'admin' ? 'Admin / Committee' : 'Church Leader'}
                        </span>
                      </td>

                      {/* Status pill with animated dot */}
                      <td className="px-5 py-4">
                        {u.is_active ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Aktif
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            Nonaktif
                          </span>
                        )}
                      </td>

                      {/* Edit + Delete action buttons */}
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-center gap-1.5">

                          {/* Edit — opens pre-filled modal */}
                          <button
                            onClick={() => openModal(u)}
                            className="edit-btn p-2 bg-amber-50 text-amber-500 hover:bg-amber-100 rounded-lg transition-all"
                            title="Edit Akun"
                          >
                            <Edit size={15} />
                          </button>

                          {/* Delete — opens confirmation modal before removing */}
                          <button
                            onClick={() => openDeleteModal(u)}
                            className="delete-btn p-2 bg-red-50 text-red-500 hover:bg-red-100 rounded-lg transition-all"
                            title="Hapus Permanen"
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
             Handles both create and update operations via one form.
        ============================================================ */}
        {isModalOpen && (
          <div className="mu-backdrop fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="mu-modal bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh]">

              {/* Modal header: gradient + dynamic title + close button */}
              <div
                className="px-6 py-5 flex items-center justify-between flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                    <Shield size={16} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-base">
                      {editingId ? 'Edit Akun Pengguna' : 'Buat Akun Akses Baru'}
                    </h3>
                    <p className="text-indigo-200 text-xs mt-0.5">
                      {editingId ? 'Perbarui data akun' : 'Isi semua field di bawah ini'}
                    </p>
                  </div>
                </div>
                {/* Close button */}
                <button
                  onClick={closeModal}
                  className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Scrollable form body */}
              <div className="overflow-y-auto flex-1 px-6 py-5">
                <form onSubmit={handleSubmit} id="userForm" className="space-y-4">

                  {/* ── SECTION: Personal info ── */}
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Informasi Pribadi</p>

                  {/* Row: First name + Last name */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Nama Depan</label>
                      <div className="relative">
                        <Signature size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          required
                          name="first_name"
                          type="text"
                          value={formData.first_name}
                          onChange={handleInputChange}
                          className={inputWithIcon}
                          placeholder="Misal: Bagus"
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Nama Belakang</label>
                      <input
                        required
                        name="last_name"
                        type="text"
                        value={formData.last_name}
                        onChange={handleInputChange}
                        className={inputBase}
                        placeholder="Misal: EB"
                      />
                    </div>
                  </div>

                  {/* Email field */}
                  <div>
                    <label className={labelClass}>Alamat Email Resmi</label>
                    <div className="relative">
                      <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        required
                        name="email"
                        type="email"
                        value={formData.email}
                        onChange={handleInputChange}
                        className={inputWithIcon}
                        placeholder="beb@gmail.com"
                      />
                    </div>
                  </div>

                  {/* Divider between personal info and account credentials */}
                  <hr className="form-divider" />

                  {/* ── SECTION: Account credentials ── */}
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Kredensial Akun</p>

                  {/* Row: Username + Password */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Username Login</label>
                      <div className="relative">
                        <AtSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          required
                          name="username"
                          type="text"
                          value={formData.username}
                          onChange={handleInputChange}
                          className={`${inputWithIcon} font-mono`}
                          placeholder="admin_bagas"
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>
                        Password
                        {/* Hint shown only in edit mode */}
                        {editingId && (
                          <span className="ml-1 text-slate-400 normal-case tracking-normal font-normal">
                            (kosongkan jika tidak berubah)
                          </span>
                        )}
                      </label>
                      <div className="relative">
                        <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          required={!editingId}
                          name="password"
                          type="password"
                          value={formData.password}
                          onChange={handleInputChange}
                          className={inputWithIcon}
                          placeholder="••••••••"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Divider between credentials and access settings */}
                  <hr className="form-divider" />

                  {/* ── SECTION: Access settings ── */}
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Pengaturan Akses</p>

                  {/* Row: Role + Status */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Role (Hak Akses)</label>
                      <select
                        value={formData.role}
                        onChange={e => handleSelectChange('role', e.target.value)}
                        className={inputBase}
                      >
                        <option value="admin">Admin / Committee</option>
                        <option value="leader">Church Leader (Pastor)</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Status Akun</label>
                      <select
                        value={formData.is_active}
                        onChange={e => handleSelectChange('is_active', e.target.value)}
                        className={inputBase}
                      >
                        <option value="true">Aktif</option>
                        <option value="false">Nonaktif / Blokir</option>
                      </select>
                    </div>
                  </div>

                </form>
              </div>

              {/* Modal footer: Cancel + Submit */}
              <div className="flex justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex-shrink-0">
                {/* Cancel — closes modal without saving changes */}
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                >
                  Batal
                </button>
                {/* Submit — triggers validation then handleSubmit */}
                <button
                  type="submit"
                  form="userForm"
                  disabled={isLoading}
                  className="btn-indigo flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-xl shadow-md"
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={15} className="spin" />
                      Menyimpan...
                    </>
                  ) : (
                    editingId ? 'Simpan Perubahan' : 'Buat Akun Sekarang'
                  )}
                </button>
              </div>

            </div>
          </div>
        )}
        {/* ============================================================
             DELETE CONFIRMATION MODAL
             Shown when isDeleteModalOpen is true.
        ============================================================ */}
        {isDeleteModalOpen && deletingUser && (
          <div className="mu-backdrop fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="mu-modal bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                    <Trash2 size={18} className="text-red-500" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-800">Hapus Akun</h3>
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

              {/* User data list */}
              <div className="px-6 py-4 space-y-2">
                <div className="flex items-center justify-between py-2.5 border-b border-slate-100">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Nama Lengkap</span>
                  <span className="text-sm font-semibold text-slate-700">{displayName(deletingUser)}</span>
                </div>
                <div className="flex items-center justify-between py-2.5 border-b border-slate-100">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Username</span>
                  <span className="font-mono text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-lg">@{deletingUser.username}</span>
                </div>
                <div className="flex items-center justify-between py-2.5 border-b border-slate-100">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Email</span>
                  <span className="text-sm font-semibold text-slate-700">{deletingUser.email || '—'}</span>
                </div>
                <div className="flex items-center justify-between py-2.5 border-b border-slate-100">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Role</span>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg ${deletingUser.role === 'admin' ? 'bg-indigo-50 text-indigo-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    <Shield size={10} />
                    {deletingUser.role === 'admin' ? 'Admin / Committee' : 'Church Leader'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</span>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg ${deletingUser.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${deletingUser.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                    {deletingUser.is_active ? 'Aktif' : 'Nonaktif'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 text-center pt-2">Data yang dihapus tidak dapat dikembalikan.</p>
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
                  Hapus Permanen
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </>
  );
}