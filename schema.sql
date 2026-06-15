-- ==========================================
-- LINK FORTRESS IT SOLUTIONS - SUPABASE SCHEMA MIGRATION
-- Safe to re-run: uses IF NOT EXISTS throughout
-- Does NOT drop tables
-- ==========================================

-- 1. CREATE TABLES (idempotent)
CREATE TABLE IF NOT EXISTS public.hotels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    phone TEXT NOT NULL,
    rating NUMERIC(2,1) NOT NULL DEFAULT 5.0,
    description TEXT,
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'employee', 'front_desk', 'cook', 'cleaner', 'staff', 'waiter', 'guest')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id UUID REFERENCES public.hotels(id) ON DELETE CASCADE NOT NULL,
    room_number TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    description TEXT NOT NULL,
    price_per_hour NUMERIC(10,2) NOT NULL CHECK (price_per_hour > 0),
    max_occupancy INTEGER NOT NULL CHECK (max_occupancy > 0),
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'booked', 'reserved', 'cleaning', 'maintenance')),
    image_url TEXT,
    check_in_times TEXT[] NOT NULL DEFAULT '{"2:00 PM","3:00 PM","4:00 PM"}',
    check_out_times TEXT[] NOT NULL DEFAULT '{"10:00 AM","11:00 AM","12:00 PM"}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID REFERENCES public.rooms(id) ON DELETE RESTRICT NOT NULL,
    customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
    check_in_date DATE NOT NULL,
    check_out_date DATE NOT NULL,
    check_in_time TEXT NOT NULL DEFAULT '2:00 PM',
    check_out_time TEXT NOT NULL DEFAULT '11:00 AM',
    total_price NUMERIC(10,2) NOT NULL CHECK (total_price >= 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'checked-in', 'completed', 'cancelled')),
    assigned_employee_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT check_booking_dates CHECK (check_out_date > check_in_date),
    CONSTRAINT check_in_not_past CHECK (check_in_date >= CURRENT_DATE)
);

CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    assigned_employee_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in-progress', 'completed')),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.testimonials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_name TEXT NOT NULL,
    role_or_title TEXT NOT NULL,
    comment TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    user_name TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.hotel_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.menu_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID REFERENCES public.menu_categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    stock_quantity NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    unit TEXT NOT NULL DEFAULT 'piece',
    low_stock_threshold NUMERIC(10,2) NOT NULL DEFAULT 5,
    image_url TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.guest_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE NOT NULL,
    item_id UUID REFERENCES public.inventory_items(id) ON DELETE RESTRICT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
    total_price NUMERIC(10,2) NOT NULL CHECK (total_price >= 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'preparing', 'served', 'cancelled')),
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Miscellaneous charges for bookings (late checkout, damages, etc.)
CREATE TABLE IF NOT EXISTS public.booking_charges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE NOT NULL,
    description TEXT NOT NULL,
    amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Payment records for bookings
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE NOT NULL,
    amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
    method TEXT NOT NULL,
    reference TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Chat messages for guest-to-front-desk communication
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE NOT NULL,
    sender_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    sender_name TEXT NOT NULL,
    sender_role TEXT NOT NULL CHECK (sender_role IN ('guest', 'staff')),
    message TEXT NOT NULL,
    seen_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Typing indicators for chat (ephemeral — each user writes their status)
CREATE TABLE IF NOT EXISTS public.chat_typing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    user_name TEXT NOT NULL,
    user_role TEXT NOT NULL CHECK (user_role IN ('guest', 'staff')),
    is_typing BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(booking_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.staff_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE NOT NULL,
    guest_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    guest_name TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'responded', 'completed', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    responded_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS public.stay_extensions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE NOT NULL,
    requested_check_out_date DATE NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

-- Guest contact/inquiry messages (from landing page contact form)
CREATE TABLE IF NOT EXISTS public.contact_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    subject TEXT,
    message TEXT NOT NULL,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Employee payroll settings (hourly rates per employee)
CREATE TABLE IF NOT EXISTS public.employee_payroll (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    hourly_rate NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0),
    overtime_rate NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (overtime_rate >= 0),
    pay_frequency TEXT NOT NULL DEFAULT 'weekly' CHECK (pay_frequency IN ('weekly', 'bi-weekly', 'monthly')),
    employment_type TEXT NOT NULL DEFAULT 'regular' CHECK (employment_type IN ('regular', 'probationary', 'contractual', 'seasonal')),
    hire_date DATE,
    tax_id TEXT DEFAULT '',
    bank_account TEXT DEFAULT '',
    remarks TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Time tracking entries (clock in/out)
CREATE TABLE IF NOT EXISTS public.time_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    clock_in TIMESTAMP WITH TIME ZONE NOT NULL,
    clock_out TIMESTAMP WITH TIME ZONE,
    total_hours NUMERIC(10,2) DEFAULT 0 CHECK (total_hours >= 0),
    is_overtime BOOLEAN NOT NULL DEFAULT false,
    notes TEXT DEFAULT '',
    approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Payroll periods (e.g., Week 1, February 2025)
CREATE TABLE IF NOT EXISTS public.payroll_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'cancelled')),
    processed_at TIMESTAMP WITH TIME ZONE,
    processed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    notes TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT check_period_dates CHECK (end_date > start_date)
);

