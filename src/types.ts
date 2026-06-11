export type UserRole = 'admin' | 'employee' | 'front_desk' | 'cook' | 'cleaner' | 'staff' | 'waiter' | 'guest';

export interface Profile {
  id: string; // references auth.users
  email: string;
  full_name: string;
  role: UserRole;
  created_at: string;
}

export interface Hotel {
  id: string;
  name: string;
  address: string;
  phone: string;
  rating: number;
  description: string;
  image_url: string;
  created_at: string;
}

export interface Room {
  id: string;
  hotel_id: string;
  room_number: string;
  type: string; // 'deluxe', 'suite', 'standard', 'penthouse'
  description: string;
  price_per_hour: number;
  max_occupancy: number;
  min_stay_hours?: number;
  status: 'available' | 'booked' | 'reserved' | 'cleaning' | 'maintenance';
  image_url: string;
  check_in_times?: string[];
  check_out_times?: string[];
  created_at: string;
}

export interface Customer {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  preferences?: Record<string, any>;
  notes?: string;
  total_visits?: number;
  total_spent?: number;
  created_at: string;
}

export interface Booking {
  id: string;
  room_id: string;
  customer_id: string;
  check_in_date: string;
  check_out_date: string;
  check_in_time: string;
  check_out_time: string;
  total_price: number;
  discount_amount?: number;
  discount_description?: string | null;
  promo_code_id?: string | null;
  group_id?: string | null;
  recurring_rule?: string | null;
  status: 'pending' | 'confirmed' | 'checked-in' | 'completed' | 'cancelled';
  assigned_employee_id: string | null;
  created_at: string;
  rooms?: Room & { hotels?: Hotel };
  customers?: Customer;
  profiles?: Profile;
  booking_groups?: BookingGroup;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  assigned_employee_id: string;
  booking_id: string | null;
  status: 'pending' | 'in-progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  created_at: string;
  profiles?: Profile; // joined table (assigned employee)
  bookings?: Booking & { rooms?: Room }; // joined table (linked booking and room)
}

export interface Testimonial {
  id: string;
  customer_name: string;
  role_or_title: string;
  comment: string;
  rating: number;
  avatar_url: string;
  created_at: string;
}

export interface PendingBooking {
  roomId: string;
  roomNumber: string;
  roomType: string;
  checkIn: string;
  checkOut: string;
  checkInTime: string;
  checkOutTime: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  totalPrice: number;
  hours: number;
  nights: number;
  billingMode: 'hourly' | 'nightly';
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  user_name: string;
  action: string;
  details: string;
  created_at: string;
}

export interface MenuCategory {
  id: string;
  name: string;
  created_at: string;
}

export interface InventoryItem {
  id: string;
  category_id: string;
  name: string;
  description: string;
  price: number;
  stock_quantity: number;
  unit: string;
  low_stock_threshold: number;
  image_url: string;
  created_at: string;
  menu_categories?: MenuCategory;
}

export interface GuestOrder {
  id: string;
  booking_id: string;
  item_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  status: 'pending' | 'preparing' | 'served' | 'cancelled';
  notes: string;
  created_at: string;
  inventory_items?: InventoryItem;
  bookings?: Booking;
}

export interface ChatMessage {
  id: string;
  booking_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: 'guest' | 'staff';
  message: string;
  seen_at: string | null;
  created_at: string;
  bookings?: Booking & { customers?: Customer; rooms?: Room }; // joined table
}

export interface ChatTyping {
  id: string;
  booking_id: string;
  user_id: string;
  user_name: string;
  user_role: 'guest' | 'staff';
  is_typing: boolean;
  updated_at: string;
}

export interface StaffCall {
  id: string;
  booking_id: string;
  guest_id: string;
  guest_name: string;
  reason: string;
  status: 'pending' | 'responded' | 'completed' | 'cancelled';
  created_at: string;
  responded_at: string | null;
  bookings?: Booking & { customers?: Customer; rooms?: Room }; // joined table
}

export interface StayExtension {
  id: string;
  booking_id: string;
  requested_check_out_date: string;
  extend_type: 'day' | 'hour';
  requested_hours: number | null;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  reviewed_by: string | null;
  bookings?: Booking & { customers?: Customer; rooms?: Room }; // joined table
}

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
  admin_reply: string | null;
  replied_at: string | null;
  read_at: string | null;
  created_at: string;
}

export interface EmployeePayroll {
  id: string;
  user_id: string;
  employee_id?: string;
  department?: string;
  position?: string;
  hourly_rate: number;
  overtime_rate: number;
  pay_frequency: 'weekly' | 'bi-weekly' | 'monthly';
  employment_type: 'regular' | 'probationary' | 'contractual' | 'seasonal' | 'part-time' | 'casual';
  salary_type?: 'monthly' | 'daily' | 'hourly';
  basic_salary?: number;
  daily_rate?: number;
  night_diff_rate?: number;
  hire_date: string | null;
  tax_id: string;
  bank_account: string;
  government_ids?: Record<string, string>;
  bank_details?: Record<string, string>;
  payroll_status?: 'active' | 'hold' | 'resigned' | 'terminated';
  remarks: string;
  created_at: string;
  users?: Profile;
}

export interface TimeEntry {
  id: string;
  user_id: string;
  clock_in: string;
  clock_out: string | null;
  total_hours: number | null;
  is_overtime: boolean;
  overtime_hours?: number;
  night_diff_hours?: number;
  late_minutes?: number;
  undertime_minutes?: number;
  absence_hours?: number;
  holiday_work_hours?: number;
  rest_day_work_hours?: number;
  attendance_synced_at?: string | null;
  notes: string;
  approved_by: string | null;
  created_at: string;
  users?: Profile;
}

