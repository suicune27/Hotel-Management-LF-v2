import { useState, useEffect, useRef } from 'react';
import { supabase } from './supabase';
import { createDebouncedSync } from './debounce';

export function useOptimisticSync<T extends { id: string }>(
  initialData: T,
  table: string,
  onSaveError?: (err: Error) => void
) {
  const [data, setData] = useState<T>(initialData);
  const originalDataRef = useRef<T>(initialData);
  const dataRef = useRef<T>(data);
  const onSaveErrorRef = useRef(onSaveError);
  onSaveErrorRef.current = onSaveError;

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const debouncedSaveRef = useRef<any>(null);
  if (!debouncedSaveRef.current || debouncedSaveRef.current._table !== table) {
    const fn: any = createDebouncedSync(async (payload: any, id: string) => {
      try {
        const { error } = await supabase.from(table).update(payload).eq('id', id);
        if (error) throw error;
        originalDataRef.current = { ...originalDataRef.current, ...payload };
      } catch (err: any) {
        setData(originalDataRef.current);
        if (onSaveErrorRef.current) onSaveErrorRef.current(err);
        else { /* sync error suppressed */ }
      }
    }, 5000);
    fn._table = table;
    debouncedSaveRef.current = fn;
  }
  const debouncedSave = debouncedSaveRef.current;

  const updateField = (key: keyof T, value: any) => {
    const payload = { [key]: value } as Partial<T>;
    const newData = { ...dataRef.current, ...payload };
    setData(newData);
    debouncedSave(payload, dataRef.current.id);
  };

  const updateMultiple = (payload: Partial<T>) => {
    const newData = { ...dataRef.current, ...payload };
    setData(newData);
    debouncedSave(payload, dataRef.current.id);
  };

  return { data, setData, updateField, updateMultiple };
}

/**
 * Batch manager for inserts or bulk updates.
 */
class MutationBatcher {
  private queue: { table: string; action: 'insert' | 'update' | 'delete'; payload: any; id?: string }[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  queueMutation(table: string, action: 'insert' | 'update' | 'delete', payload: any, id?: string) {
    this.queue.push({ table, action, payload, id });
    if (this.timer) clearTimeout(this.timer);
    
    this.timer = setTimeout(() => {
      this.flush();
    }, 5000);
  }

  async flush() {
    if (this.queue.length === 0) return;
    const currentQueue = [...this.queue];
    this.queue = [];
    
    // Group by table and action
    const grouped: Record<string, Record<string, any[]>> = {};
    for (const item of currentQueue) {
      if (!grouped[item.table]) grouped[item.table] = { insert: [], update: [], delete: [] };
      grouped[item.table][item.action].push(item);
    }

    for (const table of Object.keys(grouped)) {
      const actions = grouped[table];
      
      // Batch Inserts
      if (actions.insert.length > 0) {
        const payloads = actions.insert.map(i => i.payload);
        await supabase.from(table).insert(payloads).then();
      }

      // Individual Updates / Deletes (Supabase RPC would be better, but doing Promise.all for now)
      if (actions.update.length > 0) {
        await Promise.all(actions.update.map(u => supabase.from(table).update(u.payload).eq('id', u.id)));
      }
      if (actions.delete.length > 0) {
        await Promise.all(actions.delete.map(d => supabase.from(table).delete().eq('id', d.id)));
      }
    }
  }
}

export const globalBatcher = new MutationBatcher();