-- Payroll entries (per employee per period)
CREATE TABLE IF NOT EXISTS public.payroll_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_id UUID REFERENCES public.payroll_periods(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    total_regular_hours NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (total_regular_hours >= 0),
    total_overtime_hours NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (total_overtime_hours >= 0),
    hourly_rate NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0),
    overtime_rate NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (overtime_rate >= 0),
    gross_pay NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (gross_pay >= 0),
    deductions NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (deductions >= 0),
    net_pay NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (net_pay >= 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'cancelled')),
    paid_at TIMESTAMP WITH TIME ZONE,
    notes TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(period_id, user_id)
);

-- 2. ADD NEW COLUMNS & RENAMES (migration-safe)
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS min_stay_hours INTEGER NOT NULL DEFAULT 3 CHECK (min_stay_hours > 0);
ALTER TABLE public.stay_extensions ADD COLUMN IF NOT EXISTS extend_type TEXT NOT NULL DEFAULT 'day' CHECK (extend_type IN ('day', 'hour'));
ALTER TABLE public.stay_extensions ADD COLUMN IF NOT EXISTS requested_hours INTEGER;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS check_in_time TEXT NOT NULL DEFAULT '2:00 PM';
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS check_out_time TEXT NOT NULL DEFAULT '11:00 AM';

-- Rename price_per_night to price_per_hour (for databases still on old schema)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='rooms' AND column_name='price_per_night') THEN
        ALTER TABLE public.rooms RENAME COLUMN price_per_night TO price_per_hour;
    END IF;
END $$;

-- Update users table CHECK constraint and default to include new roles (safe to re-run)
ALTER TABLE public.users ALTER COLUMN role SET DEFAULT 'staff';
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'employee', 'front_desk', 'cook', 'cleaner', 'staff', 'waiter', 'guest'));

ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS seen_at TIMESTAMP WITH TIME ZONE;

-- 3. ENABLE ROW LEVEL SECURITY (idempotent)
ALTER TABLE public.hotels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stay_extensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_payroll ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_entries ENABLE ROW LEVEL SECURITY;

-- 4. FUNCTIONS (idempotent via CREATE OR REPLACE)
-- NOTE: Defined BEFORE RLS policies so policy definitions can use these functions

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN SECURITY DEFINER SET search_path = public AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role FROM public.users WHERE id = auth.uid();
    IF user_role IS NULL THEN
        user_role := auth.jwt() -> 'app_metadata' ->> 'role';
    END IF;
    RETURN COALESCE(user_role = 'admin', false);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.my_role()
RETURNS TEXT SECURITY DEFINER SET search_path = public AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role FROM public.users WHERE id = auth.uid();
    IF user_role IS NULL THEN
        user_role := auth.jwt() -> 'app_metadata' ->> 'role';
    END IF;
    RETURN user_role;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.is_front_desk()
RETURNS BOOLEAN SECURITY DEFINER SET search_path = public AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role FROM public.users WHERE id = auth.uid();
    IF user_role IS NULL THEN
        user_role := auth.jwt() -> 'app_metadata' ->> 'role';
    END IF;
    RETURN COALESCE(user_role = 'front_desk', false);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER SECURITY DEFINER SET search_path = public AS $$
DECLARE
    user_role TEXT;
    requested_role TEXT;
    user_full_name TEXT;
BEGIN
    requested_role := COALESCE(new.raw_user_meta_data->>'role', '');
    IF (SELECT COUNT(*) FROM public.users) = 0 THEN
        -- Bootstrap admin only for the first account.
        user_role := 'admin';
    ELSIF requested_role IN ('staff', 'guest') THEN
        -- Public signups are limited to low-privilege roles.
        user_role := requested_role;
    ELSE
        user_role := 'staff';
    END IF;
    user_full_name := COALESCE(new.raw_user_meta_data->>'full_name', 'Hotel Colleague');

    INSERT INTO public.users (id, email, role, full_name)
    VALUES (new.id, new.email, user_role, user_full_name);

    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', user_role)
    WHERE id = new.id;

    RETURN new;
END;
$$ LANGUAGE plpgsql;

