import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AlertDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  onDismiss: () => void;
}

export function AlertDialog({ isOpen, title, message, onDismiss }: AlertDialogProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-surface-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 400 }}
            className="glass bg-white/90 rounded-2xl border border-white/40 shadow-2xl max-w-sm w-full p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 text-surface-950 font-mono text-xs font-bold uppercase tracking-wider pb-1.5 border-b border-surface-200/60">
              <AlertTriangle className="w-5 h-5 text-amber-500" /> {title}
            </div>
            <p className="text-xs text-surface-600 leading-relaxed font-sans tracking-tight">{message}</p>
            <div className="pt-2">
              <button
                type="button"
                onClick={onDismiss}
                className="w-full py-2.5 bg-surface-900 hover:bg-surface-800 text-white rounded-xl font-semibold transition-colors cursor-pointer text-center text-xs shadow-sm"
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  isDangerous?: boolean;
  confirmText?: string;
}

export function ConfirmDialog({ isOpen, title, message, onConfirm, onCancel, isDangerous = false, confirmText = 'Confirm' }: ConfirmDialogProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-surface-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 400 }}
            className="glass bg-white/90 rounded-2xl border border-white/40 shadow-2xl max-w-md w-full p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 text-surface-900 font-mono text-xs font-bold uppercase tracking-wider pb-1.5 border-b border-surface-200/60">
              <AlertTriangle className={`w-5 h-5 ${isDangerous ? 'text-rose-500' : 'text-brand-600'}`} /> {title}
            </div>
            <p className="text-xs text-surface-600 leading-relaxed font-sans tracking-tight">{message}</p>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 py-2.5 bg-white/60 hover:bg-white/90:bg-surface-800/90 border border-surface-200/80 rounded-xl text-surface-700 font-semibold transition-colors cursor-pointer text-center text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => { try { await onConfirm(); } catch (e) { console.error("Confirm error:", e); } }}
                className={`flex-1 py-2.5 text-white rounded-xl font-semibold transition-colors cursor-pointer text-center text-xs shadow-md ${
                  isDangerous
                    ? 'bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 border border-rose-600/50 shadow-rose-500/20'
                    : 'bg-gradient-to-r from-brand-600 to-brand-600 hover:from-brand-500 hover:to-brand-500 border border-brand-600/50 shadow-brand-500/20'
                }`}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
