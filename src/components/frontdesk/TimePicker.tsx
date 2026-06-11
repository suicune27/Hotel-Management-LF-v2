import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface TimePickerProps {
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder?: string;
}

export function TimePicker({ value, onChange, options, placeholder = 'Select time' }: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setInput(value); }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = options.filter((o) =>
    o.toLowerCase().includes(input.toLowerCase())
  );

  const select = (val: string) => {
    onChange(val);
    setInput(val);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <div className="flex">
        <input
          type="text"
          value={input}
          onChange={(e) => { setInput(e.target.value); onChange(e.target.value); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full px-2.5 py-2 bg-surface-0 border border-surface-200 rounded-l-lg text-xs outline-none transition-all focus:border-brand-400 focus:bg-white focus:shadow-[0_0_0_2px_rgb(var(--brand-500)/0.08)]"
        />
        <button
          type="button"
          onClick={() => setOpen((p) => !p)}
          className="px-1.5 bg-surface-0 border border-l-0 border-surface-200 rounded-r-lg text-surface-400 hover:text-surface-600 cursor-pointer transition-colors"
        >
          <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {open && (
        <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white border border-surface-100 rounded-lg shadow-elevated max-h-36 overflow-y-auto animate-fade-in">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-surface-400">No matching times</div>
          ) : (
            filtered.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => select(opt)}
                className={`w-full text-left px-2.5 py-1.5 text-xs transition-colors cursor-pointer ${
                  opt === value ? 'bg-brand-50 text-brand-700 font-semibold' : 'text-surface-600 hover:bg-surface-0'
                }`}
              >
                {opt}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