-- 5. ROW LEVEL SECURITY POLICIES (idempotent — uses pg_policies existence check)
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hotels' AND policyname='Hotels are viewable by everyone') THEN CREATE POLICY "Hotels are viewable by everyone" ON public.hotels FOR SELECT USING (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hotels' AND policyname='Hotels are manageable by admins') THEN CREATE POLICY "Hotels are manageable by admins" ON public.hotels FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin()); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='users' AND policyname='Users are viewable by authenticated') THEN CREATE POLICY "Users are viewable by authenticated" ON public.users FOR SELECT TO authenticated USING (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='users' AND policyname='Admins can manage user profiles') THEN CREATE POLICY "Admins can manage user profiles" ON public.users FOR ALL TO authenticated USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='users' AND policyname='Users can edit their own basic profile') THEN CREATE POLICY "Users can edit their own basic profile" ON public.users FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rooms' AND policyname='Rooms are viewable by public') THEN CREATE POLICY "Rooms are viewable by public" ON public.rooms FOR SELECT USING (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rooms' AND policyname='Admins have full rooms control') THEN CREATE POLICY "Admins have full rooms control" ON public.rooms FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin()); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rooms' AND policyname='Employees can update room status') THEN CREATE POLICY "Employees can update room status" ON public.rooms FOR UPDATE TO authenticated USING (public.my_role() IN ('admin', 'employee')) WITH CHECK (public.my_role() IN ('admin', 'employee')); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rooms' AND policyname='Front desk can update room status') THEN CREATE POLICY "Front desk can update room status" ON public.rooms FOR UPDATE TO authenticated USING (public.is_front_desk() OR public.is_admin()) WITH CHECK (public.is_front_desk() OR public.is_admin()); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='customers' AND policyname='Enable read/insert for public bookings') THEN CREATE POLICY "Enable read/insert for public bookings" ON public.customers FOR SELECT USING (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='customers' AND policyname='Enable insert for landing checkouts') THEN CREATE POLICY "Enable insert for landing checkouts" ON public.customers FOR INSERT WITH CHECK (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='customers' AND policyname='Authenticated users can manage customers') THEN CREATE POLICY "Authenticated users can manage customers" ON public.customers FOR ALL TO authenticated USING (true); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='bookings' AND policyname='Landing page can create bookings') THEN CREATE POLICY "Landing page can create bookings" ON public.bookings FOR INSERT WITH CHECK (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='bookings' AND policyname='View bookings for authenticated users') THEN CREATE POLICY "View bookings for authenticated users" ON public.bookings FOR SELECT TO authenticated USING (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='bookings' AND policyname='Manage all bookings for admins') THEN CREATE POLICY "Manage all bookings for admins" ON public.bookings FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin()); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='bookings' AND policyname='Manage assigned bookings for employees') THEN CREATE POLICY "Manage assigned bookings for employees" ON public.bookings FOR UPDATE TO authenticated USING (assigned_employee_id = auth.uid() OR public.is_admin()) WITH CHECK (assigned_employee_id = auth.uid() OR public.is_admin()); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tasks' AND policyname='Admins manage all tasks') THEN CREATE POLICY "Admins manage all tasks" ON public.tasks FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin()); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tasks' AND policyname='Employees view and edit assigned tasks') THEN CREATE POLICY "Employees view and edit assigned tasks" ON public.tasks FOR ALL TO authenticated USING (assigned_employee_id = auth.uid() OR public.is_admin()) WITH CHECK (assigned_employee_id = auth.uid() OR public.is_admin()); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tasks' AND policyname='Front desk can create tasks') THEN CREATE POLICY "Front desk can create tasks" ON public.tasks FOR INSERT TO authenticated WITH CHECK (public.is_front_desk() OR public.is_admin()); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tasks' AND policyname='Front desk can view tasks') THEN CREATE POLICY "Front desk can view tasks" ON public.tasks FOR SELECT TO authenticated USING (public.is_front_desk() OR public.is_admin()); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='testimonials' AND policyname='Testimonials viewable by everyone') THEN CREATE POLICY "Testimonials viewable by everyone" ON public.testimonials FOR SELECT USING (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='testimonials' AND policyname='Admins manage testimonials') THEN CREATE POLICY "Admins manage testimonials" ON public.testimonials FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin()); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='activity_logs' AND policyname='Activity logs viewable by authenticated') THEN CREATE POLICY "Activity logs viewable by authenticated" ON public.activity_logs FOR SELECT TO authenticated USING (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='activity_logs' AND policyname='Activity logs insertable by anyone') THEN CREATE POLICY "Activity logs insertable by anyone" ON public.activity_logs FOR INSERT WITH CHECK (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='activity_logs' AND policyname='Activity logs deletable by admins') THEN CREATE POLICY "Activity logs deletable by admins" ON public.activity_logs FOR DELETE TO authenticated USING (public.is_admin()); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hotel_settings' AND policyname='Hotel settings are viewable by everyone') THEN CREATE POLICY "Hotel settings are viewable by everyone" ON public.hotel_settings FOR SELECT USING (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hotel_settings' AND policyname='Authenticated users can manage hotel settings') THEN CREATE POLICY "Authenticated users can manage hotel settings" ON public.hotel_settings FOR ALL TO authenticated USING (true); END IF; END $$;

-- Menu categories: public read, authenticated write
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='menu_categories' AND policyname='Menu categories are viewable by everyone') THEN CREATE POLICY "Menu categories are viewable by everyone" ON public.menu_categories FOR SELECT USING (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='menu_categories' AND policyname='Menu categories are manageable by authenticated') THEN CREATE POLICY "Menu categories are manageable by authenticated" ON public.menu_categories FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF; END $$;

-- Inventory items: public read (for guest order menu), authenticated write
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='inventory_items' AND policyname='Inventory items are viewable by everyone') THEN CREATE POLICY "Inventory items are viewable by everyone" ON public.inventory_items FOR SELECT USING (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='inventory_items' AND policyname='Inventory items are manageable by authenticated') THEN CREATE POLICY "Inventory items are manageable by authenticated" ON public.inventory_items FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF; END $$;

-- Guest orders: authenticated read/write only
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='guest_orders' AND policyname='Guest orders are viewable by authenticated') THEN CREATE POLICY "Guest orders are viewable by authenticated" ON public.guest_orders FOR SELECT TO authenticated USING (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='guest_orders' AND policyname='Guest orders are manageable by authenticated') THEN CREATE POLICY "Guest orders are manageable by authenticated" ON public.guest_orders FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='booking_charges' AND policyname='Charges are manageable by authenticated') THEN CREATE POLICY "Charges are manageable by authenticated" ON public.booking_charges FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='payments' AND policyname='Payments are manageable by authenticated') THEN CREATE POLICY "Payments are manageable by authenticated" ON public.payments FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF; END $$;