export interface PayrollPeriod {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  cycle_type?: 'weekly' | 'semi-monthly' | 'monthly' | 'custom';
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  approval_status?: 'draft' | 'hr_review' | 'manager_approval' | 'finance_approval' | 'released';
  locked_at?: string | null;
  release_at?: string | null;
  processed_at: string | null;
  processed_by: string | null;
  notes: string;
  created_at: string;
}

export interface PayrollEntry {
  id: string;
  period_id: string;
  user_id: string;
  total_regular_hours: number;
  total_overtime_hours: number;
  total_night_diff_hours?: number;
  total_late_minutes?: number;
  total_undertime_minutes?: number;
  total_absence_days?: number;
  hourly_rate: number;
  overtime_rate: number;
  earnings_total?: number;
  deductions_total?: number;
  gross_pay: number;
  deductions: number;
  net_pay: number;
  status: 'pending' | 'hr_review' | 'manager_approval' | 'finance_approval' | 'approved' | 'paid' | 'cancelled';
  paid_at: string | null;
  notes: string;
  version?: number;
  created_at: string;
  payroll_periods?: PayrollPeriod;
  users?: Profile;
}

export interface PayrollComponent {
  id: string;
  payroll_entry_id: string;
  component_type: 'earning' | 'deduction';
  code: string;
  name: string;
  amount: number;
  taxable?: boolean;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface PayrollApproval {
  id: string;
  payroll_period_id: string;
  stage: 'hr_review' | 'manager_approval' | 'finance_approval' | 'final_release';
  approver_id: string | null;
  status: 'pending' | 'approved' | 'rejected';
  remarks: string;
  approved_at: string | null;
  created_at: string;
}

export interface LeaveType {
  id: string;
  code: string;
  name: string;
  is_paid: boolean;
  created_at: string;
}

export interface LeaveBalance {
  id: string;
  user_id: string;
  leave_type_id: string;
  year: number;
  balance: number;
  used: number;
  created_at: string;
}

export interface LeaveRequest {
  id: string;
  user_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  days: number;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reviewed_by: string | null;
  remarks: string;
  created_at: string;
}

export interface HolidayCalendar {
  id: string;
  date: string;
  name: string;
  holiday_type: 'regular' | 'special_non_working' | 'local' | 'company';
  multiplier: number;
  created_at: string;
}

export interface SalaryAdjustment {
  id: string;
  user_id: string;
  action_type: 'increase' | 'reduction' | 'promotion' | 'position_change' | 'cola';
  previous_amount: number;
  new_amount: number;
  effective_date: string;
  remarks: string;
  approved_by: string | null;
  created_at: string;
}

export interface BookingGroup {
  id: string;
  name: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  total_rooms: number;
  total_guests: number | null;
  notes: string;
  status: 'pending' | 'confirmed' | 'checked-in' | 'completed' | 'cancelled';
  created_at: string;
}

export interface HousekeepingTask {
  id: string;
  room_id: string;
  assigned_to: string | null;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  task_type: 'cleaning' | 'turnover' | 'deep_clean' | 'maintenance_check' | 'supply_restock' | 'inspection';
  notes: string;
  photos: string[];
  completed_at: string | null;
  created_at: string;
  rooms?: Room;
  users?: Profile;
}

export interface PromoCode {
  id: string;
  code: string;
  description: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  min_spend: number;
  max_discount: number | null;
  valid_from: string;
  valid_to: string;
  usage_limit: number | null;
  used_count: number;
  is_active: boolean;
  created_at: string;
}

export interface Incident {
  id: string;
  room_id: string;
  booking_id: string | null;
  reported_by: string | null;
  incident_type: 'damage' | 'theft' | 'disturbance' | 'injury' | 'fire' | 'flood' | 'other';
  description: string;
  photos: string[];
  cost: number;
  billed_to_guest: boolean;
  status: 'reported' | 'investigating' | 'resolved' | 'billed' | 'closed';
  resolved_at: string | null;
  created_at: string;
  rooms?: Room;
  bookings?: Booking;
}

export interface ParkingSpot {
  id: string;
  spot_number: string;
  level: string;
  status: 'available' | 'occupied' | 'reserved' | 'maintenance';
  assigned_booking_id: string | null;
  vehicle_plate: string;
  vehicle_model: string;
  notes: string;
  created_at: string;
  bookings?: Booking;
}

export interface RatePlan {
  id: string;
  name: string;
  room_type: string;
  date_from: string;
  date_to: string;
  base_price: number;
  min_stay_hours: number;
  is_peak: boolean;
  is_active: boolean;
  created_at: string;
}

export interface LostItem {
  id: string;
  item_name: string;
  description: string;
  category: string;
  location_found: string;
  found_by: string;
  found_date: string;
  photo_url: string | null;
  status: 'unclaimed' | 'claimed' | 'returned' | 'disposed';
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  claim_notes: string | null;
  claimed_at: string | null;
  returned_at: string | null;
  created_at: string;
}

export interface WaitlistEntry {
  id: string;
  room_type: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  check_in: string | null;
  check_out: string | null;
  party_size: number;
  preferred_room_id: string | null;
  notes: string;
  status: 'waiting' | 'notified' | 'booked' | 'expired' | 'cancelled';
  created_at: string;
}
