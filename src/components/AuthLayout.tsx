import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { UserRole } from '../types';
import { 
  Mail, Lock, User, Loader2, ArrowLeft, ArrowRight, Key, Eye, EyeOff, Shield,
  Check, ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getSettings } from '../lib/settings';

interface AuthLayoutProps {
  onNavigate: (screen: 'login' | 'admin-dashboard' | 'employee-dashboard' | 'kiosk') => void;
  onAuthSuccess: (session: any, profile: any) => void;
}

// Floating decorative orbs for the background
function FloatingOrbs() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <motion.div
        className="absolute -top-20 -right-20 w-72 h-72 bg-brand-500/10 rounded-full blur-3xl"
        animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -bottom-32 -left-20 w-96 h-96 bg-indigo-400/8 rounded-full blur-3xl"
        animate={{ x: [0, -20, 0], y: [0, 30, 0] }}
        transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute top-1/3 -left-10 w-48 h-48 bg-cyan-400/8 rounded-full blur-3xl"
        animate={{ x: [0, 25, 0], y: [0, -15, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-1/4 right-1/4 w-56 h-56 bg-violet-400/8 rounded-full blur-3xl"
        animate={{ x: [0, -15, 10, 0], y: [0, 20, -10, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}

// Decorative grid dots pattern
function DotsPattern() {
  return (
    <div className="absolute inset-0 opacity-[0.03] pointer-events-none" aria-hidden="true"
      style={{
        backgroundImage: 'radial-gradient(circle, #6366f1 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }}
    />
  );
}

// Reveal stagger animation wrapper
const staggerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.07, delayChildren: 0.1 }
  }
};

const itemFadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 }
};

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
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => {
    return localStorage.getItem('staff_remember_email') === 'true';
  });

  // Pre-fill email if remember-me was checked
  React.useEffect(() => {
    const savedEmail = localStorage.getItem('staff_saved_email');
    if (savedEmail && rememberMe) {
      setEmail(savedEmail);
    }
  }, [rememberMe]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    // Handle remember-me
    if (rememberMe) {
      localStorage.setItem('staff_remember_email', 'true');
      localStorage.setItem('staff_saved_email', email.trim());
    } else {
      localStorage.removeItem('staff_remember_email');
      localStorage.removeItem('staff_saved_email');
    }

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName.trim(),
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
          // console.warn("Could not retrieve custom profile row - linking fallback metadata", dbErr.message);
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
    <div className="min-h-screen bg-surface-50 flex flex-col md:flex-row font-sans tracking-tight text-surface-800 selection:bg-brand-200/30 selection:text-brand-900">
      
      {/* Brand Visual Left Sidebar (Hidden on mobile) */}
      <motion.div 
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
        className="hidden md:flex md:w-1/2 bg-surface-900 relative text-white flex-col justify-between p-12 overflow-hidden"
      >
        {/* Background with parallax-inspired overlay */}
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1566665797739-1674de7a421a?auto=format&fit=crop&w=1200&q=80" 
            alt="Mediterranean Lobby" 
            className="w-full h-full object-cover opacity-40 saturate-[1.15] scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-tr from-surface-950 via-surface-900/70 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-b from-surface-950/20 via-transparent to-surface-950/60" />
        </div>

        {/* Decorative dots pattern on sidebar */}
        <div 
          className="absolute inset-0 opacity-[0.04] pointer-events-none z-[1]" 
          aria-hidden="true"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />

        {/* Top Header */}
        <div className="relative z-10">
          <motion.div 
            className="inline-flex items-center gap-2.5 cursor-pointer group" 
            onClick={() => onNavigate('login')}
            whileHover={{ x: 2 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          >
            <motion.span 
              className="p-2.5 bg-gradient-to-br from-brand-500 to-brand-700 text-white rounded-xl font-bold text-base font-mono shadow-lg shadow-brand-600/20"
              animate={{ scale: [1, 1.04, 1] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            >
              {brandInitials}
            </motion.span>
            <div>
              <span className="text-lg font-semibold tracking-tight text-white font-sans block">{brand.hotelName}</span>
              <span className="text-[9px] block font-mono text-brand-300 tracking-wider font-semibold uppercase -mt-1.5">{brand.hotelSubtitle}</span>
            </div>
          </motion.div>
        </div>

        {/* Middle Message */}
        <div className="relative z-10 max-w-md">
          <motion.span 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-brand-500/15 text-brand-300 border border-brand-500/15 rounded-full text-[10px] font-semibold tracking-wider uppercase mb-5 backdrop-blur-sm"
          >
            <Key className="w-3 h-3 text-brand-400" /> Secure Staff Portal
          </motion.span>
          <motion.h2 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="text-3xl font-semibold tracking-tight text-white uppercase leading-tight mb-4"
          >
            Empowering the finest hospitality
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="text-xs text-surface-300/90 leading-relaxed font-sans tracking-tight font-light"
          >
            To empower enterprise organizations with custom, high-velocity, and bulletproof web and desktop applications. We eliminate operational bottlenecks by constructing clean, highly-tested automated code pipelines, intuitive relational databases, and modern software-to-software API integrations.
          </motion.p>
        </div>

        {/* Footer info */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="relative z-10 text-[10px] font-mono text-surface-500 flex items-center gap-2"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/60 animate-pulse" />
          ENCRYPTION ENFORCED • Link Fortress IT Solutions
        </motion.div>
      </motion.div>

      {/* Main Login Card Right Area */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        className="flex-1 flex flex-col justify-center px-6 py-12 md:px-16 lg:px-24 bg-white relative overflow-hidden"
      >
        {/* Animated background orbs */}
        <FloatingOrbs />
        <DotsPattern />

        {/* Mobile top bar */}
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.4 }}
          className="absolute top-6 left-6 flex items-center justify-between w-[calc(100%-48px)] z-10"
        >
          <button 
            onClick={() => onNavigate('login')}
            className="flex items-center gap-1.5 text-xs text-surface-400 hover:text-surface-800 transition-all duration-200 font-medium group cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            <span>Back to site</span>
          </button>
        </motion.div>

        <div className="max-w-md w-full mx-auto mt-6 relative z-10">
          {/* Header section */}
          <motion.div 
            variants={itemFadeUp}
            initial="hidden"
            animate="visible"
            className="mb-8"
          >
            <motion.span 
              variants={itemFadeUp}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-brand-600 tracking-wider uppercase font-mono bg-brand-50/80 px-3 py-1 rounded-full border border-brand-100/50"
            >
              <Shield className="w-3 h-3" />
              {isSignUp ? 'Enroll New Colleague' : 'Secure Entry'}
            </motion.span>
            <motion.h1 
              variants={itemFadeUp}
              className="text-2xl font-bold font-sans tracking-tight text-surface-900 mt-3"
            >
              {isSignUp ? 'Start Your Amalfi Career' : 'Welcome Back'}
            </motion.h1>
            <motion.p 
              variants={itemFadeUp}
              className="text-xs text-surface-400 mt-1.5 max-w-sm"
            >
              {isSignUp 
                ? 'Create a unified staff profile linked instantly to the booking roster.' 
                : 'Access assigned check-in duties, room cleaning lists, and luxury metrics.'}
            </motion.p>
          </motion.div>

          <motion.form 
            key={isSignUp ? 'signup' : 'login'}
            variants={staggerVariants}
            initial="hidden"
            animate="visible"
            onSubmit={handleAuth} 
            className="space-y-4 text-xs font-sans tracking-tight"
          >
            {/* FULL NAME (Only for signups) */}
            <AnimatePresence mode="wait">
              {isSignUp && (
                <motion.div
                  key="fullname"
                  variants={itemFadeUp}
                  initial="hidden"
                  animate="visible"
                  exit={{ opacity: 0, height: 0, marginBottom: 0, overflow: 'hidden', transition: { duration: 0.2 } }}
                >
                  <label className="block text-surface-500 font-semibold mb-1.5 text-[11px]">Full Name</label>
                  <div className="relative group">
                    <User className="w-4 h-4 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2 transition-colors duration-200 group-focus-within:text-brand-500" />
                    <input 
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Penelope Cruz"
                      className="w-full bg-surface-50/80 border border-surface-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 focus:bg-white focus:outline-none rounded-xl py-3 pl-10 pr-4 text-surface-800 font-sans tracking-tight transition-all duration-200 placeholder:text-surface-400/70"
                    />
                    <div className="absolute inset-x-0 bottom-0 h-[1.5px] bg-brand-500/40 scale-x-0 group-focus-within:scale-x-100 transition-transform duration-300 rounded-full" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* EMAIL */}
            <motion.div variants={itemFadeUp}>
              <label className="block text-surface-500 font-semibold mb-1.5 text-[11px]">Work Email Address</label>
              <div className="relative group">
                <Mail className="w-4 h-4 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2 transition-colors duration-200 group-focus-within:text-brand-500" />
                <input 
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. penelope@grandhorizon.it"
                  className="w-full bg-surface-50/80 border border-surface-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 focus:bg-white focus:outline-none rounded-xl py-3 pl-10 pr-4 text-surface-800 font-sans tracking-tight transition-all duration-200 placeholder:text-surface-400/70"
                />
                <div className="absolute inset-x-0 bottom-0 h-[1.5px] bg-brand-500/40 scale-x-0 group-focus-within:scale-x-100 transition-transform duration-300 rounded-full" />
              </div>
            </motion.div>

            {/* PASSWORD */}
            <motion.div variants={itemFadeUp}>
              <label className="block text-surface-500 font-semibold mb-1.5 text-[11px]">Security Password</label>
              <div className="relative group">
                <Lock className="w-4 h-4 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2 transition-colors duration-200 group-focus-within:text-brand-500" />
                <input 
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full bg-surface-50/80 border border-surface-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 focus:bg-white focus:outline-none rounded-xl py-3 pl-10 pr-10 text-surface-800 font-sans tracking-tight transition-all duration-200 placeholder:text-surface-400/70"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 transition-colors cursor-pointer p-0.5"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
                <div className="absolute inset-x-0 bottom-0 h-[1.5px] bg-brand-500/40 scale-x-0 group-focus-within:scale-x-100 transition-transform duration-300 rounded-full" />
              </div>
            </motion.div>

            {/* REMEMBER ME (Sign-in only) */}
            {!isSignUp && (
              <motion.div variants={itemFadeUp} className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="sr-only"
                    />
                    <div className={`w-4 h-4 rounded border-2 transition-all duration-200 flex items-center justify-center ${
                      rememberMe 
                        ? 'bg-brand-600 border-brand-600' 
                        : 'border-surface-300 group-hover:border-brand-400'
                    }`}>
                      {rememberMe && (
                        <Check className="w-3 h-3 text-white" strokeWidth={3} />
                      )}
                    </div>
                  </div>
                  <span className="text-[11px] text-surface-500 group-hover:text-surface-700 transition-colors">Remember email</span>
                </label>
                <button
                  type="button"
                  className="text-[11px] text-brand-600 hover:text-brand-700 font-medium transition-colors cursor-pointer"
                >
                  Forgot password?
                </button>
              </motion.div>
            )}

            {/* ROLE PICKER (Only on Signup) */}
            <AnimatePresence mode="wait">
              {isSignUp && (
                <motion.div
                  key="rolepicker"
                  variants={itemFadeUp}
                  initial="hidden"
                  animate="visible"
                  exit={{ opacity: 0, height: 0, marginBottom: 0, overflow: 'hidden', transition: { duration: 0.2 } }}
                >
                  <label className="block text-surface-500 font-semibold mb-1.5 text-[11px]">Roster Role</label>
                  <div className="grid grid-cols-2 gap-2.5">
                    {([
                      { id: 'staff' as UserRole, label: 'Staff', icon: User, desc: 'General tasks' },
                      { id: 'guest' as UserRole, label: 'Guest', icon: User, desc: 'Guest portal only' },
                    ]).map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setRole(r.id)}
                        className={`relative p-3 border rounded-xl text-center transition-all duration-200 cursor-pointer overflow-hidden ${
                          role === r.id
                            ? 'border-brand-400 bg-brand-50/80 text-brand-800 shadow-sm shadow-brand-500/10'
                            : 'border-surface-200 text-surface-600 hover:bg-surface-50 hover:border-surface-300'
                        }`}
                      >
                        {role === r.id && (
                          <motion.div
                            layoutId="roleBg"
                            className="absolute inset-0 bg-gradient-to-br from-brand-500/[0.04] to-brand-600/[0.02]"
                            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                          />
                        )}
                        <div className="relative">
                          <r.icon className={`w-4 h-4 mx-auto mb-1.5 ${role === r.id ? 'text-brand-600' : 'text-surface-400'}`} />
                          <p className="font-semibold text-[11px] leading-tight">{r.label}</p>
                          <span className="text-[9px] text-surface-400 block leading-tight mt-0.5">{r.desc}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-surface-400 mt-2 leading-relaxed">
                    Only low-privilege roles are available in public registration. Elevated roles are assigned by administrators.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ERROR / SUCCESS ALERTS */}
            <AnimatePresence mode="wait">
              {errorMsg && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                  className="p-3.5 bg-rose-50/90 border border-rose-200/80 text-rose-700 rounded-xl text-xs leading-relaxed font-sans tracking-tight flex items-start gap-2.5"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-0.5 flex-shrink-0" />
                  <span>{errorMsg}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence mode="wait">
              {successMsg && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                  className="p-3.5 bg-emerald-50/90 border border-emerald-200/80 text-emerald-800 rounded-xl text-xs leading-relaxed font-sans tracking-tight flex items-start gap-2.5"
                >
                  <Check className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{successMsg}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* SUBMIT BUTTON */}
            <motion.div variants={itemFadeUp} className="pt-1">
              <motion.button
                type="submit"
                disabled={loading}
                whileHover={!loading ? { scale: 1.01 } : {}}
                whileTap={!loading ? { scale: 0.985 } : {}}
                className="w-full py-3.5 bg-gradient-to-r from-surface-900 to-surface-800 text-white font-semibold rounded-xl hover:from-brand-700 hover:to-brand-600 transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer text-xs shadow-lg shadow-surface-900/15 hover:shadow-xl hover:shadow-brand-600/15 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:from-surface-900 disabled:hover:to-surface-800"
              >
                {loading ? (
                  <>
                    <motion.span
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    >
                      <Loader2 className="w-4 h-4" />
                    </motion.span>
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      {isSignUp ? 'Creating Profile...' : 'Verifying Credentials...'}
                    </motion.span>
                  </>
                ) : (
                  <>
                    <span>{isSignUp ? 'Establish Workforce Entry' : 'Verify & Enter'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </motion.button>
            </motion.div>
          </motion.form>

          {/* Toggle register option */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            className="mt-8 text-center border-t border-surface-100 pt-6"
          >
            <motion.button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.985 }}
              className="text-surface-500 hover:text-surface-800 font-medium cursor-pointer flex items-center gap-1 mx-auto text-[12px] transition-colors duration-200"
            >
              {isSignUp ? (
                <>
                  <span>Already enrolled?</span>
                  <span className="text-brand-600 font-semibold hover:text-brand-700 flex items-center gap-0.5">
                    Sign in here
                    <ArrowRight className="w-3 h-3" />
                  </span>
                </>
              ) : (
                <>
                  <span>New resort team member?</span>
                  <span className="text-brand-600 font-semibold hover:text-brand-700 flex items-center gap-0.5">
                    Enroll here
                    <ArrowRight className="w-3 h-3" />
                  </span>
                </>
              )}
            </motion.button>
          </motion.div>

          {/* Kiosk Mode Link */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.4 }}
            className="mt-4 text-center"
          >
            <button
              onClick={() => onNavigate('kiosk')}
              className="text-[10px] text-surface-400 hover:text-brand-600 font-medium cursor-pointer transition-colors duration-200 group"
            >
              Kiosk Mode{' '}
              <span className="inline-block group-hover:translate-x-0.5 transition-transform">
                (Self Check-in)
              </span>
            </button>
          </motion.div>

          {/* Footer branding — Powered by Link Fortress */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7, duration: 0.4 }}
            className="mt-10 text-center"
          >
            <a
              href="https://linkfortress.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-50/80 border border-surface-200/60 hover:bg-brand-50 hover:border-brand-200/60 hover:shadow-sm hover:shadow-brand-500/5 transition-all duration-300 group"
            >
              <Shield className="w-3.5 h-3.5 text-surface-400 group-hover:text-brand-500 transition-colors duration-300" />
              <span className="text-[10px] font-medium text-surface-400 group-hover:text-brand-600 transition-colors duration-300">
                Powered by <span className="font-semibold">Link Fortress</span>
              </span>
              <ExternalLink className="w-3 h-3 text-surface-300 group-hover:text-brand-400 group-hover:translate-x-0.5 transition-all duration-300" />
            </a>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