-- Chat messages: authenticated read/write (guests and staff)
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='chat_messages' AND policyname='Chat messages viewable by authenticated') THEN CREATE POLICY "Chat messages viewable by authenticated" ON public.chat_messages FOR SELECT TO authenticated USING (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='chat_messages' AND policyname='Chat messages insertable by authenticated') THEN CREATE POLICY "Chat messages insertable by authenticated" ON public.chat_messages FOR INSERT TO authenticated WITH CHECK (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='chat_messages' AND policyname='Chat messages updatable by authenticated') THEN CREATE POLICY "Chat messages updatable by authenticated" ON public.chat_messages FOR UPDATE TO authenticated USING (true) WITH CHECK (true); END IF; END $$;

-- Chat typing: authenticated read/write/update (ephemeral status)
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='chat_typing' AND policyname='Chat typing viewable by authenticated') THEN CREATE POLICY "Chat typing viewable by authenticated" ON public.chat_typing FOR SELECT TO authenticated USING (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='chat_typing' AND policyname='Chat typing upsertable by authenticated') THEN CREATE POLICY "Chat typing upsertable by authenticated" ON public.chat_typing FOR INSERT TO authenticated WITH CHECK (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='chat_typing' AND policyname='Chat typing updatable by authenticated') THEN CREATE POLICY "Chat typing updatable by authenticated" ON public.chat_typing FOR UPDATE TO authenticated USING (true) WITH CHECK (true); END IF; END $$;

-- Staff calls: authenticated read/write
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='staff_calls' AND policyname='Staff calls viewable by authenticated') THEN CREATE POLICY "Staff calls viewable by authenticated" ON public.staff_calls FOR SELECT TO authenticated USING (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='staff_calls' AND policyname='Staff calls insertable by authenticated') THEN CREATE POLICY "Staff calls insertable by authenticated" ON public.staff_calls FOR INSERT TO authenticated WITH CHECK (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='staff_calls' AND policyname='Staff calls updatable by authenticated') THEN CREATE POLICY "Staff calls updatable by authenticated" ON public.staff_calls FOR UPDATE TO authenticated USING (true) WITH CHECK (true); END IF; END $$;

-- Stay extensions: authenticated read/write
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='stay_extensions' AND policyname='Stay extensions viewable by authenticated') THEN CREATE POLICY "Stay extensions viewable by authenticated" ON public.stay_extensions FOR SELECT TO authenticated USING (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='stay_extensions' AND policyname='Stay extensions insertable by authenticated') THEN CREATE POLICY "Stay extensions insertable by authenticated" ON public.stay_extensions FOR INSERT TO authenticated WITH CHECK (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='stay_extensions' AND policyname='Stay extensions updatable by authenticated') THEN CREATE POLICY "Stay extensions updatable by authenticated" ON public.stay_extensions FOR UPDATE TO authenticated USING (true) WITH CHECK (true); END IF; END $$;

-- Contact messages: anyone can insert, authenticated can view/update
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='contact_messages' AND policyname='Anyone can submit contact messages') THEN CREATE POLICY "Anyone can submit contact messages" ON public.contact_messages FOR INSERT WITH CHECK (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='contact_messages' AND policyname='Contact messages viewable by authenticated') THEN CREATE POLICY "Contact messages viewable by authenticated" ON public.contact_messages FOR SELECT TO authenticated USING (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='contact_messages' AND policyname='Contact messages updatable by authenticated') THEN CREATE POLICY "Contact messages updatable by authenticated" ON public.contact_messages FOR UPDATE TO authenticated USING (true) WITH CHECK (true); END IF; END $$;

-- Employee payroll: admins manage, employees view their own
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='employee_payroll' AND policyname='Employee payroll viewable by self and admins') THEN CREATE POLICY "Employee payroll viewable by self and admins" ON public.employee_payroll FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin()); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='employee_payroll' AND policyname='Employee payroll manageable by admins') THEN CREATE POLICY "Employee payroll manageable by admins" ON public.employee_payroll FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin()); END IF; END $$;

-- Time entries: employees manage their own, admins manage all
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='time_entries' AND policyname='Time entries viewable by self and admins') THEN CREATE POLICY "Time entries viewable by self and admins" ON public.time_entries FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin()); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='time_entries' AND policyname='Time entries insertable by self') THEN CREATE POLICY "Time entries insertable by self" ON public.time_entries FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid()); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='time_entries' AND policyname='Time entries updatable by self and admins') THEN CREATE POLICY "Time entries updatable by self and admins" ON public.time_entries FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.is_admin()) WITH CHECK (user_id = auth.uid() OR public.is_admin()); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='time_entries' AND policyname='Time entries deletable by self and admins') THEN CREATE POLICY "Time entries deletable by self and admins" ON public.time_entries FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.is_admin()); END IF; END $$;

-- Payroll periods: viewable by all authenticated, manageable by admins
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='payroll_periods' AND policyname='Payroll periods viewable by authenticated') THEN CREATE POLICY "Payroll periods viewable by authenticated" ON public.payroll_periods FOR SELECT TO authenticated USING (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='payroll_periods' AND policyname='Payroll periods manageable by admins') THEN CREATE POLICY "Payroll periods manageable by admins" ON public.payroll_periods FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin()); END IF; END $$;

-- Payroll entries: employees view their own, admins manage all
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='payroll_entries' AND policyname='Payroll entries viewable by self and admins') THEN CREATE POLICY "Payroll entries viewable by self and admins" ON public.payroll_entries FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin()); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='payroll_entries' AND policyname='Payroll entries manageable by admins') THEN CREATE POLICY "Payroll entries manageable by admins" ON public.payroll_entries FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin()); END IF; END $$;

