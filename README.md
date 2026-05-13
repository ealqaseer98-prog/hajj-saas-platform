# 🕌 حملة العمار للحج والعمرة | Hajj Agent Management System

A full-featured Arabic web application for Hajj travel agencies to manage travellers, trips, accounting, and hotel room assignments.

---

## ✨ الصفحات | Pages

| الصفحة | الوصف |
|--------|-------|
| 🔐 تسجيل الدخول | Login with username & password stored in database |
| 📊 لوحة التحكم | Dashboard with KPIs, alerts, financial summary |
| 👤 الحجاج | Add/edit/delete travellers by CPR, search, view profile |
| ✈️ الرحلات | Create trips with legs (plane/bus/train/car), enroll travellers |
| 📒 المحاسبة | Invoices, receipts, expenses — all linked to travellers/trips |
| 💰 الحسابات | Cash & bank accounts, transfers, direct deposits |
| 🏨 الفنادق | Hotel management for Mecca & Medina |
| 🛏️ الغرف | Room distribution — assign travellers to rooms per hotel |

---

## 🚀 Setup Instructions

### 1. Create a Supabase project
1. Go to https://app.supabase.com and create a new project
2. Once created, go to **Settings → API**
3. Copy your **Project URL** and **anon/public key**

### 2. Run the database schema
1. In Supabase, go to **SQL Editor**
2. Paste the entire contents of `supabase_schema.sql`
3. Click **Run**

### 3. Create your first admin user
Run this in the Supabase SQL Editor (replace the hash with a real bcrypt hash):

```sql
-- Generate a bcrypt hash for your password at: https://bcrypt-generator.com
INSERT INTO users (username, password, full_name, role)
VALUES ('admin', '$2b$10$YOUR_BCRYPT_HASH_HERE', 'اسمك', 'admin');
```

### 4. Clone and run the project
```bash
# Clone
git clone <your-repo>
cd hajj-agent

# Install dependencies
npm install

# Create your environment file
cp .env.example .env.local
# Edit .env.local and fill in your Supabase URL and anon key

# Start development server
npm run dev
```

App runs at http://localhost:5173

---

## 🗄️ Database Tables

| الجدول | الغرض |
|--------|-------|
| `users` | Login accounts (manually inserted) |
| `travellers` | Traveller profiles, keyed by CPR number |
| `trips` | Trip definitions with dates and package types |
| `trip_legs` | Individual transport segments (plane/bus/train/car) |
| `traveller_trips` | Many-to-many: which traveller is in which trip |
| `accounts` | Cash & bank accounts |
| `invoices` | Invoices linked to travellers/trips/accounts |
| `receipts` | Payments received, auto-updates account balance |
| `expenses` | Outgoing expenses, auto-updates account balance |
| `account_transfers` | Transfers between accounts |
| `hotels` | Hotels linked to trips |
| `rooms` | Rooms within hotels |
| `room_assignments` | Which traveller is in which room |

---

## 🛠️ Tech Stack

- **React 18** + **Vite** — Fast frontend
- **TypeScript** — Type safety
- **Tailwind CSS** — Styling (RTL-ready)
- **Supabase** — PostgreSQL database + real-time
- **React Query** — Server state management
- **Zustand** — Auth state
- **React Router v6** — Routing
- **Lucide React** — Icons

---

## 📋 Suggested Next Steps

1. **PDF Invoice generation** — Add `jsPDF` to print invoices with Arabic text
2. **WhatsApp notifications** — Use WhatsApp Business API to send reminders
3. **Document uploads** — Store passport scans in Supabase Storage
4. **Visa status tracking** — Add timeline of visa application history
5. **Trip manifest print** — One-click PDF list of all travellers per trip
6. **Role-based access** — Restrict agents from editing accounting
7. **Backup/export** — CSV export of travellers and financial reports
