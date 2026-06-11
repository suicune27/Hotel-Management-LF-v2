import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { UserRole } from '../types';
import { Mail, Lock, User, Loader2, ArrowLeft, ArrowRight, Key } from 'lucide-react';
import { getSettings } from '../lib/settings';

interface AuthLayoutProps {
  onNavigate: (screen: 'login' | 'admin-dashboard' | 'employee-dashboard' | 'kiosk') => void;
  onAuthSuccess: (session: any, profile: any) => void;
}

export default function AuthLayout({ onNavigate, onAuthSuccess }: AuthLayoutProps) {
  const brand = getSettings().brand;
  const brandInitials = brand.hotelName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<UserRole>('staff');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Guest sign-in is disabled — guests access the portal via QR codes on local network

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (isSignUp) {
        // Run Register flow with user metadata
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              // The trigger enforces a whitelist and ignores elevated roles.
              role
            }
          }
        });

        if (error) throw error;

        if (data.session) {
          const { data: profile, error: dbErr } = await supabase
            .from('users')
            .select('*')
            .eq('id', data.user?.id)
            .single();
          
          onAuthSuccess(data.session, profile || { id: data.user?.id, email, full_name: fullName, role: 'staff' });
        } else {
          setSuccessMsg("Account registered successfully! If required by email security, please check your inbox to verify.");
          setIsSignUp(false);
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });

        if (error) throw error;

        const { data: profile, error: dbErr } = await supabase
          .from('users')
          .select('*')
          .eq('id', data.user?.id)
          .single();

        if (dbErr) {
          console.warn("Could not retrieve custom profile row - linking fallback metadata", dbErr.message);
        }

        const resolvedProfile = profile || { 
          id: data.user?.id, 
          email: data.user?.email, 
          full_name: data.user?.user_metadata?.full_name || data.user?.email?.split('@')[0] || '', 
          role: data.user?.user_metadata?.role || 'employee' 
        };

        onAuthSuccess(data.session, resolvedProfile);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An authentication error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-50 flex flex-col md:flex-row font-sans tracking-tight text-surface-800">
      
      {/* Brand Visual Left Sidebar (Hidden on mobile) */}
      <div className="hidden md:flex md:w-1/2 bg-surface-900 relative text-white flex-col justify-between p-12">
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1566665797739-1674de7a421a?auto=format&fit=crop&w=1200&q=80" 
            alt="Mediterranean Lobby" 
            className="w-full h-full object-cover opacity-40 saturate-125"
          />
          <div className="absolute inset-0 bg-gradient-to-tr from-surface-950 via-surface-900/60 to-transparent" />
        </div>

        {/* Top Header */}
        <div className="relative z-10 flex items-center gap-2 cursor-pointer" onClick={() => onNavigate('login')}>
          <span className="p-2 bg-gradient-to-br from-brand-500 to-brand-700 text-white rounded-lg font-bold text-base font-mono">{brandInitials}</span>
          <div>
            <span className="text-lg font-semibold tracking-tight text-white font-sans tracking-tight block">{brand.hotelName}</span>
            <span className="text-[9px] block font-mono text-brand-300 tracking-wider font-semibold uppercase -mt-1.5">{brand.hotelSubtitle}</span>
          </div>
        </div>

        {/* Middle Message */}
        <div className="relative z-10 max-w-md">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-brand-500/20 text-brand-300 border border-brand-500/20 rounded-full text-[10px] font-semibold tracking-wider uppercase mb-4">
            <Key className="w-3 h-3 text-brand-400" /> Secure Staff Portal
          </span>
          <h2 className="text-3xl font-semibold tracking-tight text-white uppercase leading-tight mb-4">
            Empowering the finest hospitality
          </h2>
          <p className="text-xs text-surface-300 leading-relaxed font-sans tracking-tight font-light">
            Each Amalfi luxury suite checked in, each room terrace scrubbed, and each personalized catamaran ticket booked - handled gracefully with our unified hotel management engine.
          </p>
        </div>

        {/* Footer info */}
        <div className="relative z-10 text-[10px] font-mono text-surface-400">
          SECURE ENCRYPTION ENFORCED • POWERED BY SUPABASE AUTH & RLS
        </div>
      </div>

      {/* Main Login Card Right Area */}
      <div className="flex-1 flex flex-col justify-center px-6 py-12 md:px-16 lg:px-24 bg-white relative">
        
        {/* Mobile top bar */}
        <div className="absolute top-6 left-6 flex items-center justify-between w-[calc(100%-48px)]">
          <button 
            onClick={() => onNavigate('login')}
            className="flex items-center gap-1.5 text-xs text-surface-500 hover:text-surface-800 transition-colors font-medium group cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-transurface-x-0.5 transition-transform" />
            <span>Back to Public site</span>
          </button>
        </div>

        <div className="max-w-md w-full mx-auto mt-6">
          <div className="mb-8">
            <span className="text-xs font-semibold text-brand-600 tracking-wider uppercase font-mono">
              {isSignUp ? 'Enroll New Colleague' : 'Secure Entry'}
            </span>
            <h1 className="text-2xl font-bold font-sans tracking-tight tracking-tight text-surface-900 mt-1">
              {isSignUp ? 'Start Your Amalfi Career' : 'Welcome Back'}
            </h1>
            <p className="text-xs text-surface-500 mt-1">
              {isSignUp 
                ? 'Create a unified staff profile linked instantly to the booking roster.' 
                : 'Access assigned check-in duties, room cleaning lists, and luxury metrics.'}
            </p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4 text-xs font-sans tracking-tight">
            
            {/* FULL NAME (Only for signups) */}
            {isSignUp && (
              <div>
                <label className="block text-surface-500 font-semibold mb-1">Your Full Name</label>
                <div className="relative">
                  <User className="w-4 h-4 text-surface-400 absolute left-3 top-3.5" />
                  <input 
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Penelope Cruz"
                    className="w-full bg-surface-50 border border-surface-200 focus:border-brand-500 focus:outline-none rounded-lg py-3 pl-10 pr-4 text-surface-800 font-sans tracking-tight"
                  />
                </div>
              </div>
            )}

            {/* EMAIL */}
            <div>
              <label className="block text-surface-500 font-semibold mb-1">Work Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-surface-400 absolute left-3 top-3.5" />
                <input 
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. penelope@grandhorizon.it"
                  className="w-full bg-surface-50 border border-surface-200 focus:border-brand-500 focus:outline-none rounded-lg py-3 pl-10 pr-4 text-surface-800"
                />
              </div>
            </div>

            {/* PASSWORD */}
            <div>
              <label className="block text-surface-500 font-semibold mb-1">Security Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-surface-400 absolute left-3 top-3.5" />
                <input 
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full bg-surface-50 border border-surface-200 focus:border-brand-500 focus:outline-none rounded-lg py-3 pl-10 pr-4 text-surface-800"
                />
              </div>
            </div>

            {/* ROLE PICKER (Only on Signup) */}
            {isSignUp && (
              <div>
                <label className="block text-surface-500 font-semibold mb-1">Roster Role Allocation</label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { id: 'staff' as UserRole, label: 'Staff', icon: User, desc: 'General tasks' },
                    { id: 'guest' as UserRole, label: 'Guest', icon: User, desc: 'Guest portal only' },
                  ]).map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setRole(r.id)}
                      className={`p-2.5 border rounded-lg text-center transition-all cursor-pointer ${
                        role === r.id
                          ? 'border-brand-500 bg-brand-50/50 text-brand-800'
                          : 'border-surface-200 text-surface-600 hover:bg-surface-50'
                      }`}
                    >
                      <r.icon className="w-4 h-4 mx-auto mb-1 text-brand-600" />
                      <p className="font-semibold text-[11px] leading-tight">{r.label}</p>
                      <span className="text-[9px] text-surface-400 block leading-tight">{r.desc}</span>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-surface-400 mt-1.5">Only low-privilege roles are available in public registration. Elevated roles are assigned by administrators.</p>
              </div>
            )}

            {/* ERROR / SUCCESS ALERTS */}
            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-100 text-rose-700 rounded-lg text-xs leading-relaxed font-sans tracking-tight">
                {errorMsg}
              </div>
            )}

            {successMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-lg text-xs leading-relaxed font-sans tracking-tight">
                {successMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-surface-900 text-white font-semibold rounded-lg hover:bg-surface-800 transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs mt-6 shadow-md shadow-surface-900/15"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Configuring Session...</span>
                </>
              ) : (
                <>
                  <span>{isSignUp ? 'Establish Workforce Entry' : 'Verify & Enter'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Toggle register option */}
          <div className="mt-6 text-center border-t border-surface-100 pt-6">
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className="text-surface-500 hover:text-surface-800 font-medium cursor-pointer flex items-center gap-1 mx-auto"
            >
              {isSignUp ? (
                <>
                  <span>Already enrolled?</span>
                  <span className="text-brand-600 font-semibold">Sign in here</span>
                </>
              ) : (
                <>
                  <span>New resort team member?</span>
                  <span className="text-brand-600 font-semibold">Enroll here</span>
                </>
              )}
            </button>
          </div>

          {/* Kiosk Mode Link */}
          <div className="mt-4 text-center">
            <button
              onClick={() => onNavigate('kiosk')}
              className="text-[10px] text-surface-400 hover:text-brand-600 font-medium cursor-pointer transition-colors"
            >
              Kiosk Mode (Self Check-in)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