-- 6. TRIGGER (conditional — won't error on re-run)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created') THEN
        CREATE TRIGGER on_auth_user_created
            AFTER INSERT ON auth.users
            FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
    END IF;
END;
$$;

-- 7. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_time_entries_user_id ON public.time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_clock_in ON public.time_entries(clock_in);
CREATE UNIQUE INDEX IF NOT EXISTS idx_time_entries_one_active_shift ON public.time_entries(user_id) WHERE clock_out IS NULL;
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON public.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_bookings_assigned_employee ON public.bookings(assigned_employee_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings(status);
CREATE INDEX IF NOT EXISTS idx_guest_orders_booking_id ON public.guest_orders(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_charges_booking_id ON public.booking_charges(booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON public.payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_staff_calls_status ON public.staff_calls(status);
CREATE INDEX IF NOT EXISTS idx_stay_extensions_status ON public.stay_extensions(status);
CREATE INDEX IF NOT EXISTS idx_chat_messages_booking_id ON public.chat_messages(booking_id);

-- 8. BACKFILL app_metadata.role for existing users (safe to re-run)
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', p.role)
FROM public.users p
WHERE auth.users.id = p.id
  AND (auth.users.raw_app_meta_data IS NULL OR auth.users.raw_app_meta_data->>'role' IS NULL OR auth.users.raw_app_meta_data->>'role' = '');

-- 8. SEED INITIAL DATA (idempotent — safe to re-run)
INSERT INTO public.hotels (name, address, phone, rating, description, image_url)
SELECT 'Link Fortress Hotel & Suites', '123 Business Park Drive, Manila, Philippines', '+63 2 123 4567', 5.0, 'Modern comfort and world-class hospitality for the business traveler.', 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=800&q=80'
WHERE NOT EXISTS (SELECT 1 FROM public.hotels LIMIT 1);

INSERT INTO public.hotel_settings (key, value, updated_at)
SELECT 'resort_settings', '{"layoutCategories":["Standard Room","Deluxe Room","Grand Suite","Presidential Penthouse"],"currencyCode":"PHP","currencySymbol":"₱","minStayHours":3,"checkInTimes":["2:00 PM","3:00 PM","4:00 PM"],"checkOutTimes":["10:00 AM","11:00 AM","12:00 PM"],"announcement":{"text":"","enabled":false,"type":"promo"},"brand":{"hotelName":"Grand Horizon Hotel","hotelSubtitle":"Resort Concierge","logoUrl":"","brandColor":"#7c3aed","faviconUrl":""},"theme":"light"}'::jsonb, now()
WHERE NOT EXISTS (SELECT 1 FROM public.hotel_settings WHERE key = 'resort_settings');

INSERT INTO public.testimonials (customer_name, role_or_title, comment, rating, avatar_url)
SELECT * FROM (VALUES
  ('Isabella Rossi', 'Frequent Luxury Traveler', 'The cliffside infinity pool at sunrise was nothing short of magical. Every detail from the lemon-scented linens to the private catamaran excursion was flawless.', 5, 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&h=80&w=80&q=80'),
  ('James Mitchell', 'Honeymoon Guest', 'We chose Grand Horizon for our honeymoon and it exceeded every expectation. The staff anticipated our every need. Truly world-class Mediterranean hospitality.', 5, 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&h=80&w=80&q=80'),
  ('Sophie Laurent', 'Celebration Planner', 'Our private terrace dinner overlooking the Amalfi coast was the highlight of our family reunion. The coordination was seamless and the cuisine was extraordinary.', 4, 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&h=80&w=80&q=80')
) AS t
WHERE NOT EXISTS (SELECT 1 FROM public.testimonials LIMIT 1);

-- ==========================================
-- 9. NEW TABLES (v2 features)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.booking_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    contact_name TEXT NOT NULL,
    contact_phone TEXT NOT NULL DEFAULT '',
    contact_email TEXT NOT NULL DEFAULT '',
    total_rooms INTEGER NOT NULL DEFAULT 1,
    total_guests INTEGER,
    notes TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'checked-in', 'completed', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.housekeeping_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE NOT NULL,
    assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    task_type TEXT NOT NULL DEFAULT 'cleaning' CHECK (task_type IN ('cleaning', 'turnover', 'deep_clean', 'maintenance_check', 'supply_restock', 'inspection')),
    notes TEXT DEFAULT '',
    photos TEXT[] DEFAULT '{}',
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.promo_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    description TEXT DEFAULT '',
    discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
    discount_value NUMERIC(10,2) NOT NULL CHECK (discount_value > 0),
    min_spend NUMERIC(10,2) NOT NULL DEFAULT 0,
    max_discount NUMERIC(10,2),
    valid_from DATE NOT NULL,
    valid_to DATE NOT NULL,
    usage_limit INTEGER DEFAULT NULL,
    used_count INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT check_valid_dates CHECK (valid_to >= valid_from)
);

CREATE TABLE IF NOT EXISTS public.incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE NOT NULL,
    booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    reported_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    incident_type TEXT NOT NULL CHECK (incident_type IN ('damage', 'theft', 'disturbance', 'injury', 'fire', 'flood', 'other')),
    description TEXT NOT NULL,
    photos TEXT[] DEFAULT '{}',
    cost NUMERIC(10,2) NOT NULL DEFAULT 0,
    billed_to_guest BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'reported' CHECK (status IN ('reported', 'investigating', 'resolved', 'billed', 'closed')),
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.parking_spots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spot_number TEXT NOT NULL UNIQUE,
    level TEXT NOT NULL DEFAULT 'G',
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'reserved', 'maintenance')),
    assigned_booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    vehicle_plate TEXT DEFAULT '',
    vehicle_model TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.rate_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    room_type TEXT NOT NULL,
    date_from DATE NOT NULL,
    date_to DATE NOT NULL,
    base_price NUMERIC(10,2) NOT NULL CHECK (base_price > 0),
    min_stay_hours INTEGER NOT NULL DEFAULT 3,
    is_peak BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.waitlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_type TEXT NOT NULL,
    guest_name TEXT NOT NULL,
    guest_email TEXT NOT NULL DEFAULT '',
    guest_phone TEXT NOT NULL DEFAULT '',
    check_in DATE,
    check_out DATE,
    party_size INTEGER NOT NULL DEFAULT 1,
    preferred_room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
    notes TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'notified', 'booked', 'expired', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 10. NEW COLUMNS ON EXISTING TABLES (v2 features)
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}';
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS total_visits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS total_spent NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS recurring_rule TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.booking_groups(id) ON DELETE SET NULL;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS promo_code_id UUID REFERENCES public.promo_codes(id) ON DELETE SET NULL;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0;

-- 11. ENABLE RLS ON NEW TABLES
ALTER TABLE public.booking_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.housekeeping_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parking_spots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- 12. RLS POLICIES FOR NEW TABLES
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='booking_groups' AND policyname='Booking groups viewable by authenticated') THEN CREATE POLICY "Booking groups viewable by authenticated" ON public.booking_groups FOR SELECT TO authenticated USING (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='booking_groups' AND policyname='Booking groups manageable by admins') THEN CREATE POLICY "Booking groups manageable by admins" ON public.booking_groups FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin()); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='housekeeping_tasks' AND policyname='Housekeeping viewable by authenticated') THEN CREATE POLICY "Housekeeping viewable by authenticated" ON public.housekeeping_tasks FOR SELECT TO authenticated USING (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='housekeeping_tasks' AND policyname='Housekeeping manageable by admins') THEN CREATE POLICY "Housekeeping manageable by admins" ON public.housekeeping_tasks FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin()); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='housekeeping_tasks' AND policyname='Employees can update assigned tasks') THEN CREATE POLICY "Employees can update assigned tasks" ON public.housekeeping_tasks FOR UPDATE TO authenticated USING (assigned_to = auth.uid() OR public.is_admin()) WITH CHECK (assigned_to = auth.uid() OR public.is_admin()); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='promo_codes' AND policyname='Promo codes viewable by authenticated') THEN CREATE POLICY "Promo codes viewable by authenticated" ON public.promo_codes FOR SELECT TO authenticated USING (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='promo_codes' AND policyname='Promo codes manageable by admins') THEN CREATE POLICY "Promo codes manageable by admins" ON public.promo_codes FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin()); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='incidents' AND policyname='Incidents viewable by authenticated') THEN CREATE POLICY "Incidents viewable by authenticated" ON public.incidents FOR SELECT TO authenticated USING (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='incidents' AND policyname='Incidents manageable by admins') THEN CREATE POLICY "Incidents manageable by admins" ON public.incidents FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin()); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='parking_spots' AND policyname='Parking viewable by authenticated') THEN CREATE POLICY "Parking viewable by authenticated" ON public.parking_spots FOR SELECT TO authenticated USING (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='parking_spots' AND policyname='Parking manageable by admins') THEN CREATE POLICY "Parking manageable by admins" ON public.parking_spots FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin()); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rate_plans' AND policyname='Rate plans viewable by everyone') THEN CREATE POLICY "Rate plans viewable by everyone" ON public.rate_plans FOR SELECT USING (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rate_plans' AND policyname='Rate plans manageable by admins') THEN CREATE POLICY "Rate plans manageable by admins" ON public.rate_plans FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin()); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='waitlist' AND policyname='Waitlist viewable by authenticated') THEN CREATE POLICY "Waitlist viewable by authenticated" ON public.waitlist FOR SELECT TO authenticated USING (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='waitlist' AND policyname='Waitlist insertable by anyone') THEN CREATE POLICY "Waitlist insertable by anyone" ON public.waitlist FOR INSERT WITH CHECK (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='waitlist' AND policyname='Waitlist manageable by admins') THEN CREATE POLICY "Waitlist manageable by admins" ON public.waitlist FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin()); END IF; END $$;

