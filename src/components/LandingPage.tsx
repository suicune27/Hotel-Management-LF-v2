import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';
import { Room, Testimonial, Booking, Customer, Profile, PendingBooking } from '../types';
import { 
  Calendar, CalendarDays, Users, MapPin, Star, Shield, HelpCircle, Phone, Mail, 
  ArrowRight, Search, Check, Sparkles, Coffee, Compass, ChevronRight, X, Loader2, LogIn
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getSettings, fetchSettingsFromSupabase } from '../lib/settings';

interface LandingPageProps {
  onNavigate: (screen: 'landing' | 'login' | 'admin-dashboard' | 'employee-dashboard' | 'guest-dashboard') => void;
  userSession: Session | null;
  userProfile: Profile | null;
  onLogout: () => void;
}

export default function LandingPage({ onNavigate, userSession, userProfile, onLogout }: LandingPageProps) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [loadingTestimonials, setLoadingTestimonials] = useState(true);
  const [settings, setSettings] = useState(() => getSettings());

  useEffect(() => {
    const handleSettingsUpdate = () => {
      setSettings(getSettings());
    };
    window.addEventListener('hotel-settings-updated', handleSettingsUpdate);
    return () => {
      window.removeEventListener('hotel-settings-updated', handleSettingsUpdate);
    };
  }, []);

  // Search Filter State
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [guests, setGuests] = useState('1');
  const [selectedType, setSelectedType] = useState('All');

  // Booking Modal State
  const [bookingRoom, setBookingRoom] = useState<Room | null>(null);
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [bookingCheckIn, setBookingCheckIn] = useState('');
  const [bookingCheckOut, setBookingCheckOut] = useState('');
  const [bookingCheckInTime, setBookingCheckInTime] = useState('');
  const [bookingCheckOutTime, setBookingCheckOutTime] = useState('');
  const [conciergeSuccess, setConciergeSuccess] = useState(false);
  const [conciergeName, setConciergeName] = useState('');
  const [conciergeEmail, setConciergeEmail] = useState('');
  const [conciergePhone, setConciergePhone] = useState('');
  const [conciergeSubject, setConciergeSubject] = useState('');
  const [conciergeMessage, setConciergeMessage] = useState('');
  const [conciergeSubmitting, setConciergeSubmitting] = useState(false);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState<string | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingDateConflict, setBookingDateConflict] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const pendingProcessedRef = useRef(false);

  // Helper: ensure check_out_date > check_in_date for the database constraint
  const getDbCheckOutDate = (checkIn: string, checkOut: string): string => {
    if (checkIn === checkOut) {
      const nextDay = new Date(checkOut);
      nextDay.setDate(nextDay.getDate() + 1);
      return nextDay.toISOString().split('T')[0];
    }
    return checkOut;
  };

  // Convert time string (e.g. "2:00 PM") to minutes since midnight
  const timeToMinutes = (t: string): number => {
    if (!t) return 0;
    const parts = t.split(' ');
    if (parts.length !== 2) return 0;
    const [time, ampm] = parts;
    let [h, m] = time.split(':').map(Number);
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return h * 60 + m;
  };

  // Get valid check-out times given a selected check-in time and minStayHours
  const getValidCheckOutTimes = (checkInTime: string): string[] => {
    if (!checkInTime || !bookingRoom) return bookingRoom?.check_out_times || [];
    const minStay = bookingRoom.min_stay_hours || settings.minStayHours || 3;
    
    // If dates differ, all times are valid (at least 24h gap)
    if (bookingCheckIn && bookingCheckOut && bookingCheckIn !== bookingCheckOut) {
      return bookingRoom.check_out_times || [];
    }
    
    const ciMin = timeToMinutes(checkInTime);
    const minCoMin = ciMin + minStay * 60;
    
    return (bookingRoom.check_out_times || []).filter(t => {
      const tMin = timeToMinutes(t);
      if (minCoMin >= 1440) {
        // Overnight: check-out is next day
        return tMin >= minCoMin - 1440;
      }
      return tMin >= minCoMin;
    });
  };

  // Get valid check-in times given a selected check-out time and minStayHours
  const getValidCheckInTimes = (checkOutTime: string): string[] => {
    if (!checkOutTime || !bookingRoom) return bookingRoom?.check_in_times || [];
    const minStay = bookingRoom.min_stay_hours || settings.minStayHours || 3;
    
    // If dates differ, all times are valid (at least 24h gap)
    if (bookingCheckIn && bookingCheckOut && bookingCheckIn !== bookingCheckOut) {
      return bookingRoom.check_in_times || [];
    }
    
    const coMin = timeToMinutes(checkOutTime);
    const maxCiMin = coMin - minStay * 60;
    
    return (bookingRoom.check_in_times || []).filter(t => {
      const tMin = timeToMinutes(t);
      if (maxCiMin < 0) {
        // Overnight: check-in was previous day
        return tMin <= maxCiMin + 1440;
      }
      return tMin <= maxCiMin;
    });
  };

  // Check if the selected dates overlap with any existing active booking for this room
  const checkDateConflict = (roomId: string, checkIn: string, checkOut: string) => {
    if (!checkIn || !checkOut) return null;
    const inDate = new Date(checkIn);
    const outDate = new Date(checkOut);
    for (const b of bookings) {
      if (b.room_id !== roomId) continue;
      const bIn = new Date(b.check_in_date);
      const bOut = new Date(b.check_out_date);
      // Overlap: A.start < B.end AND A.end > B.start
      if (inDate < bOut && outDate > bIn) {
        return b;
      }
    }
    return null;
  };

  // Auto-process pending booking after authentication (only once per pending booking)
  useEffect(() => {
    if (!userSession || pendingProcessedRef.current) return;
    const pendingJson = sessionStorage.getItem('pendingBooking');
    if (!pendingJson) return;
    pendingProcessedRef.current = true;
    try {
      const pending = JSON.parse(pendingJson) as PendingBooking;
      processPendingBooking(pending);
    } catch (err) {
      // console.error('Failed to parse pending booking:', err);
      // Only clear on parse error (malformed data); booking errors handled in processPendingBooking
      sessionStorage.removeItem('pendingBooking');
    }
  }, [userSession]);

  const processPendingBooking = async (pending: PendingBooking) => {
    setBookingSubmitting(true);
    setBookingError(null);
    try {
      // Fetch room details
      const { data: room, error: roomErr } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', pending.roomId)
        .single();
      if (roomErr || !room) throw new Error('Could not find the selected room.');

      // Find or create customer by email
      const { data: existingCust } = await supabase
        .from('customers')
        .select('*')
        .eq('email', pending.guestEmail.toLowerCase())
        .maybeSingle();

      let customerId = '';
      if (existingCust) {
        customerId = existingCust.id;
      } else {
        const { data: newCust, error: custInsErr } = await supabase
          .from('customers')
          .insert({
            full_name: pending.guestName.trim(),
            email: pending.guestEmail.toLowerCase(),
            phone: pending.guestPhone.trim()
          })
          .select()
          .single();
        if (custInsErr) throw new Error('Could not register your profile: ' + custInsErr.message);
        customerId = newCust.id;
      }

      // Create booking (ensure check_out > check_in for DB constraint)
      const dbCheckOut = getDbCheckOutDate(pending.checkIn, pending.checkOut);
      const { data: booking, error: bookingInsErr } = await supabase
        .from('bookings')
        .insert({
          room_id: pending.roomId,
          customer_id: customerId,
          check_in_date: pending.checkIn,
          check_out_date: dbCheckOut,
          check_in_time: pending.checkInTime,
          check_out_time: pending.checkOutTime,
          total_price: pending.totalPrice,
          status: 'pending'
        })
        .select()
        .single();

      if (bookingInsErr) throw new Error('Could not create reservation: ' + bookingInsErr.message);

      // Log activity
      await supabase.from('activity_logs').insert({
        user_name: pending.guestName,
        action: 'Room Reservation Created',
        details: `Room ${pending.roomNumber} booked for ${pending.guestName} (${pending.checkIn} at ${pending.checkInTime} → ${pending.checkOut} at ${pending.checkOutTime})`
      });

      sessionStorage.removeItem('pendingBooking');
      pendingProcessedRef.current = false;

      // Open modal with success state
      setBookingRoom(room);
      setBookingCheckIn(pending.checkIn);
      setBookingCheckOut(pending.checkOut);
      setBookingCheckInTime(pending.checkInTime);
      setBookingCheckOutTime(pending.checkOutTime);
      setGuestName(pending.guestName);
      setGuestEmail(pending.guestEmail);
      setGuestPhone(pending.guestPhone);
      setBookingSuccess(booking.id);

    } catch (err: any) {
      setBookingError(err.message || 'An unexpected error occurred completing your booking.');
      // Don't remove pendingBooking on error — keeps user on landing page to re-try
      // and prevents unwanted redirect to guest-dashboard from onAuthStateChange
    } finally {
      setBookingSubmitting(false);
    }
  };

  // Fetch rooms and testimonials on mount
  useEffect(() => {
    async function loadData() {
      // Hydrate settings from Supabase (not localStorage)
      const dbSettings = await fetchSettingsFromSupabase();
      setSettings(dbSettings);

      try {
        setLoadingRooms(true);
        const { data: roomData, error: roomError } = await supabase
          .from('rooms')
          .select('*')
          .order('created_at', { ascending: false });
        if (roomError) {
          // console.error("Supabase rooms fetch error:", roomError.message, roomError);
          setRooms([]);
        } else if (roomData) {
          console.log("Rooms fetched from DB:", roomData.length, "records");
          setRooms(roomData);
        } else {
          // console.warn("Rooms query returned null/undefined");
        }
      } catch (err) {
        // console.error("Exception fetching rooms:", err);
        setRooms([]);
      } finally {
        setLoadingRooms(false);
      }

      try {
        setLoadingTestimonials(true);
        const { data: testData, error: testError } = await supabase
          .from('testimonials')
          .select('*')
          .order('created_at', { ascending: false });
        if (!testError && testData) {
          setTestimonials(testData);
        }
      } catch (err) {
        // console.error("Error fetching testimonials:", err);
      } finally {
        setLoadingTestimonials(false);
      }

      // Fetch active bookings to compute unavailable dates
      try {
        const { data: bookingData } = await supabase
          .from('bookings')
          .select('*')
          .not('status', 'in', '("completed","cancelled")');
        if (bookingData) setBookings(bookingData);
      } catch (err) {
        // console.error("Error fetching bookings:", err);
      }
    }
    loadData();
  }, []);

  // Scroll shadow effect for header
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Filter logic
  const filteredRooms = rooms.filter(room => {
    const matchesType = selectedType === 'All' || room.type === selectedType;
    const matchesCapacity = room.max_occupancy >= parseInt(guests);
    return matchesType && matchesCapacity;
  });

  // Dual-billing helpers
  const getBookingNights = () => {
    if (!bookingCheckIn || !bookingCheckOut) return 0;
    const start = new Date(bookingCheckIn);
    const end = new Date(bookingCheckOut);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return isNaN(diffDays) ? 0 : diffDays;
  };

  const parseTime12to24 = (time12: string): string => {
    const parts = time12.split(' ');
    if (parts.length !== 2) return '00:00';
    const [time, ampm] = parts;
    let [h, m] = time.split(':').map(Number);
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  const getCombinedDateTime = (dateStr: string, timeStr: string): Date =>
    new Date(`${dateStr}T${parseTime12to24(timeStr)}`);

  const getBookingHours = (): number => {
    if (!bookingCheckIn || !bookingCheckOut || !bookingCheckInTime || !bookingCheckOutTime) return 0;
    const start = getCombinedDateTime(bookingCheckIn, bookingCheckInTime);
    const end = getCombinedDateTime(bookingCheckOut, bookingCheckOutTime);
    const diffMs = end.getTime() - start.getTime();
    return Math.max(0, Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100);
  };

  const getBillingMode = (): 'hourly' | 'nightly' => getBookingHours() < 24 ? 'hourly' : 'nightly';

  const getCalculatedTotal = (): number => {
    if (!bookingRoom) return 0;
    const hours = getBookingHours();
    if (hours <= 0) return 0;
    if (getBillingMode() === 'hourly') {
      return Math.round(bookingRoom.price_per_hour * hours * 100) / 100;
    }
    return Math.round(bookingRoom.price_per_hour * 24 * Math.max(1, getBookingNights()) * 100) / 100;
  };

  const handleOpenBooking = (room: Room) => {
    const defaultIn = checkIn || new Date().toISOString().split('T')[0];
    const defaultOut = checkOut || (() => { const d = new Date(); d.setDate(d.getDate() + 2); return d.toISOString().split('T')[0]; })();
    setBookingRoom(room);
    setBookingCheckIn(defaultIn);
    setBookingCheckOut(defaultOut);
    
    // Set default times that respect minimum stay
    const firstCheckIn = room.check_in_times?.[0] || '';
    const minStay = room.min_stay_hours || settings.minStayHours || 3;
    const firstCheckOut = room.check_out_times?.find(t => {
      if (!firstCheckIn || defaultIn === defaultOut) return t !== firstCheckIn; // same-day: pick any different time
      return true; // multi-day: all valid
    }) || room.check_out_times?.[0] || '';
    
    // If same day, ensure check-out >= check-in + minStay
    let defaultCheckOutTime = firstCheckOut;
    if (defaultIn === defaultOut && firstCheckIn && firstCheckOut) {
      const ciMin = timeToMinutes(firstCheckIn);
      const coMin = timeToMinutes(firstCheckOut);
      const minCoMin = ciMin + minStay * 60;
      if ((minCoMin < 1440 && coMin < minCoMin) || (minCoMin >= 1440 && coMin < minCoMin - 1440)) {
        // Current default is invalid, find a valid one
        const validCheckOuts = room.check_out_times?.filter(t => {
          const tMin = timeToMinutes(t);
          if (minCoMin >= 1440) return tMin >= minCoMin - 1440;
          return tMin >= minCoMin;
        }) || [];
        defaultCheckOutTime = validCheckOuts[0] || firstCheckOut;
      }
    }
    
    setBookingCheckInTime(firstCheckIn);
    setBookingCheckOutTime(defaultCheckOutTime);
    // Pre-fill guest details from the logged-in user profile
    if (userSession && userProfile) {
      setGuestName(userProfile.full_name || '');
      setGuestEmail(userProfile.email || '');
      setGuestPhone(''); // phone isn't stored in the auth profile
    } else {
      setGuestName('');
      setGuestEmail('');
      setGuestPhone('');
    }
    setBookingSuccess(null);
    setBookingError(null);
    const conflict = checkDateConflict(room.id, defaultIn, defaultOut);
    setBookingDateConflict(conflict ? `This room is already reserved ${conflict.check_in_date} → ${conflict.check_out_date}. Please choose different dates.` : null);
  };

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingRoom) return;

    const hours = getBookingHours();
    if (hours <= 0) {
      setBookingError("Check-out must be after Check-in.");
      return;
    }
    const minStay = bookingRoom.min_stay_hours || settings.minStayHours || 3;
    if (hours < minStay) {
      setBookingError(`Minimum stay is ${minStay} hours. Please adjust your booking.`);
      return;
    }

    // If not authenticated, create booking directly (local network mode - guest sign-in disabled)
    if (!userSession) {
      setBookingSubmitting(true);
      setBookingError(null);

      const conflict = checkDateConflict(bookingRoom.id, bookingCheckIn, bookingCheckOut);
      if (conflict) {
        setBookingError(`This room is already reserved ${conflict.check_in_date} → ${conflict.check_out_date}. Please choose different dates.`);
        setBookingSubmitting(false);
        return;
      }

      try {
        const { data: existingCust } = await supabase
          .from('customers')
          .select('*')
          .eq('email', guestEmail.trim().toLowerCase())
          .maybeSingle();

        let customerId = '';
        if (existingCust) {
          customerId = existingCust.id;
        } else {
          const { data: newCust, error: custInsErr } = await supabase
            .from('customers')
            .insert({
              full_name: guestName.trim(),
              email: guestEmail.trim().toLowerCase(),
              phone: guestPhone.trim()
            })
            .select()
            .single();

          if (custInsErr) throw new Error("Could not register your profile: " + custInsErr.message);
          customerId = newCust.id;
        }

        const totalPrice = getCalculatedTotal();
        const dbCheckOut = getDbCheckOutDate(bookingCheckIn, bookingCheckOut);
        const { data: booking, error: bookingInsErr } = await supabase
          .from('bookings')
          .insert({
            room_id: bookingRoom.id,
            customer_id: customerId,
            check_in_date: bookingCheckIn,
            check_out_date: dbCheckOut,
            check_in_time: bookingCheckInTime,
            check_out_time: bookingCheckOutTime,
            total_price: totalPrice,
            status: 'pending'
          })
          .select()
          .single();

        if (bookingInsErr) throw new Error("Could not create reservation: " + bookingInsErr.message);

        await supabase.from('activity_logs').insert({
          user_name: 'Guest Customer',
          action: 'Room Reservation Created',
          details: `Room ${bookingRoom.room_number} booked for ${guestName} (${bookingCheckIn} at ${bookingCheckInTime} → ${bookingCheckOut} at ${bookingCheckOutTime})`
        });

        setBookingSuccess(booking.id);
      } catch (err: any) {
        setBookingError(err.message || 'An unexpected error occurred during booking.');
      } finally {
        setBookingSubmitting(false);
      }
      return;
    }

    setBookingSubmitting(true);
    setBookingError(null);

    // Re-check for date conflicts before submitting
    const conflict = checkDateConflict(bookingRoom.id, bookingCheckIn, bookingCheckOut);
    if (conflict) {
      setBookingError(`This room is already reserved ${conflict.check_in_date} → ${conflict.check_out_date}. Please choose different dates.`);
      setBookingSubmitting(false);
      return;
    }

    try {
      // 1. Enter customer or check if they exist
      // In a cleaner edge-less flow, we can upsert or check for unique email.
      // Since email has UNIQUE constraint, let's select customer first:
      const { data: existingCust, error: custFetchErr } = await supabase
        .from('customers')
        .select('*')
        .eq('email', guestEmail.trim().toLowerCase())
        .maybeSingle();

      let customerId = '';
      if (existingCust) {
        customerId = existingCust.id;
      } else {
        const { data: newCust, error: custInsErr } = await supabase
          .from('customers')
          .insert({
            full_name: guestName.trim(),
            email: guestEmail.trim().toLowerCase(),
            phone: guestPhone.trim()
          })
          .select()
          .single();

        if (custInsErr) throw new Error("Could not register your profile: " + custInsErr.message);
        customerId = newCust.id;
      }

      // 2. Insert booking state (ensure check_out > check_in for DB constraint)
      const totalPrice = getCalculatedTotal();
      const dbCheckOut = getDbCheckOutDate(bookingCheckIn, bookingCheckOut);
      const { data: booking, error: bookingInsErr } = await supabase
        .from('bookings')
        .insert({
          room_id: bookingRoom.id,
          customer_id: customerId,
          check_in_date: bookingCheckIn,
          check_out_date: dbCheckOut,
          check_in_time: bookingCheckInTime,
          check_out_time: bookingCheckOutTime,
          total_price: totalPrice,
          status: 'pending'
        })
        .select()
        .single();

      if (bookingInsErr) throw new Error("Could not create reservation: " + bookingInsErr.message);

      // Log the new reservation for staff to action
      await supabase.from('activity_logs').insert({
        user_name: 'Guest Customer',
        action: 'Room Reservation Created',
        details: `Room ${bookingRoom.room_number} booked for ${guestName} (${bookingCheckIn} at ${bookingCheckInTime} → ${bookingCheckOut} at ${bookingCheckOutTime})`
      });

      setBookingSuccess(booking.id);

    } catch (err: any) {
      setBookingError(err.message || 'An unexpected error occurred during booking.');
    } finally {
      setBookingSubmitting(false);
    }
  };

  return (
    <div className="bg-surface-50 min-h-screen text-surface-800 selection:bg-brand-100 selection:text-brand-900">
      
      {/* Dynamic Announcement Banner */}
      {settings.announcement.enabled && settings.announcement.text && (
        <div className={`py-2 px-6 text-center text-[11px] font-mono tracking-wide flex items-center justify-center gap-2 transition-all duration-300 shadow-sm ${
          settings.announcement.type === 'promo' 
            ? 'bg-brand-600 text-white' 
            : settings.announcement.type === 'info' 
            ? 'bg-surface-900 text-surface-100' 
            : 'bg-amber-500 text-surface-950 font-semibold'
        }`}>
          <span>{settings.announcement.text}</span>
          <span className="text-[9px] px-1.5 py-0.5 bg-white/20 rounded font-sans tracking-tight font-bold uppercase tracking-wider">NOTICE</span>
        </div>
      )}

      {/* 1. HEADER NAV */}
      <header className={`sticky top-0 bg-white/95 backdrop-blur-md z-40 border-b border-surface-100 transition-shadow duration-300 ${
          scrolled ? 'shadow-lg shadow-surface-900/5' : 'shadow-sm'
        }`}>
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => onNavigate('landing')}>
            <span className="p-2 bg-gradient-to-br from-brand-500 to-brand-700 text-white rounded-lg font-bold text-lg font-mono">GH</span>
            <div>
              <span className="text-xl font-semibold tracking-tight text-surface-900 font-sans tracking-tight">Hotel Groups</span>
              <span className="text-[10px] block font-mono text-brand-600 tracking-wider font-semibold uppercase -mt-1">Resort & Spa</span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-surface-600">
            <a href="#rooms" className="hover:text-brand-600 transition-colors">Our Suites</a>
            <a href="#services" className="hover:text-brand-600 transition-colors">Resort Services</a>
            <a href="#testimonials" className="hover:text-brand-600 transition-colors">Reviews</a>
            <a href="#contact" className="hover:text-brand-600 transition-colors">Contact</a>
          </nav>

          <div className="flex items-center gap-3">
            {userSession ? (
              <div className="flex items-center gap-3">
                {userProfile?.role === 'guest' ? (
                  <button
                    onClick={() => onNavigate('guest-dashboard')}
                    className="px-4 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition-all rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <CalendarDays className="w-3.5 h-3.5" />
                    <span>My Reservations</span>
                  </button>
                ) : (
                  <button 
                    onClick={() => onNavigate(userProfile?.role === 'admin' ? 'admin-dashboard' : 'employee-dashboard')}
                    className="px-4 py-2 bg-brand-50 border border-brand-200 text-brand-700 hover:bg-brand-100 transition-all rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{userProfile?.role === 'admin' ? 'Admin Portal' : 'Staff Room'}</span>
                  </button>
                )}
                <button 
                  onClick={onLogout}
                  className="text-xs text-surface-500 hover:text-surface-800 underline font-medium transition-colors cursor-pointer"
                >
                  Log Out
                </button>
              </div>
            ) : (
              <button
                onClick={() => onNavigate('login')}
                className="px-4 py-2 bg-white border border-surface-200 text-surface-700 hover:bg-surface-50 hover:text-brand-600 hover:border-brand-200 transition-all rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 2. HERO BANNER */}
      <section className="relative bg-surface-900 text-white overflow-hidden py-24 md:py-36">
        {/* Background image overlay */}
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1600&q=80" 
            alt="Amalfi Coast Hotel" 
            className="w-full h-full object-cover opacity-55 saturate-125"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-surface-900 via-surface-900/40 to-transparent" />
        </div>

        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-brand-500/20 border border-brand-500/30 text-brand-400 rounded-full text-xs font-semibold tracking-wider uppercase mb-6">
              <Compass className="w-3.5 h-3.5 animate-spin-slow text-brand-400" /> Timeless Cliffside Splendor
            </span>
            <h1 className="text-4xl md:text-6xl font-semibold tracking-tight text-white mb-6 uppercase leading-tight font-sans tracking-tight">
              Ocean luxury elevated
            </h1>
            <p className="text-lg text-surface-200/90 max-w-2xl mx-auto font-sans tracking-tight font-light leading-relaxed mb-12">
              Unrivalled privacy, cliffside saltwater infinity pools, and elegant Amalfi coastline horizons. Crafting life's most beautiful memories on Italy's lemon coast.
            </p>
          </motion.div>

          {/* Quick Real-Time Booking Bar */}
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="bg-white/95 backdrop-blur-md rounded-2xl border border-surface-100 p-4 md:p-6 shadow-2xl text-surface-800 max-w-3xl mx-auto"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-left text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-brand-500" /> Check In
                </label>
                <input 
                  type="date" 
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full bg-surface-50 border border-surface-200 rounded-lg p-2.5 text-xs font-semibold text-surface-800 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500"
                />
              </div>
              <div>
                <label className="block text-left text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-brand-500" /> Check Out
                </label>
                <input 
                  type="date" 
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                  min={checkIn || new Date().toISOString().split('T')[0]}
                  className="w-full bg-surface-50 border border-surface-200 rounded-lg p-2.5 text-xs font-semibold text-surface-800 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500"
                />
              </div>
              <div>
                <label className="block text-left text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Users className="w-3 h-3 text-brand-500" /> Guests
                </label>
                <select 
                  value={guests}
                  onChange={(e) => setGuests(e.target.value)}
                  className="w-full bg-surface-50 border border-surface-200 rounded-lg p-2.5 text-xs font-semibold text-surface-800 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 h-[38px] cursor-pointer"
                >
                  <option value="1">1 Guest</option>
                  <option value="2">2 Guests</option>
                  <option value="3">3 Guests</option>
                  <option value="4">4 Guests</option>
                  <option value="6">6 Guests</option>
                </select>
              </div>
            </div>
            <div className="text-center mt-3">
              <span className="text-[10px] text-surface-400 font-medium tracking-wide">Select dates above to filter availability — then browse our suites below</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* 3. FEATURED ROOMS FROM SUPABASE */}
      <section id="rooms" className="py-24 max-w-7xl mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-4">
          <div>
            <span className="text-xs font-bold text-brand-600 tracking-wider uppercase font-mono">Exclusive Sanctuary</span>
            <h2 className="text-3xl md:text-4xl font-semibold text-surface-900 tracking-tight mt-1">Our Featured Suites</h2>
            <p className="text-sm text-surface-500 mt-2 max-w-md">Each residential layout is crafted meticulously with private amenities and sweeping Mediterranean ocean sights.</p>
          </div>

          {/* Filter Categories */}
          <div className="flex flex-wrap gap-2">
            {['All', ...settings.layoutCategories].map((category) => (
              <button
                key={category}
                onClick={() => setSelectedType(category)}
                className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                  selectedType === category 
                    ? 'bg-surface-900 border-surface-900 text-white shadow-md' 
                    : 'bg-white border-surface-200 text-surface-600 hover:text-surface-900 hover:bg-surface-50'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* LOADING SKELETON */}
        {loadingRooms ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-surface-150 overflow-hidden animate-pulse">
                <div className="h-48 bg-surface-200" />
                <div className="p-5 space-y-3">
                  <div className="h-4 bg-surface-200 rounded w-1/3" />
                  <div className="h-5 bg-surface-200 rounded" />
                  <div className="h-4 bg-surface-200 rounded w-5/6" />
                  <div className="pt-4 border-t border-surface-100 flex justify-between">
                    <div className="h-6 bg-surface-200 rounded w-1/4" />
                    <div className="h-8 bg-surface-200 rounded w-1/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredRooms.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-surface-100 p-8 max-w-md mx-auto">
            <Compass className="w-10 h-10 text-surface-300 mx-auto mb-4" />
            <h3 className="text-base font-semibold text-surface-800">No rooms match your filter criteria</h3>
            <p className="text-xs text-surface-400 mt-1">Please adjust your check-in dates or decrease target number of guest occupancy.</p>
            <button 
              onClick={() => { setSelectedType('All'); setGuests('2'); }}
              className="mt-4 px-4 py-2 bg-surface-900 text-white rounded-lg text-xs font-semibold hover:bg-surface-800 transition-all cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {filteredRooms.map((room) => (
              <div 
                key={room.id}
                className="bg-white rounded-2xl border border-surface-100 shadow-sm overflow-hidden group hover:shadow-md hover:border-brand-100 transition-all flex flex-col justify-between"
              >
                <div className="relative h-48 overflow-hidden bg-surface-100">
                  <img 
                    src={room.image_url || ''} 
                    alt={room.room_number}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
                  
                  {/* Status + Min Stay Tags */}
                  <div className="absolute top-4 left-4 right-4 flex items-start justify-between gap-2">
                    <span className={`px-2.5 py-1 text-[9px] font-extrabold uppercase rounded-full tracking-wider shadow-sm ${
                      room.status === 'available' 
                        ? 'bg-emerald-50/90 backdrop-blur-sm text-emerald-700 border border-emerald-200/60' 
                        : room.status === 'booked' 
                        ? 'bg-blue-50/90 backdrop-blur-sm text-blue-700 border border-blue-200/60'
                        : 'bg-surface-100/90 backdrop-blur-sm text-surface-600 border border-surface-200/60'
                    }`}>
                      {room.status === 'available' ? 'Open' : room.status}
                    </span>
                    <span className="text-[9px] font-mono font-semibold text-white bg-black/40 backdrop-blur-sm border border-white/15 px-2 py-1 rounded-full">
                      Min {(room.min_stay_hours || settings.minStayHours || 3)}h
                    </span>
                  </div>
                </div>

                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between text-surface-400 text-xs font-medium mb-1">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3 text-brand-500" /> {room.max_occupancy} {room.max_occupancy === 1 ? 'guest' : 'guests'}
                      </span>
                      <span className="font-mono text-surface-400 text-[11px]">#{room.room_number}</span>
                    </div>

                    <h3 className="text-base font-semibold text-surface-900 group-hover:text-brand-600 transition-colors">
                      {room.type}
                    </h3>
                    <p className="text-xs text-surface-500 mt-1.5 leading-relaxed line-clamp-2">
                      {room.description}
                    </p>
                  </div>

                  <div className="pt-4 mt-4 border-t border-surface-100">
                    <div className="flex items-baseline justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-lg font-bold text-surface-900 font-sans tracking-tight">
                            {settings.currencySymbol}{room.price_per_hour}
                          </span>
                          <span className="text-[10px] text-surface-400 font-medium">/hr</span>
                        </div>
                        <div className="text-[10px] text-surface-400">
                          {settings.currencySymbol}{(room.price_per_hour * 24).toFixed(2)} /night
                        </div>
                      </div>

                      <button
                        onClick={() => handleOpenBooking(room)}
                        disabled={room.status !== 'available'}
                        className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                          room.status === 'available'
                            ? 'bg-brand-600 text-white hover:bg-brand-700 hover:shadow-md hover:shadow-brand-600/20'
                            : 'bg-surface-100 text-surface-400 cursor-not-allowed'
                        }`}
                      >
                        <span>{room.status === 'available' ? 'Reserve' : 'Reserved'}</span>
                        {room.status === 'available' && <ArrowRight className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 4. HOTEL SERVICES */}
      <section id="services" className="bg-white py-24 border-y border-surface-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-xl mx-auto mb-16">
            <span className="text-xs font-bold text-brand-600 tracking-wider uppercase font-mono">Amalfi Shoreline Experiences</span>
            <h2 className="text-3xl font-semibold text-surface-900 tracking-tight mt-1">Immersive Resort Offerings</h2>
            <p className="text-sm text-surface-500 mt-2">Delicate services crafted to evoke pristine peace and authentic Italian elegance during your stay.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-6 border border-surface-100 rounded-2xl bg-surface-50 flex items-start gap-4">
              <div className="p-3.5 bg-brand-500/10 text-brand-600 rounded-xl flex-shrink-0">
                <Coffee className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-surface-900 text-base mb-1">Cliff-Front Dining</h3>
                <p className="text-xs text-surface-500 leading-relaxed">
                  Start your Amalfi morning on our elevated terrace overlooking the water, featuring regional lemon preserves and Michelin starred pastries.
                </p>
              </div>
            </div>

            <div className="p-6 border border-surface-100 rounded-2xl bg-surface-50 flex items-start gap-4">
              <div className="p-3.5 bg-brand-500/10 text-brand-600 rounded-xl flex-shrink-0">
                <Star className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-surface-900 text-base mb-1">Saltwater Wellness</h3>
                <p className="text-xs text-surface-500 leading-relaxed">
                  Access therapeutic seaweed treatments and signature dual massage rituals alongside private cliff-perched infinity jacuzzi loops.
                </p>
              </div>
            </div>

            <div className="p-6 border border-surface-100 rounded-2xl bg-surface-50 flex items-start gap-4">
              <div className="p-3.5 bg-brand-500/10 text-brand-600 rounded-xl flex-shrink-0">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-surface-900 text-base mb-1">Private Charter Trips</h3>
                <p className="text-xs text-surface-500 leading-relaxed">
                  Embark on historic Positano sunset sail tours directly from our privately guarded deck with specialized personal skipper setups.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. GUEST TESTIMONIALS */}
      <section id="testimonials" className="py-24 max-w-7xl mx-auto px-6">
        <div className="text-center max-w-xl mx-auto mb-16">
          <span className="text-xs font-bold text-brand-600 tracking-wider uppercase font-mono">Echoes of Grandeur</span>
          <h2 className="text-3xl font-semibold text-surface-900 tracking-tight mt-1">Sought-after Chronicles</h2>
          <p className="text-sm text-surface-500 mt-2">Hear directly from returning luxury travelers about our Amalfi hospitality.</p>
        </div>

        {loadingTestimonials ? (
          <div className="grid md:grid-cols-3 gap-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-surface-100 p-6 animate-pulse space-y-4">
                <div className="flex gap-1"><div className="h-4 bg-surface-200 rounded w-1/4" /></div>
                <div className="h-16 bg-surface-200 rounded" />
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-surface-200 rounded-full" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-4 bg-surface-200 rounded w-1/2" />
                    <div className="h-3 bg-surface-200 rounded w-1/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : testimonials.length === 0 ? (
          <div className="text-center py-12 text-surface-400 text-xs">
            No dynamic guest stories registered yet.
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((test) => (
              <div 
                key={test.id} 
                className="bg-white rounded-2xl border border-surface-100 p-8 shadow-sm flex flex-col justify-between relative"
              >
                <div>
                  <div className="flex items-center gap-0.5 mb-4 text-brand-400">
                    {Array.from({ length: test.rating }).map((_, rIdx) => (
                      <Star key={rIdx} className="w-4 h-4 fill-brand-400 text-brand-400" />
                    ))}
                  </div>
                  <p className="text-surface-600 text-sm leading-relaxed italic mb-6">
                    "{test.comment}"
                  </p>
                </div>
                
                <div className="flex items-center gap-3 pt-4 border-t border-surface-50">
                  <img 
                    src={test.avatar_url || 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&h=80&w=80&q=80'} 
                    alt={test.customer_name}
                    className="w-10 h-10 rounded-full object-cover border border-surface-100 flex-shrink-0"
                  />
                  <div>
                    <h4 className="font-semibold text-surface-900 text-xs">{test.customer_name}</h4>
                    <span className="text-[10px] text-surface-400">{test.role_or_title}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 6. CONTACT & FOOTER */}
      <section id="contact" className="bg-surface-900 text-surface-350 py-20 border-t border-surface-800">
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-12">
          <div>
            <span className="text-xs font-bold text-brand-400 tracking-wider uppercase font-mono">Get in Touch</span>
            <h2 className="text-3xl font-semibold text-white mt-1 tracking-tight">Begin Your Amalfi Story</h2>
            <p className="text-sm text-surface-400 mt-3 leading-relaxed max-w-md">
              Should you have specific requests regarding yacht charters, private terrace setups, or customized menu curation, our cliffside concierge desk is ready to respond.
            </p>

            <div className="space-y-4 mt-8 text-sm text-surface-300">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-surface-800 flex items-center justify-center text-brand-450">
                  <Phone className="w-4 h-4 text-brand-400" />
                </div>
                <span>+39 089 123456 (Concierge desk)</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-surface-800 flex items-center justify-center text-brand-450">
                  <Mail className="w-4 h-4 text-brand-400" />
                </div>
                <span>concierge@grandhorizonamalfi.it</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-surface-800 flex items-center justify-center text-brand-450">
                  <MapPin className="w-4 h-4 text-brand-400" />
                </div>
                <span>108 Luxury Coastline Drive, Amalfi, Italy</span>
              </div>
            </div>
          </div>

          <div className="bg-surface-850 rounded-xl p-6 border border-surface-800">
            <h3 className="text-white text-base font-semibold mb-4">Request Callback</h3>
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!conciergeName.trim() || !conciergeEmail.trim()) return;
              setConciergeSubmitting(true);
              try {
                const { error } = await supabase.from('contact_messages').insert({
                  name: conciergeName.trim(),
                  email: conciergeEmail.trim(),
                  phone: conciergePhone.trim() || null,
                  subject: conciergeSubject.trim() || null,
                  message: conciergeMessage.trim() || null,
                });
                if (error) throw error;
                setConciergeSuccess(true);
                setConciergeName('');
                setConciergeEmail('');
                setConciergePhone('');
                setConciergeSubject('');
                setConciergeMessage('');
              } catch (err) {
                // console.error('Failed to send message:', err);
              } finally {
                setConciergeSubmitting(false);
              }
            }} className="space-y-4 text-xs">
              <div>
                <label className="block text-surface-400 text-[10px] uppercase font-bold tracking-wider mb-1">Full Name</label>
                <input 
                  type="text" 
                  required
                  value={conciergeName}
                  onChange={(e) => setConciergeName(e.target.value)}
                  placeholder="e.g. Penelope Cruz"
                  className="w-full bg-surface-800/80 border border-surface-700/80 rounded-lg p-3 text-white focus:outline-none focus:border-brand-500 font-sans tracking-tight"
                />
              </div>
              <div>
                <label className="block text-surface-400 text-[10px] uppercase font-bold tracking-wider mb-1">Email Address</label>
                <input 
                  type="email" 
                  required
                  value={conciergeEmail}
                  onChange={(e) => setConciergeEmail(e.target.value)}
                  placeholder="e.g. penelope@luxuryguest.com"
                  className="w-full bg-surface-800/80 border border-surface-700/80 rounded-lg p-3 text-white focus:outline-none focus:border-brand-500"
                />
              </div>
              <div>
                <label className="block text-surface-400 text-[10px] uppercase font-bold tracking-wider mb-1">Phone Number</label>
                <input 
                  type="tel"
                  value={conciergePhone}
                  onChange={(e) => setConciergePhone(e.target.value)}
                  placeholder="e.g. +39 089 123456"
                  className="w-full bg-surface-800/80 border border-surface-700/80 rounded-lg p-3 text-white focus:outline-none focus:border-brand-500 font-sans"
                />
              </div>
              <div>
                <label className="block text-surface-400 text-[10px] uppercase font-bold tracking-wider mb-1">Subject</label>
                <input 
                  type="text"
                  value={conciergeSubject}
                  onChange={(e) => setConciergeSubject(e.target.value)}
                  placeholder="e.g. Honeymoon Package Inquiry"
                  className="w-full bg-surface-800/80 border border-surface-700/80 rounded-lg p-3 text-white focus:outline-none focus:border-brand-500 font-sans"
                />
              </div>
              <div>
                <label className="block text-surface-400 text-[10px] uppercase font-bold tracking-wider mb-1">Message</label>
                <textarea
                  rows={3}
                  value={conciergeMessage}
                  onChange={(e) => setConciergeMessage(e.target.value)}
                  placeholder="Tell us how we can make your stay unforgettable..."
                  className="w-full bg-surface-800/80 border border-surface-700/80 rounded-lg p-3 text-white focus:outline-none focus:border-brand-500 font-sans resize-none"
                />
              </div>
              {conciergeSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-lg text-xs leading-relaxed font-sans tracking-tight">
                  Concierge notified successfully! A member of our team will respond shortly.
                </div>
              )}
              <button 
                type="submit" 
                disabled={conciergeSubmitting}
                className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-semibold transition-all shadow-md shadow-brand-600/10 cursor-pointer disabled:opacity-50"
              >
                {conciergeSubmitting ? 'Sending...' : 'Send Request'}
              </button>
            </form>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 mt-16 pt-8 border-t border-surface-800 text-center text-xs text-surface-500 font-mono">
          © {new Date().getFullYear()} Hotel Groups Resort & Spa. Real-Time Supabase Integration. All rights reserved.
        </div>
      </section>

      {/* 7. CHECKOUT RESERVATION MODAL */}
      <AnimatePresence>
        {bookingRoom && (
          <div className="fixed inset-0 bg-surface-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl border border-surface-100 max-w-lg w-full overflow-hidden relative"
              onClick={e => e.stopPropagation()}
            >
              <button 
                onClick={() => setBookingRoom(null)}
                className="absolute top-4 right-4 p-2 text-surface-400 hover:text-surface-600 rounded-full hover:bg-surface-50 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="p-6 md:p-8">
                {bookingSuccess ? (
                  /* Booking success message */
                  <div className="text-center py-6">
                    <div className="w-12 h-12 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Check className="w-6 h-6" />
                    </div>
                    <h3 className="text-xl font-bold text-surface-900">Sweet Horizons Await!</h3>
                    <p className="text-xs text-surface-500 mt-2 max-w-xs mx-auto">
                      Your Mediterranean booking for the <strong>{bookingRoom.type} (Suite {bookingRoom.room_number})</strong> has been registered successfully on our servers.
                    </p>
                    
                    <div className="mt-6 border border-brand-100 bg-brand-50/55 rounded-xl p-4 text-left space-y-2 text-xs text-surface-700 font-mono">
                      <div className="font-bold border-b border-brand-100 pb-1 text-surface-900 flex justify-between items-center">
                        <span>Invoice Summary</span>
                        <span className="flex items-center gap-2">
                          <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${
                            getBillingMode() === 'hourly' 
                              ? 'bg-amber-100 text-amber-700 border border-amber-200' 
                              : 'bg-blue-100 text-blue-700 border border-blue-200'
                          }`}>
                            {getBillingMode() === 'hourly' ? 'Hourly' : 'Nightly'}
                          </span>
                          <span className="text-[10px] uppercase text-brand-700">Pending Staff Check</span>
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Booking Code:</span>
                        <span className="text-surface-900 font-semibold">{bookingSuccess.substring(0, 8)}...</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Check In:</span>
                        <span className="text-surface-900 font-semibold">{bookingCheckIn} · {bookingCheckInTime}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Check Out:</span>
                        <span className="text-surface-900 font-semibold">{bookingCheckOut} · {bookingCheckOutTime}</span>
                      </div>
                      <div className="flex justify-between text-surface-500 border-t border-brand-100 pt-1">
                        <span>Duration:</span>
                        <span>{getBookingHours()} {getBillingMode() === 'hourly' ? 'hours' : `hours (${getBookingNights()} nights)`}</span>
                      </div>
                      <div className="flex justify-between font-bold pt-1 border-t border-brand-100 text-surface-900">
                        <span>Total Charged:</span>
                        <span>{settings.currencySymbol}{getCalculatedTotal().toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="mt-8 flex gap-3">
                      <button
                        onClick={() => setBookingRoom(null)}
                        className="flex-1 py-2.5 border border-surface-200 hover:bg-surface-50 rounded-lg text-surface-700 font-semibold text-xs transition-colors cursor-pointer"
                      >
                        Dismiss
                      </button>
                      <button
                        onClick={() => {
                          setBookingRoom(null);
                          onNavigate('guest-dashboard');
                        }}
                        className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-all shadow-md shadow-emerald-600/10 cursor-pointer"
                      >
                        View My Reservations
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Form to enter details */
                  <div>
                    <span className="text-[10px] font-bold text-brand-600 tracking-wider uppercase font-mono">Direct Mediterranean Booking</span>
                    <h3 className="text-lg font-bold text-surface-900">Confirm Reservation</h3>
                    <p className="text-xs text-surface-400 mt-0.5 mb-6">Suite {bookingRoom.room_number} • {bookingRoom.type}</p>

                    <form onSubmit={handleBookingSubmit} className="space-y-4 text-xs font-sans tracking-tight">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-surface-500 font-semibold mb-1">Check In</label>
                          <input 
                            type="date"
                            required
                            value={bookingCheckIn}
                            onChange={(e) => {
                              const val = e.target.value;
                              setBookingCheckIn(val);
                              // Auto-adjust times if dates became same-day (use inline validation to avoid stale state)
                              if (val && bookingCheckOut && val === bookingCheckOut && bookingRoom) {
                                const minStay = bookingRoom.min_stay_hours || settings.minStayHours || 3;
                                const ciMin = timeToMinutes(bookingCheckInTime);
                                const minCoMin = ciMin + minStay * 60;
                                const validCheckOuts = (bookingRoom.check_out_times || []).filter(t => {
                                  const tMin = timeToMinutes(t);
                                  return minCoMin >= 1440 ? tMin >= minCoMin - 1440 : tMin >= minCoMin;
                                });
                                if (validCheckOuts.length > 0 && !validCheckOuts.includes(bookingCheckOutTime)) {
                                  setBookingCheckOutTime(validCheckOuts[0]);
                                }
                                const coMin = timeToMinutes(bookingCheckOutTime);
                                const maxCiMin = coMin - minStay * 60;
                                const validCheckIns = (bookingRoom.check_in_times || []).filter(t => {
                                  const tMin = timeToMinutes(t);
                                  return maxCiMin < 0 ? tMin <= maxCiMin + 1440 : tMin <= maxCiMin;
                                });
                                if (validCheckIns.length > 0 && !validCheckIns.includes(bookingCheckInTime)) {
                                  setBookingCheckInTime(validCheckIns[0]);
                                }
                              }
                              if (bookingRoom) {
                                const conflict = checkDateConflict(bookingRoom.id, val, bookingCheckOut);
                                setBookingDateConflict(conflict ? `This room is already reserved ${conflict.check_in_date} → ${conflict.check_out_date}. Please choose different dates.` : null);
                              }
                            }}
                            min={new Date().toISOString().split('T')[0]}
                            className="w-full bg-surface-50 border border-surface-200 rounded-lg p-2.5 font-sans tracking-tight"
                          />
                        </div>
                        <div>
                          <label className="block text-surface-500 font-semibold mb-1">Check Out</label>
                          <input 
                            type="date"
                            required
                            value={bookingCheckOut}
                            onChange={(e) => {
                              const val = e.target.value;
                              setBookingCheckOut(val);
                              // Auto-adjust times if dates became same-day (use inline validation to avoid stale state)
                              if (bookingCheckIn && val && bookingCheckIn === val && bookingRoom) {
                                const minStay = bookingRoom.min_stay_hours || settings.minStayHours || 3;
                                const ciMin = timeToMinutes(bookingCheckInTime);
                                const minCoMin = ciMin + minStay * 60;
                                const validCheckOuts = (bookingRoom.check_out_times || []).filter(t => {
                                  const tMin = timeToMinutes(t);
                                  return minCoMin >= 1440 ? tMin >= minCoMin - 1440 : tMin >= minCoMin;
                                });
                                if (validCheckOuts.length > 0 && !validCheckOuts.includes(bookingCheckOutTime)) {
                                  setBookingCheckOutTime(validCheckOuts[0]);
                                }
                                const coMin = timeToMinutes(bookingCheckOutTime);
                                const maxCiMin = coMin - minStay * 60;
                                const validCheckIns = (bookingRoom.check_in_times || []).filter(t => {
                                  const tMin = timeToMinutes(t);
                                  return maxCiMin < 0 ? tMin <= maxCiMin + 1440 : tMin <= maxCiMin;
                                });
                                if (validCheckIns.length > 0 && !validCheckIns.includes(bookingCheckInTime)) {
                                  setBookingCheckInTime(validCheckIns[0]);
                                }
                              }
                              if (bookingRoom) {
                                const conflict = checkDateConflict(bookingRoom.id, bookingCheckIn, val);
                                setBookingDateConflict(conflict ? `This room is already reserved ${conflict.check_in_date} → ${conflict.check_out_date}. Please choose different dates.` : null);
                              }
                            }}
                            min={bookingCheckIn || new Date().toISOString().split('T')[0]}
                            className="w-full bg-surface-50 border border-surface-200 rounded-lg p-2.5 font-sans tracking-tight"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-surface-500 font-semibold mb-1">Check-In Time</label>
                               <select
                            value={bookingCheckInTime}
                            onChange={(e) => {
                              const newTime = e.target.value;
                              setBookingCheckInTime(newTime);
                              // Auto-adjust check-out time if current becomes invalid
                              const validCheckOuts = getValidCheckOutTimes(newTime);
                              if (validCheckOuts.length > 0 && !validCheckOuts.includes(bookingCheckOutTime)) {
                                setBookingCheckOutTime(validCheckOuts[0]);
                              }
                            }}
                            className="w-full bg-surface-50 border border-surface-200 rounded-lg p-2.5 font-sans tracking-tight cursor-pointer"
                          >
                             {getValidCheckInTimes(bookingCheckOutTime).map(t => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-surface-500 font-semibold mb-1">Check-Out Time</label>
                          <select
                            value={bookingCheckOutTime}
                            onChange={(e) => {
                              const newTime = e.target.value;
                              setBookingCheckOutTime(newTime);
                              // Auto-adjust check-in time if current becomes invalid
                              const validCheckIns = getValidCheckInTimes(newTime);
                              if (validCheckIns.length > 0 && !validCheckIns.includes(bookingCheckInTime)) {
                                setBookingCheckInTime(validCheckIns[0]);
                              }
                            }}
                            className="w-full bg-surface-50 border border-surface-200 rounded-lg p-2.5 font-sans tracking-tight cursor-pointer"
                          >
                             {getValidCheckOutTimes(bookingCheckInTime).map(t => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-surface-500 font-semibold mb-1">Your Full Name</label>
                        <input 
                          type="text" 
                          required 
                          value={guestName}
                          onChange={(e) => setGuestName(e.target.value)}
                          placeholder="Penelope Cruz"
                          className="w-full bg-surface-50 border border-surface-200 rounded-lg p-3 text-surface-800"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-surface-500 font-semibold mb-1">Email Address</label>
                          <input 
                            type="email" 
                            required 
                            value={guestEmail}
                            onChange={(e) => setGuestEmail(e.target.value)}
                            placeholder="penelope@luxuryguest.com"
                            className="w-full bg-surface-50 border border-surface-200 rounded-lg p-3 text-surface-800"
                          />
                        </div>
                        <div>
                          <label className="block text-surface-500 font-semibold mb-1">Contact Phone</label>
                          <input 
                            type="tel" 
                            required 
                            value={guestPhone}
                            onChange={(e) => setGuestPhone(e.target.value)}
                            placeholder="+39 089 123456"
                            className="w-full bg-surface-50 border border-surface-200 rounded-lg p-3 text-surface-800"
                          />
                        </div>
                      </div>

                      {/* Display checkout calculation */}
                      <div className="bg-surface-50 rounded-xl p-4 border border-surface-100 mt-4">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[10px] text-surface-400 font-semibold uppercase">Invoice Estimation</p>
                          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                            getBillingMode() === 'hourly' 
                              ? 'bg-amber-100 text-amber-700 border border-amber-200' 
                              : 'bg-blue-100 text-blue-700 border border-blue-200'
                          }`}>
                            {getBillingMode() === 'hourly' ? 'Hourly' : 'Nightly'} Billing
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            {getBillingMode() === 'hourly' ? (
                              <p className="text-surface-600 font-medium text-xs">
                                {settings.currencySymbol}{bookingRoom.price_per_hour} / hr × {getBookingHours()} hrs
                              </p>
                            ) : (
                              <p className="text-surface-600 font-medium text-xs">
                                {settings.currencySymbol}{(bookingRoom.price_per_hour * 24).toFixed(2)} / night × {getBookingNights()} {getBookingNights() === 1 ? 'night' : 'nights'}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-surface-900">{settings.currencySymbol}{getCalculatedTotal().toFixed(2)}</p>
                          </div>
                        </div>
                      </div>

                      {bookingDateConflict && (
                        <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs flex items-center gap-2">
                          <Calendar className="w-4 h-4 flex-shrink-0" />
                          <span>{bookingDateConflict}</span>
                        </div>
                      )}

                      {bookingError && (
                        <div className="p-3 bg-rose-50 border border-rose-100 text-rose-700 rounded-lg text-xs">
                          {bookingError}
                        </div>
                      )}

                      <div className="flex gap-3 pt-4">
                        <button
                          type="button"
                          onClick={() => setBookingRoom(null)}
                          className="flex-1 py-3 border border-surface-200 hover:bg-surface-50 rounded-lg text-surface-700 font-semibold transition-colors cursor-pointer text-center"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={bookingSubmitting || !!bookingDateConflict}
                          className={`flex-1 py-3 rounded-lg font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-md ${
                            bookingSubmitting || bookingDateConflict
                              ? 'bg-surface-300 text-surface-500 cursor-not-allowed shadow-none'
                              : 'bg-brand-600 hover:bg-brand-700 text-white shadow-brand-600/10'
                          }`}
                        >
                          {bookingSubmitting ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Filing Order...</span>
                            </>
                          ) : (
                            <>
                              <span>Submit Booking</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
