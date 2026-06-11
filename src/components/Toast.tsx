import React, { useEffect, useCallback } from 'react';
import { Check, X, AlertTriangle, Info, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export type ToastType = 'success' | 'error' | 'info' | 'promo';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message: string;
  action?: { label: string; onClick: () => void };
}

const icons: Record<ToastType, React.ReactNode> = {
  success: <Check className="w-4 h-4" />,
  error: <AlertTriangle className="w-4 h-4" />,
  info: <Info className="w-4 h-4" />,
  promo: <Sparkles className="w-4 h-4" />,
};

const styles: Record<ToastType, string> = {
  success: 'bg-emerald-50/90 border-emerald-200 text-emerald-800',
  error: 'bg-rose-50/90 border-rose-200 text-rose-800',
  info: 'bg-sky-50/90 border-sky-200 text-sky-800',
  promo: 'bg-brand-50/90 border-brand-200 text-brand-800',
};

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 50, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 20, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={`flex items-start gap-3 p-4 rounded-xl border shadow-xl text-xs font-sans tracking-tight cursor-default ${styles[toast.type]}`}
      onClick={() => {
        if (toast.action) { toast.action.onClick(); onDismiss(toast.id); }
      }}
    >
      <span className="mt-0.5 flex-shrink-0">{icons[toast.type]}</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold">{toast.title}</p>
        <p className="opacity-80 mt-0.5 leading-relaxed">{toast.message}</p>
        {toast.action && (
          <span className="mt-2 inline-flex items-center gap-1 px-3 py-1 bg-black/10 rounded-lg text-[10px] font-bold hover:bg-black/15 transition-colors">
            {toast.action.label} →
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDismiss(toast.id); }}
        className="flex-shrink-0 p-0.5 rounded hover:bg-black/5 cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  const handleDismiss = useCallback((id: string) => onDismiss(id), [onDismiss]);

  return (
    <div className="fixed top-4 right-4 z-[200] flex flex-col gap-3 max-w-sm w-full pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} onDismiss={handleDismiss} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