-- 13. INDEXES FOR NEW TABLES
CREATE INDEX IF NOT EXISTS idx_housekeeping_room ON public.housekeeping_tasks(room_id);
CREATE INDEX IF NOT EXISTS idx_housekeeping_assigned ON public.housekeeping_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_housekeeping_status ON public.housekeeping_tasks(status);
CREATE INDEX IF NOT EXISTS idx_incidents_room ON public.incidents(room_id);
CREATE INDEX IF NOT EXISTS idx_incidents_booking ON public.incidents(booking_id);
CREATE INDEX IF NOT EXISTS idx_parking_status ON public.parking_spots(status);
CREATE INDEX IF NOT EXISTS idx_rate_plans_dates ON public.rate_plans(date_from, date_to);
CREATE INDEX IF NOT EXISTS idx_rate_plans_room_type ON public.rate_plans(room_type);
CREATE INDEX IF NOT EXISTS idx_waitlist_status ON public.waitlist(status);
CREATE INDEX IF NOT EXISTS idx_bookings_group ON public.bookings(group_id);
CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON public.promo_codes(code);

-- ==========================================
-- 14. HRIS PAYROLL ENHANCEMENTS
-- ==========================================

ALTER TABLE public.employee_payroll ADD COLUMN IF NOT EXISTS employee_id TEXT;
ALTER TABLE public.employee_payroll ADD COLUMN IF NOT EXISTS department TEXT DEFAULT '';
ALTER TABLE public.employee_payroll ADD COLUMN IF NOT EXISTS position TEXT DEFAULT '';
ALTER TABLE public.employee_payroll ADD COLUMN IF NOT EXISTS salary_type TEXT NOT NULL DEFAULT 'hourly' CHECK (salary_type IN ('monthly', 'daily', 'hourly'));
ALTER TABLE public.employee_payroll ADD COLUMN IF NOT EXISTS basic_salary NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (basic_salary >= 0);
ALTER TABLE public.employee_payroll ADD COLUMN IF NOT EXISTS daily_rate NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (daily_rate >= 0);
ALTER TABLE public.employee_payroll ADD COLUMN IF NOT EXISTS night_diff_rate NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (night_diff_rate >= 0);
ALTER TABLE public.employee_payroll ADD COLUMN IF NOT EXISTS government_ids JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.employee_payroll ADD COLUMN IF NOT EXISTS bank_details JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.employee_payroll ADD COLUMN IF NOT EXISTS payroll_status TEXT NOT NULL DEFAULT 'active' CHECK (payroll_status IN ('active', 'hold', 'resigned', 'terminated'));

ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS overtime_hours NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (overtime_hours >= 0);
ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS night_diff_hours NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (night_diff_hours >= 0);
ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS late_minutes INTEGER NOT NULL DEFAULT 0 CHECK (late_minutes >= 0);
ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS undertime_minutes INTEGER NOT NULL DEFAULT 0 CHECK (undertime_minutes >= 0);
ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS absence_hours NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (absence_hours >= 0);
ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS holiday_work_hours NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (holiday_work_hours >= 0);
ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS rest_day_work_hours NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (rest_day_work_hours >= 0);
ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS attendance_synced_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.payroll_periods ADD COLUMN IF NOT EXISTS cycle_type TEXT NOT NULL DEFAULT 'semi-monthly' CHECK (cycle_type IN ('weekly', 'semi-monthly', 'monthly', 'custom'));
ALTER TABLE public.payroll_periods ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'draft' CHECK (approval_status IN ('draft', 'hr_review', 'manager_approval', 'finance_approval', 'released'));
ALTER TABLE public.payroll_periods ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.payroll_periods ADD COLUMN IF NOT EXISTS release_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.payroll_entries ADD COLUMN IF NOT EXISTS total_night_diff_hours NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (total_night_diff_hours >= 0);
ALTER TABLE public.payroll_entries ADD COLUMN IF NOT EXISTS total_late_minutes INTEGER NOT NULL DEFAULT 0 CHECK (total_late_minutes >= 0);
ALTER TABLE public.payroll_entries ADD COLUMN IF NOT EXISTS total_undertime_minutes INTEGER NOT NULL DEFAULT 0 CHECK (total_undertime_minutes >= 0);
ALTER TABLE public.payroll_entries ADD COLUMN IF NOT EXISTS total_absence_days NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (total_absence_days >= 0);
ALTER TABLE public.payroll_entries ADD COLUMN IF NOT EXISTS earnings_total NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (earnings_total >= 0);
ALTER TABLE public.payroll_entries ADD COLUMN IF NOT EXISTS deductions_total NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (deductions_total >= 0);
ALTER TABLE public.payroll_entries ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.payroll_entries DROP CONSTRAINT IF EXISTS payroll_entries_status_check;
ALTER TABLE public.payroll_entries ADD CONSTRAINT payroll_entries_status_check CHECK (status IN ('pending', 'hr_review', 'manager_approval', 'finance_approval', 'approved', 'paid', 'cancelled'));

