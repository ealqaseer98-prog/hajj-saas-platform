// src/types/index.ts
// ─── Core DB Types ────────────────────────────────────────────────────────────

export type VisaStatus  = 'pending' | 'approved' | 'rejected'
export type Gender      = 'male' | 'female'
export type DocType     = 'passport' | 'visa' | 'id_card' | 'other'
export type TripStatus  = 'upcoming' | 'active' | 'completed'
export type PackageType = 'barr' | 'tayaran_dammam' | 'tayaran_bahrain' | 'tasreeh_only'
export type Transport   = 'plane' | 'bus' | 'train' | 'private_car'
export type RoomType    = 'single' | 'double' | 'triple' | 'quad' | 'quint' | 'sextuple'
export type InvoiceStatus = 'unpaid' | 'partial' | 'paid' | 'overpaid' | 'cancelled'
export type PaymentMethod = 'cash' | 'bank_transfer' | 'cheque'
export type AccountType   = 'cash' | 'bank'
export type ExpenseCategory = 'hotel' | 'transport' | 'food' | 'visa' | 'other'

export interface Traveller {
  id:              string
  cpr_number:      string
  permit_number:   string | null
  full_name_ar:    string
  full_name_en:    string
  group_name:      string | null
  tasreeh_source:  string | null
  package_type:    PackageType | null
  gender:          Gender | null
  phone:           string | null
  email:           string | null
  passport_number: string | null
  passport_issue_date: string | null
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
  id:               string
  name:             string
  account_type:     AccountType
  balance:          number
  opening_balance:  number | null
  currency:         string
  notes:            string | null
  created_at:       string
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
  to_amount:        number
  exchange_rate:    number
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

export type HajjType = 'sarura' | 'mustahab'
export type AdminReferral = 'مصطفى' | 'علي' | 'عادل' | 'الياس'

export interface PreRegistration {
  id:                  string
  full_name_ar:        string
  cpr_number:          string
  phone:               string | null
  hajj_type:           HajjType
  used_bahrain_permit: boolean
  reference_name:      string | null
  admin_referral:      AdminReferral
  created_at:          string
  updated_at:          string
}

// ─── Umrah ────────────────────────────────────────────────────────────────────

export type UmrahTripStatus = 'upcoming' | 'active' | 'completed' | 'cancelled'

export interface UmrahTrip {
  id:             string
  trip_name:      string
  umrah_year:     string | null
  departure_date: string | null
  return_date:    string | null
  max_travellers: number | null
  status:         UmrahTripStatus
  notes:          string | null
  created_at:     string
}

export interface UmrahTraveller {
  id:              string
  full_name_ar:    string
  full_name_en:    string | null
  cpr_number:      string | null
  passport_number: string | null
  phone:           string | null
  gender:          Gender | null
  date_of_birth:   string | null
  nationality:     string | null
  notes:           string | null
  created_at:      string
}

export interface UmrahTravellerTrip {
  id:                 string
  umrah_traveller_id: string
  umrah_trip_id:      string
  status:             string
  room_number:        string | null
  notes:              string | null
  traveller?:         UmrahTraveller
}

export interface UmrahHotel {
  id:            string
  umrah_trip_id: string
  hotel_name:    string
  city:          string | null
  check_in:      string | null
  check_out:     string | null
  room_count:    number | null
  notes:         string | null
  created_at:    string
}

export interface UmrahManifestEntry {
  id:                 string
  umrah_trip_id:      string
  umrah_traveller_id: string | null
  seat_number:        string | null
  passport_number:    string | null
  notes:              string | null
  created_at:         string
  traveller?:         UmrahTraveller
}

export interface UmrahRoom {
  id:             string
  umrah_trip_id:  string
  umrah_hotel_id: string | null
  room_number:    string
  room_type:      RoomType | null
  capacity:       number | null
  floor:          string | null
  notes:          string | null
  created_at:     string
  assignments?:   UmrahRoomAssignment[]
}

export interface UmrahRoomAssignment {
  id:                 string
  umrah_trip_id:      string
  umrah_room_id:      string
  umrah_traveller_id: string
  created_at:         string
  traveller?:         UmrahTraveller
}

export interface UmrahIncome {
  id:                 string
  campaign_id:        string
  umrah_trip_id:      string
  amount:             number | null
  income_date:        string | null
  source:             string | null
  umrah_traveller_id: string | null
  notes:              string | null
  created_at:         string
  updated_at:         string
}

export type UmrahExpenseCategory = 'hotel' | 'transport' | 'visa' | 'food' | 'other'

export interface UmrahExpense {
  id:            string
  campaign_id:   string
  umrah_trip_id: string
  amount:        number | null
  expense_date:  string | null
  category:      UmrahExpenseCategory | null
  description:   string | null
  notes:         string | null
  created_at:    string
  updated_at:    string
}

export interface UmrahTripPricing {
  id:            string
  campaign_id:   string
  umrah_trip_id: string
  price_quad:    number | null
  price_triple:  number | null
  price_double:  number | null
  price_single:  number | null
  price_child:   number | null
  price_infant:  number | null
  notes:         string | null
  created_at:    string
  updated_at:    string
}

export type UmrahInvoiceRoomType = 'quad' | 'triple' | 'double' | 'single' | 'child' | 'infant'

export interface UmrahInvoice {
  id:             string
  campaign_id:    string
  umrah_trip_id:  string
  invoice_number: string | null
  invoice_date:   string | null
  discount:       number | null
  notes:          string | null
  created_at:     string
  updated_at:     string
  items?:         UmrahInvoiceItem[]
  payments?:      UmrahInvoicePayment[]
}

export interface UmrahInvoiceItem {
  id:                 string
  campaign_id:        string
  umrah_invoice_id:   string
  umrah_traveller_id: string | null
  room_type:          UmrahInvoiceRoomType | null
  price:              number | null
  created_at?:        string
  traveller?:         UmrahTraveller
}

export interface UmrahInvoicePayment {
  id:               string
  campaign_id:      string
  umrah_invoice_id: string
  amount:           number | null
  payment_date:     string | null
  notes:            string | null
  created_at:       string
}

export type UmrahTransportType = 'bus' | 'flight'

export interface UmrahTransport {
  id:              string
  campaign_id:     string
  umrah_trip_id:   string
  transport_type:  UmrahTransportType
  name:            string
  capacity:        number | null
  bus_driver:      string | null
  bus_plate:       string | null
  flight_number:   string | null
  airline:         string | null
  departure_time:  string | null
  notes:           string | null
  created_at:      string
  updated_at?:     string
  assignments?:    UmrahTransportAssignment[]
}

export interface UmrahTransportAssignment {
  id:                 string
  campaign_id:        string
  umrah_trip_id:      string
  umrah_transport_id: string
  umrah_traveller_id: string
  seat_number:        string | null
  created_at?:        string
  traveller?:         UmrahTraveller
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export interface AppUser {
  id:          string
  username:    string
  full_name:   string | null
  role:        'super_admin' | 'admin' | 'coordinator' | 'driver'
  campaign_id?: string
}
 

// ─── UI helpers ───────────────────────────────────────────────────────────────
export type FormMode = 'create' | 'edit'
