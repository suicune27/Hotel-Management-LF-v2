import { motion } from 'motion/react';
import React, { useState } from 'react';
import { Database, Check, Copy, ExternalLink, Settings, Sparkles, Key, Terminal } from 'lucide-react';

export default function ConfigurationGuide() {
  const [copied, setCopied] = useState(false);

  const sqlCode = `-- Hotel Groups Hotel - Supabase Setup Script
-- Paste this in your Supabase SQL Editor (https://database.new)

-- 1. Create Hotels, Profiles, Rooms, Customers, Bookings, Tasks, Testimonials, and Activity Logs
-- 2. Configure Row Level Security (RLS) & Triggers to synchronize user logins automatically
-- 3. Pre-populate elegant luxury room assets for Amalfi coast live search.

(Find the full copyable code in "schema.sql" in your workspace root!)`;

  const handleCopy = () => {
    navigator.clipboard.writeText(sqlCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-surface-50 text-surface-800 flex flex-col justify-between font-sans tracking-tight">
      {/* Dynamic light gradient bar */}
      <div className="h-1.5 w-full bg-gradient-to-r from-brand-500 via-brand-600 to-brand-700" />

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-6 py-12 flex-1 flex flex-col justify-center">
        <div className="bg-white rounded-2xl shadow-xl border border-surface-100 p-8 md:p-12 mb-8 relative overflow-hidden">
          {/* Subtle decoration */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-brand-50 rounded-full blur-3xl -z-10 transurface-x-20 -transurface-y-20 opacity-60" />

          {/* Icon and Title */}
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-brand-50 rounded-xl text-brand-600">
              <Database className="w-8 h-8" />
            </div>
            <div>
              <span className="text-xs font-semibold tracking-wider text-brand-600 uppercase">Configuration Required</span>
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-surface-900 mt-0.5">
                Connect your Supabase Database
              </h1>
            </div>
          </div>

          <p className="text-surface-600 text-base leading-relaxed mb-8 max-w-2xl">
            Welcome to the <strong>Hotel Groups Hotel</strong> management suite. 
            To power real-time luxury bookings, role-based employee views, and admin room tools, 
            this application requires connection to your own Supabase project. No slow, hardcoded mock data is used.
          </p>

          {/* Steps Grid */}
          <div className="grid md:grid-cols-2 gap-8 mb-8">
            {/* Step 1 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-50 text-brand-700 border border-brand-100 flex items-center justify-center font-semibold text-sm">
                1
              </div>
              <div>
                <h3 className="font-semibold text-surface-900 text-sm mb-1 flex items-center gap-1.5">
                  Create a Supabase Project <Sparkles className="w-3.5 h-3.5 text-brand-500" />
                </h3>
                <p className="text-xs text-surface-500 leading-relaxed">
                  Go to <a href="https://database.new" target="_blank" rel="noreferrer" className="text-brand-600 font-medium hover:underline inline-flex items-center gap-0.5">supabase.com <ExternalLink className="w-3 h-3" /></a> and create a fresh database.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-50 text-brand-700 border border-brand-100 flex items-center justify-center font-semibold text-sm">
                2
              </div>
              <div>
                <h3 className="font-semibold text-surface-900 text-sm mb-1 flex items-center gap-1.5">
                  Execute the Database Schema <Terminal className="w-3.5 h-3.5 text-brand-500" />
                </h3>
                <p className="text-xs text-surface-500 leading-relaxed">
                  Open the <strong>SQL Editor</strong> in Supabase, create a new query, copy the content of <strong>schema.sql</strong> inside this workspace, and click <strong>Run</strong>.
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-50 text-brand-700 border border-brand-100 flex items-center justify-center font-semibold text-sm">
                3
              </div>
              <div>
                <h3 className="font-semibold text-surface-900 text-sm mb-1 flex items-center gap-1.5">
                  Set AI Studio Secrets <Settings className="w-3.5 h-3.5 text-brand-500" />
                </h3>
                <p className="text-xs text-surface-500 leading-relaxed">
                  Go to <strong>Settings</strong> ➔ <strong>Secrets</strong> in the Google AI Studio menu and add:
                </p>
                <div className="mt-1.5 font-mono text-[10px] bg-surface-50 rounded border border-surface-100 p-1.5 space-y-0.5">
                  <div className="text-surface-600"><span className="text-brand-600 font-medium">VITE_SUPABASE_URL</span> = Your Api URL</div>
                  <div className="text-surface-600"><span className="text-brand-600 font-medium">VITE_SUPABASE_ANON_KEY</span> = Your Anon Key</div>
                </div>
              </div>
            </div>

            {/* Step 4 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-50 text-brand-700 border border-brand-100 flex items-center justify-center font-semibold text-sm">
                4
              </div>
              <div>
                <h3 className="font-semibold text-surface-900 text-sm mb-1 flex items-center gap-1.5">
                  Refresh & Explore <Check className="w-3.5 h-3.5 text-brand-100" />
                </h3>
                <p className="text-xs text-surface-500 leading-relaxed">
                  Once saved, the platform will hot-reload. The app will immediately display the public live luxury room booking site and role-based staff options!
                </p>
              </div>
            </div>
          </div>

          {/* Quick Script Copy */}
          <div className="border border-surface-150 rounded-xl overflow-hidden mt-6 bg-surface-50">
            <div className="px-4 py-2 bg-surface-100 border-b border-light-200 flex items-center justify-between text-xs text-surface-500 font-mono">
              <span>Hotel Groups Schema Preview</span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-surface-600 hover:text-surface-900 font-sans tracking-tight transition-colors cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700">Copied Schema Guide!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Snippet</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-4 text-xs font-mono text-surface-600 overflow-x-auto max-h-36 leading-relaxed">
              <code>{sqlCode}</code>
            </pre>
          </div>
        </div>

        {/* Footer Support Message */}
        <div className="text-center text-xs text-surface-400 font-mono flex items-center justify-center gap-1.5">
          <Key className="w-3.5 h-3.5 text-brand-500" />
          <span>RLS Securing Data in Real-Time ➔ Database Schema: schema.sql (at root)</span>
        </div>
      </div>
    </div>
  );
}
