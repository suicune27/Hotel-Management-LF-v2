-- Delete all cancelled bookings and their cascaded records
DELETE FROM public.bookings WHERE status = 'cancelled';
