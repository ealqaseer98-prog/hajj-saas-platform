// src/types/index.ts
// ─── Core DB Types ────────────────────────────────────────────────────────────

export type VisaStatus  = 'pending' | 'approved' | 'rejected'
export type Gender      = 'male' | 'female'
export type DocType     = 'passport' | 'visa' | 'id_card' | 'other'
export type TripStatus  = 'upcoming' | 'active' | 'completed'
export type PackageType = 'barr' | 'tayaran_dammam' | 'tayaran_bahrain' | 'tasreeh_only'
export type Transport   = 'plane' | 'bus' | 'train' | 'private_car'
export type RoomType    = 'single' | 'double' | 'triple' | 'quad' | 'quint'
export type InvoiceStatus = 'unpaid' | 'partial' | 'paid' | 'cancelled'
export type PaymentMethod = 'cash' | 'bank_transfer' | 'cheque'
export type AccountType   = 'cash' | 'bank'
export type ExpenseCategory = 'hotel' | 'transport' | 'food' | 'visa' | 'other'

export interface Traveller {
  id:              string
  cpr_number:      string
  full_name_ar:    string
  full_name_en:    string
  group_name:      string | null
  tasreeh_source:  string | null
  package_type:    PackageType | null
  gender:          Gender | null
  phone:           string | null
  email:           string | null
  passport_number: string | null
  passport_expiry: string | null
  nationality:     string
  date_of_birth:   string | null
  visa_status:     VisaStatus
  notes:           string | null
  created_at:      string
  updated_at:      string
}

export interface VisaHistory {
  id:           string
  traveller_id: string
  status:       VisaStatus
  notes:        string | null
  changed_by:   string | null
  changed_at:   string
  traveller?:   Traveller
}

export interface TravellerDocument {
  id:           string
  traveller_id: string
  doc_type:     DocType
  file_name:    string
  file_url:     string
  storage_path: string
  notes:        string | null
  uploaded_at:  string
  traveller?:   Traveller
}

export interface WhatsAppLog {
  id:           string
  traveller_id: string
  phone:        string
  message:      string
  status:       'sent' | 'failed' | 'pending'
  sent_at:      string
  traveller?:   Traveller
}

export interface Trip {
  id:             string
  trip_name:      string
  year:           number | null
  package_type:   PackageType
  departure_date: string | null
  return_date:    string | null
  max_travellers: number
  status:         TripStatus
  notes:          string | null
  created_at:     string
}

export interface TripLeg {
  id:             string
  trip_id:        string
  leg_order:      number
  transport_type: Transport
  from_location:  string
  to_location:    string
  departure_dt:   string | null
  arrival_dt:     string | null
  flight_number:  string | null
  airline:        string | null
  train_number:   string | null
  notes:          string | null
}

export interface TravellerTrip {
  id:           string
  traveller_id: string
  trip_id:      string
  joined_at:    string
  status:       'confirmed' | 'cancelled' | 'waitlist'
  traveller?:   Traveller
  trip?:        Trip
}

export interface Account {
  id:           string
  name:         string
  account_type: AccountType
  balance:      number
  currency:     string
  notes:        string | null
  created_at:   string
}

export interface Invoice {
  id:             string
  invoice_number: string | null
  traveller_id:   string | null
  trip_id:        string | null
  account_id:     string | null
  amount:         number
  amount_paid:    number
  currency:       string
  description:    string | null
  issue_date:     string
  due_date:       string | null
  status:         InvoiceStatus
  notes:          string | null
  created_at:     string
  updated_at:     string
  traveller?:     Traveller
  trip?:          Trip
  account?:       Account
}

export interface Receipt {
  id:             string
  receipt_number: string | null
  invoice_id:     string | null
  traveller_id:   string | null
  account_id:     string | null
  amount:         number
  currency:       string
  payment_method: PaymentMethod
  payment_date:   string
  notes:          string | null
  created_at:     string
  traveller?:     Traveller
  invoice?:       Invoice
  account?:       Account
}

export interface Expense {
  id:             string
  expense_number: string | null
  account_id:     string | null
  traveller_id:   string | null
  trip_id:        string | null
  amount:         number
  currency:       string
  category:       ExpenseCategory | null
  description:    string
  expense_date:   string
  notes:          string | null
  created_at:     string
  account?:       Account
  traveller?:     Traveller
  trip?:          Trip
}

export interface AccountTransfer {
  id:               string
  from_account_id:  string
  to_account_id:    string
  amount:           number
  transfer_date:    string
  notes:            string | null
  created_at:       string
  from_account?:    Account
  to_account?:      Account
}

export interface Hotel {
  id:             string
  trip_id:        string
  hotel_name:     string
  city:           string
  check_in_date:  string | null
  check_out_date: string | null
  address:        string | null
  phone:          string | null
  notes:          string | null
  trip?:          Trip
  rooms?:         Room[]
}

export interface Room {
  id:          string
  hotel_id:    string
  room_number: string
  room_type:   RoomType
  capacity:    number
  floor:       string | null
  notes:       string | null
  hotel?:      Hotel
  assignments?: RoomAssignment[]
}

export interface RoomAssignment {
  id:             string
  room_id:        string
  traveller_id:   string
  check_in_date:  string | null
  check_out_date: string | null
  traveller?:     Traveller
  room?:          Room
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export interface AppUser {
  id:        string
  username:  string
  full_name: string | null
  role:      'admin' | 'agent'
}

// ─── UI helpers ───────────────────────────────────────────────────────────────
export type FormMode = 'create' | 'edit'
