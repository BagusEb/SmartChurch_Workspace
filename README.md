# ⛪ SmartChurch Management System

SmartChurch adalah sistem manajemen jemaat gereja berbasis *Fullstack Web Application* yang terintegrasi dengan **Kecerdasan Buatan (AI) Face Recognition** untuk pencatatan kehadiran secara otomatis melalui tangkapan kamera CCTV (*Edge Computing*).

Proyek ini dibangun sebagai Capstone Project (Tugas Akhir) untuk memodernisasi administrasi gereja, mencakup pemantauan *real-time*, manajemen data jemaat, pelaporan, dan *Role-Based Access Control* (Admin & Leader).

---

## 🛠️ Tech Stack & Libraries

### Frontend (User Interface)
* **React.js (Vite)** - *Library* UI utama & *build tool*.
* **Tailwind CSS** - *Styling framework* untuk desain responsif.
* **Axios** - HTTP *Client* untuk komunikasi API.
* **React Router DOM** - Manajemen navigasi (SPA).
* **Lucide React** - *Library* ikon UI.

### Backend & Database (API & Logic)
* **Django & Django REST Framework (DRF)** - *Framework* backend dan pembuat API JSON.
* **PostgreSQL (Psycopg2)** - Relational Database Management System.
* **SimpleJWT** - Autentikasi berbasis token yang aman.
* **Django CORS Headers** - Manajemen akses lintas *port*.

### AI & IoT (Face Recognition)
* **OpenCV (cv2)** - *Library* Computer Vision untuk memproses tangkapan CCTV.
* **Face Recognition / Numpy** - Ekstraksi wajah menjadi *array numerik* (Face Embedding).

---

## 🚀 Fitur Utama

1. **Dashboard Analytics:** Visualisasi data jemaat secara *real-time* (terintegrasi dengan Metabase).
2. **Data Jemaat (CRUD):** Manajemen data biodata lengkap jemaat.
3. **Kehadiran Cerdas (IoT):** Fitur *Start/Stop* sesi CCTV yang akan mendeteksi dan mencatat kehadiran wajah yang dikenali secara otomatis.
4. **Validasi AI (Karantina):** Ruang khusus bagi Admin untuk memverifikasi wajah dengan tingkat keyakinan AI rendah (<80%) atau mendaftarkan wajah tak dikenal sebagai jemaat baru.
5. **Laporan & Export:** Penarikan riwayat kehadiran berdasarkan rentang tanggal.
6. **Manajemen Pengguna (RBAC):** Pemisahan hak akses antara Admin (Operasional) dan Leader (Eksekutif/Dashboard Only).
7. **AI Assistant (WIP):** *Chatbot* berbasis NLP untuk menarik informasi statistik operasional gereja.

---

## 💻 Cara Instalasi (Lokal)

Panduan ini ditujukan bagi *developer* yang ingin menjalankan sistem SmartChurch di komputer lokal.

### 1. Persiapan Database (PostgreSQL)
1. Buat database baru kosong di pgAdmin (contoh nama: `smartchurch_db`).
2. Lakukan **Restore** menggunakan file `smartchurch_DB.sql` 
### 2. Setup Backend (Django)
1. Buka terminal dan masuk ke folder proyek backend.
2. Buat Virtual Environment (opsional namun disarankan):
   ```bash
   python -m venv venv
   source venv/Scripts/activate  # Untuk Windows
3. Setelah dipastikan masuk ke dalam venv, jalankan perintah ini untuk menginstal seluruh daftar library yang dibutuhkan ke dalam venv tersebut:
   ```bash
   pip install -r requirements.txt
4. Siapkan konfigurasi rahasia sistem (Environment Variables):
Duplikasi (Copy-Paste) file .env.example dan ubah nama salinannya menjadi .env.
Buka file .env tersebut dan isi bagian DB_PASSWORD dengan password PostgreSQL yang ada di komputermu sendiri.
5. Jalankan server backend:
   ```bash
   uvicorn smartchurch_backend.asgi:application --reload
5. Jalankan server frontend:
   ```bash
   npm run dev
