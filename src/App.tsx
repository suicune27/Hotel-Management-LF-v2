import React, { useState, useEffect, lazy, Suspense } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import { fetchSettingsFromSupabase } from './lib/settings';
import { Profile } from './types';
import ConfigurationGuide from './components/ConfigurationGuide';
import { ErrorBoundary } from './components/ErrorBoundary';

const AuthLayout = lazy(() => import('./components/AuthLayout'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
const EmployeeDashboard = lazy(() => import('./components/EmployeeDashboard'));
const GuestDashboard = lazy(() => import('./components/GuestDashboard'));
const FrontDeskPanel = lazy(() => import('./components/FrontDeskPanel'));
const KioskMode = lazy(() => import('./components/KioskMode'));

type ScreenState = 'login' | 'admin-dashboard' | 'employee-dashboard' | 'guest-dashboard' | 'guest-access' | 'front-desk' | 'kiosk';

function AppContent() {
  const isGuestAccessPath = (path: string) => path === '/guest-access' || path.startsWith('/guest-access/');
  const resolveScreenFromPath = (path: string): ScreenState => (
    isGuestAccessPath(path) ? 'guest-access'
    : path === '/front-desk' ? 'front-desk'
    : path === '/kiosk' ? 'kiosk'
    : 'login'
  );

  const [screen, setScreen] = useState<ScreenState>(
    resolveScreenFromPath(window.location.pathname)
  );
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  // Sync settings with database on bootstrap
  useEffect(() => {
    fetchSettingsFromSupabase();
  }, []);

  // Helper to fetch profile linked from auth.users to public.users (or use user_metadata fallback)
  const fetchProfile = async (user: Session['user']): Promise<Profile> => {
    try {
      const { data: userProfile, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (userProfile) {
        setProfile(userProfile);
        return userProfile;
      } else {
        // Fallback to metadata if postgres trigger has cold boots or delays
        const metaProfile: Profile = {
          id: user.id,
          email: user.email || '',
          full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || '',
          role: user.user_metadata?.role || 'guest',
          created_at: new Date().toISOString()
        };
        setProfile(metaProfile);
        return metaProfile;
      }
    } catch (err) {
      console.warn("Retrying profile attachment via metadata", err);
      const metaProfile: Profile = {
        id: user.id,
        email: user.email || '',
        full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || '',
        role: user.user_metadata?.role || 'guest',
        created_at: new Date().toISOString()
      };
      setProfile(metaProfile);
      return metaProfile;
    }
  };

  // Helper function to handle screen switching and clean browser URL state synchronization
  const handleNavigate = (targetScreen: ScreenState) => {
    setScreen(targetScreen);
    if (targetScreen === 'login') {
      window.history.pushState({}, '', '/staff/secure/login');
    } else if (targetScreen === 'admin-dashboard') {
      window.history.pushState({}, '', '/admin-dashboard');
    } else if (targetScreen === 'employee-dashboard') {
      window.history.pushState({}, '', '/employee-dashboard');
    } else if (targetScreen === 'guest-dashboard') {
      window.history.pushState({}, '', '/guest-dashboard');
    } else if (targetScreen === 'guest-access') {
      const currentSearch = window.location.search;
      window.history.pushState({}, '', '/guest-access' + currentSearch);
    } else if (targetScreen === 'front-desk') {
      window.history.pushState({}, '', '/front-desk');
    } else if (targetScreen === 'kiosk') {
      window.history.pushState({}, '', '/kiosk');
    }
  };

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    // Load initial session on boot
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      setSession(existingSession);

      // Always serve guest-access regardless of session (QR codes, no auth needed)
      if (isGuestAccessPath(window.location.pathname)) {
        setScreen('guest-access');
        return;
      }

      if (window.location.pathname === '/kiosk') {
        setScreen('kiosk');
        return;
      }

      if (existingSession?.user) {
        fetchProfile(existingSession.user).then((prof) => {
          // If logged in, automatically redirect based on role
          if (prof?.role === 'admin') {
            setScreen('admin-dashboard');
            window.history.replaceState({}, '', '/admin-dashboard');
          } else if (prof?.role === 'front_desk') {
            setScreen('front-desk');
            window.history.replaceState({}, '', '/front-desk');
          } else if (prof?.role && ['cook', 'cleaner', 'staff', 'waiter', 'employee'].includes(prof.role)) {
            setScreen('employee-dashboard');
            window.history.replaceState({}, '', '/employee-dashboard');
          } else {
            setScreen('guest-dashboard');
            window.history.replaceState({}, '', '/guest-dashboard');
          }
        });
      } else {
        if (window.location.pathname === '/staff/secure/login') {
          setScreen('login');
        } else {
          setScreen('login');
          if (
            window.location.pathname === '/admin-dashboard' ||
            window.location.pathname === '/employee-dashboard' ||
            window.location.pathname === '/guest-dashboard' ||
            window.location.pathname === '/front-desk'
          ) {
            window.history.replaceState({}, '', '/');
          }
        }
      }
    });

    // Listen to Auth State Transitions (login/token refreshes/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);

      // Suppress redirects during admin user-creation (signUp auto-switches session)
      if ((window as any).__opencode_suppressAuthRedirect) return;

      // Never redirect away from guest-access
      if (isGuestAccessPath(window.location.pathname)) {
        setScreen('guest-access');
        return;
      }

      if (window.location.pathname === '/kiosk') {
        setScreen('kiosk');
        return;
      }

      if (newSession?.user) {
        const prof = await fetchProfile(newSession.user);

        // Clear any stale pending booking state (landing page feature removed).
        sessionStorage.removeItem('pendingBooking');

        if (prof?.role === 'admin') {
          setScreen('admin-dashboard');
          window.history.pushState({}, '', '/admin-dashboard');
        } else if (prof?.role === 'front_desk') {
          setScreen('front-desk');
          window.history.pushState({}, '', '/front-desk');
        } else if (prof?.role && ['cook', 'cleaner', 'staff', 'waiter', 'employee'].includes(prof.role)) {
          setScreen('employee-dashboard');
          window.history.pushState({}, '', '/employee-dashboard');
        } else {
          setScreen('guest-dashboard');
          window.history.pushState({}, '', '/guest-dashboard');
        }
      } else {
        setProfile(null);
        // If on guest-access page, stay there (logout shouldn't kick them out)
        if (isGuestAccessPath(window.location.pathname)) {
          setScreen('guest-access');
          return;
        }
        setScreen('login');
        // Back to login URL safely if logged out
        if (window.location.pathname !== '/staff/secure/login') {
          window.history.pushState({}, '', '/staff/secure/login');
        }
      }
    });

    // Set up popstate event listener for browser back/forward buttons
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path === '/staff/secure/login') {
        setScreen('login');
      } else if (path === '/admin-dashboard') {
        setScreen('admin-dashboard');
      } else if (path === '/employee-dashboard') {
        setScreen('employee-dashboard');
      } else if (path === '/guest-dashboard') {
        setScreen('guest-dashboard');
      } else if (isGuestAccessPath(path)) {
        setScreen('guest-access');
      } else if (path === '/front-desk') {
        setScreen('front-desk');
      } else if (path === '/kiosk') {
        setScreen('kiosk');
      } else {
        setScreen('login');
      }
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const handleLogout = async () => {
    const currentProfile = profile;
    try {
      if (currentProfile?.id) {
        await supabase.from('activity_logs').insert({
          user_id: currentProfile.id,
          user_name: currentProfile.full_name || currentProfile.email || 'User',
          action: 'Logout',
          details: `Logged out from ${currentProfile.role || 'staff'} portal`
        });
      }
      if (session) {
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.warn('Sign out error (non-fatal):', err);
    }
    setSession(null);
    setProfile(null);
    setScreen('login');
    window.history.pushState({}, '', '/staff/secure/login');
  };

  const handleAuthSuccess = (newSession: Session, resolvedProfile: Profile) => {
    setSession(newSession);
    setProfile(resolvedProfile);

    // Best-effort login tracking for realtime admin monitoring.
    if (resolvedProfile?.id) {
      supabase.from('activity_logs').insert({
        user_id: resolvedProfile.id,
        user_name: resolvedProfile.full_name || resolvedProfile.email || 'User',
        action: 'Login',
        details: `Logged in as ${resolvedProfile.role || 'staff'}`
      }).then(({ error }) => {
        if (error) {
          console.warn('Login tracking insert failed:', error.message);
        }
      });
    }

    // Pending booking redirect is removed in desktop app
    const pendingBookingJson = sessionStorage.getItem('pendingBooking');
    if (pendingBookingJson) {
      sessionStorage.removeItem('pendingBooking');
    }

    if (resolvedProfile.role === 'admin') {
      setScreen('admin-dashboard');
      window.history.pushState({}, '', '/admin-dashboard');
    } else if (resolvedProfile.role === 'front_desk') {
      setScreen('front-desk');
      window.history.pushState({}, '', '/front-desk');
    } else if (['cook', 'cleaner', 'staff', 'waiter', 'employee'].includes(resolvedProfile.role)) {
      setScreen('employee-dashboard');
      window.history.pushState({}, '', '/employee-dashboard');
    } else {
      setScreen('guest-dashboard');
      window.history.pushState({}, '', '/guest-dashboard');
    }
  };

  const handleProfileUpdate = (updatedProfile: Profile) => {
    setProfile(updatedProfile);
  };

  // If Supabase is not configured yet, show our gorgeous configuration onboarding guide
  if (!isSupabaseConfigured) {
    return <ConfigurationGuide />;
  }

  // Handle Tab Navigation Transitions

  switch (screen) {
    case 'login':
      return <AuthLayout onNavigate={handleNavigate} onAuthSuccess={handleAuthSuccess} />;
    case 'admin-dashboard':
      return (
        <AdminDashboard 
          onNavigate={handleNavigate} 
          userSession={session} 
          userProfile={profile} 
          onLogout={handleLogout} 
        />
      );
    case 'employee-dashboard':
      return (
        <EmployeeDashboard 
          onNavigate={handleNavigate} 
          userSession={session} 
          userProfile={profile} 
          onLogout={handleLogout}
          onProfileUpdate={handleProfileUpdate}
        />
      );
    case 'guest-access':
      const gParams = new URLSearchParams(window.location.search);
      const gRoomNum = gParams.get('room');
      const gPath = window.location.pathname;
      const gUid = gPath.startsWith('/guest-access/') ? gPath.replace('/guest-access/', '').split('/')[0] : null;
      return (
        <GuestDashboard 
          onNavigate={handleNavigate as any} 
          userSession={null} 
          userProfile={null} 
          onLogout={handleLogout}
          onProfileUpdate={handleProfileUpdate}
          roomNumber={gRoomNum}
          bookingUid={gUid}
        />
      );
    case 'guest-dashboard':
      return (
        <GuestDashboard 
          onNavigate={handleNavigate as any} 
          userSession={session} 
          userProfile={profile} 
          onLogout={handleLogout}
          onProfileUpdate={handleProfileUpdate}
        />
      );
    case 'front-desk':
      return (
        <FrontDeskPanel 
          onNavigate={handleNavigate as any}
          userProfile={profile}
          onLogout={handleLogout}
        />
      );
    case 'kiosk':
      return <KioskMode onNavigate={handleNavigate as any} />;
    default:
      return (
        <AuthLayout onNavigate={handleNavigate} onAuthSuccess={handleAuthSuccess} />
      );
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-surface-500 text-sm">Loading workspace...</div>}>
        <AppContent />
      </Suspense>
    </ErrorBoundary>
  );
}