CREATE TABLE IF NOT EXISTS public.payroll_components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payroll_entry_id UUID REFERENCES public.payroll_entries(id) ON DELETE CASCADE NOT NULL,
    component_type TEXT NOT NULL CHECK (component_type IN ('earning', 'deduction')),
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    taxable BOOLEAN NOT NULL DEFAULT false,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.payroll_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payroll_period_id UUID REFERENCES public.payroll_periods(id) ON DELETE CASCADE NOT NULL,
    stage TEXT NOT NULL CHECK (stage IN ('hr_review', 'manager_approval', 'finance_approval', 'final_release')),
    approver_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    remarks TEXT DEFAULT '',
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(payroll_period_id, stage)
);

CREATE TABLE IF NOT EXISTS public.leave_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    is_paid BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.leave_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    leave_type_id UUID REFERENCES public.leave_types(id) ON DELETE CASCADE NOT NULL,
    year INTEGER NOT NULL,
    balance NUMERIC(10,2) NOT NULL DEFAULT 0,
    used NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, leave_type_id, year)
);

CREATE TABLE IF NOT EXISTS public.leave_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    leave_type_id UUID REFERENCES public.leave_types(id) ON DELETE RESTRICT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    days NUMERIC(10,2) NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    remarks TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.holiday_calendar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL UNIQUE,
    name TEXT NOT NULL,
    holiday_type TEXT NOT NULL CHECK (holiday_type IN ('regular', 'special_non_working', 'local', 'company')),
    multiplier NUMERIC(6,2) NOT NULL DEFAULT 1.0 CHECK (multiplier >= 1),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.salary_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    action_type TEXT NOT NULL CHECK (action_type IN ('increase', 'reduction', 'promotion', 'position_change', 'cola')),
    previous_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    new_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    effective_date DATE NOT NULL,
    remarks TEXT DEFAULT '',
    approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.payroll_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.payroll_backups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_id UUID REFERENCES public.payroll_periods(id) ON DELETE SET NULL,
    backup_payload JSONB NOT NULL,
    checksum TEXT NOT NULL,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.payroll_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holiday_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_backups ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='payroll_components' AND policyname='Payroll components viewable by self and admins') THEN CREATE POLICY "Payroll components viewable by self and admins" ON public.payroll_components FOR SELECT TO authenticated USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.payroll_entries pe WHERE pe.id = payroll_entry_id AND pe.user_id = auth.uid())); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='payroll_components' AND policyname='Payroll components manageable by admins') THEN CREATE POLICY "Payroll components manageable by admins" ON public.payroll_components FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin()); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='payroll_approvals' AND policyname='Payroll approvals viewable by authenticated') THEN CREATE POLICY "Payroll approvals viewable by authenticated" ON public.payroll_approvals FOR SELECT TO authenticated USING (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='payroll_approvals' AND policyname='Payroll approvals manageable by admins') THEN CREATE POLICY "Payroll approvals manageable by admins" ON public.payroll_approvals FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin()); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='leave_types' AND policyname='Leave types viewable by authenticated') THEN CREATE POLICY "Leave types viewable by authenticated" ON public.leave_types FOR SELECT TO authenticated USING (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='leave_types' AND policyname='Leave types manageable by admins') THEN CREATE POLICY "Leave types manageable by admins" ON public.leave_types FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin()); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='leave_balances' AND policyname='Leave balances self or admin') THEN CREATE POLICY "Leave balances self or admin" ON public.leave_balances FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin()); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='leave_balances' AND policyname='Leave balances admin manage') THEN CREATE POLICY "Leave balances admin manage" ON public.leave_balances FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin()); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='leave_requests' AND policyname='Leave requests self or admin view') THEN CREATE POLICY "Leave requests self or admin view" ON public.leave_requests FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin()); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='leave_requests' AND policyname='Leave requests self insert') THEN CREATE POLICY "Leave requests self insert" ON public.leave_requests FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR public.is_admin()); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='leave_requests' AND policyname='Leave requests admin update') THEN CREATE POLICY "Leave requests admin update" ON public.leave_requests FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin()); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='holiday_calendar' AND policyname='Holiday calendar viewable by authenticated') THEN CREATE POLICY "Holiday calendar viewable by authenticated" ON public.holiday_calendar FOR SELECT TO authenticated USING (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='holiday_calendar' AND policyname='Holiday calendar manageable by admins') THEN CREATE POLICY "Holiday calendar manageable by admins" ON public.holiday_calendar FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin()); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='salary_adjustments' AND policyname='Salary adjustments self or admin view') THEN CREATE POLICY "Salary adjustments self or admin view" ON public.salary_adjustments FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin()); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='salary_adjustments' AND policyname='Salary adjustments admin manage') THEN CREATE POLICY "Salary adjustments admin manage" ON public.salary_adjustments FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin()); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='payroll_notifications' AND policyname='Payroll notifications self or admin view') THEN CREATE POLICY "Payroll notifications self or admin view" ON public.payroll_notifications FOR SELECT TO authenticated USING (user_id = auth.uid() OR user_id IS NULL OR public.is_admin()); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='payroll_notifications' AND policyname='Payroll notifications self update') THEN CREATE POLICY "Payroll notifications self update" ON public.payroll_notifications FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.is_admin()) WITH CHECK (user_id = auth.uid() OR public.is_admin()); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='payroll_notifications' AND policyname='Payroll notifications admin insert') THEN CREATE POLICY "Payroll notifications admin insert" ON public.payroll_notifications FOR INSERT TO authenticated WITH CHECK (public.is_admin()); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='payroll_backups' AND policyname='Payroll backups admin only') THEN CREATE POLICY "Payroll backups admin only" ON public.payroll_backups FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin()); END IF; END $$;

CREATE INDEX IF NOT EXISTS idx_employee_payroll_department ON public.employee_payroll(department);
CREATE INDEX IF NOT EXISTS idx_time_entries_user_clock ON public.time_entries(user_id, clock_in);
CREATE INDEX IF NOT EXISTS idx_payroll_entries_period_user ON public.payroll_entries(period_id, user_id);
CREATE INDEX IF NOT EXISTS idx_payroll_components_entry ON public.payroll_components(payroll_entry_id);
CREATE INDEX IF NOT EXISTS idx_payroll_approvals_period ON public.payroll_approvals(payroll_period_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_user_dates ON public.leave_requests(user_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_payroll_notifications_user_read ON public.payroll_notifications(user_id, read_at);

-- ==========================================
-- GUEST SECURE PORTAL - DEVICE LOCK SCHEMA
-- ==========================================
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS device_token TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS sharing_code TEXT;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='bookings' AND policyname='Enable public guest select bookings') THEN
  CREATE POLICY "Enable public guest select bookings" ON public.bookings FOR SELECT USING (true);
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='bookings' AND policyname='Enable public guest device token registration') THEN
  CREATE POLICY "Enable public guest device token registration" ON public.bookings FOR UPDATE USING (true) WITH CHECK (true);
END IF; END $$;

