import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import type { AppSettings } from '../../lib/settings';
import { Search, Filter, Plus, X, Camera, Package, User, Phone, Mail, Calendar, CheckCircle, Trash2, RotateCcw, ImageUp, Loader2 } from 'lucide-react';

interface AdminLostFoundTabProps {
  settings: AppSettings;
  addToast: (type: 'success' | 'error' | 'info', title: string, message: string) => void;
  refreshTable: (table: string) => Promise<void>;
  triggerConfirm: (title: string, message: string, onConfirm: () => Promise<void>, isDestructive?: boolean, confirmLabel?: string) => void;
  triggerAlert: (title: string, message: string) => void;
}

interface LostItem {
  id: string;
  item_name: string;
  description: string;
  category: string;
  location_found: string;
  found_by: string;
  found_date: string;
  photo_url: string | null;
  status: 'unclaimed' | 'claimed' | 'returned' | 'disposed';
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  claim_notes: string | null;
  claimed_at: string | null;
  returned_at: string | null;
  created_at: string;
}

interface ClaimFormData {
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  claim_notes: string;
}

const CATEGORY_OPTIONS = ['electronics', 'clothing', 'jewelry', 'documents', 'bags', 'keys', 'toys', 'other'];

const CATEGORY_LABELS: Record<string, string> = {
  electronics: 'Electronics',
  clothing: 'Clothing',
  jewelry: 'Jewelry',
  documents: 'Documents',
  bags: 'Bags',
  keys: 'Keys',
  toys: 'Toys',
  other: 'Other',
};

const STATUS_STYLES: Record<string, string> = {
  unclaimed: 'bg-amber-50 text-amber-700 border-amber-200',
  claimed: 'bg-sky-50 text-sky-700 border-sky-200',
  returned: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  disposed: 'bg-surface-100 text-surface-500 border-surface-200',
};

const STATUS_LABELS: Record<string, string> = {
  unclaimed: 'Unclaimed',
  claimed: 'Claimed',
  returned: 'Returned',
  disposed: 'Disposed',
};

const defaultNewItem = {
  item_name: '',
  description: '',
  category: 'other',
  location_found: '',
  found_by: '',
  found_date: new Date().toISOString().split('T')[0],
  photo_url: '',
};

const emptyClaimForm: ClaimFormData = {
  guest_name: '',
  guest_email: '',
  guest_phone: '',
  claim_notes: '',
};

export default function AdminLostFoundTab({
  settings,
  addToast,
  refreshTable,
  triggerConfirm,
  triggerAlert,
}: AdminLostFoundTabProps) {
  const [items, setItems] = useState<LostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [newItem, setNewItem] = useState(defaultNewItem);
  const [adding, setAdding] = useState(false);

  const [editingItem, setEditingItem] = useState<LostItem | null>(null);
  const [editForm, setEditForm] = useState(defaultNewItem);

  const [claimingItem, setClaimingItem] = useState<LostItem | null>(null);
  const [claimForm, setClaimForm] = useState<ClaimFormData>(emptyClaimForm);
  const [claiming, setClaiming] = useState(false);

  const [selectedItem, setSelectedItem] = useState<LostItem | null>(null);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('lost_found_items')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setItems(data || []);
    } catch (err: any) {
      addToast('error', 'Error', err.message || 'Failed to load lost & found items');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const totalItems = items.length;
  const unclaimedCount = items.filter(i => i.status === 'unclaimed').length;
  const claimedCount = items.filter(i => i.status === 'claimed').length;
  const returnedThisMonth = items.filter(i => {
    if (i.status !== 'returned' || !i.returned_at) return false;
    const returnedDate = new Date(i.returned_at);
    const now = new Date();
    return returnedDate.getMonth() === now.getMonth() && returnedDate.getFullYear() === now.getFullYear();
  }).length;

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (searchQuery && !item.item_name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (filterCategory && item.category !== filterCategory) return false;
      if (filterStatus && item.status !== filterStatus) return false;
      return true;
    });
  }, [items, searchQuery, filterCategory, filterStatus]);

  const handleAddItem = async () => {
    if (!newItem.item_name) {
      triggerAlert('Validation Error', 'Item name is required.');
      return;
    }
    setAdding(true);
    try {
      const { error } = await supabase.from('lost_found_items').insert({
        item_name: newItem.item_name,
        description: newItem.description,
        category: newItem.category,
        location_found: newItem.location_found,
        found_by: newItem.found_by,
        found_date: newItem.found_date,
        photo_url: newItem.photo_url || null,
      });
      if (error) throw error;
      addToast('success', 'Added', 'Lost item added successfully.');
      setShowAddModal(false);
      setNewItem(defaultNewItem);
      await fetchItems();
      await refreshTable('lost_found_items');
    } catch (err: any) {
      triggerAlert('Error', err.message || 'Failed to add item');
    } finally {
      setAdding(false);
    }
  };

  const handleEditItem = async () => {
    if (!editingItem) return;
    if (!editForm.item_name) {
      triggerAlert('Validation Error', 'Item name is required.');
      return;
    }
    try {
      const { error } = await supabase.from('lost_found_items').update({
        item_name: editForm.item_name,
        description: editForm.description,
        category: editForm.category,
        location_found: editForm.location_found,
        found_by: editForm.found_by,
        found_date: editForm.found_date,
        photo_url: editForm.photo_url || null,
      }).eq('id', editingItem.id);
      if (error) throw error;
      addToast('success', 'Updated', 'Item updated successfully.');
      setEditingItem(null);
      await fetchItems();
      await refreshTable('lost_found_items');
    } catch (err: any) {
      triggerAlert('Error', err.message || 'Failed to update item');
    }
  };

  const handleClaim = async () => {
    if (!claimingItem) return;
    if (!claimForm.guest_name) {
      triggerAlert('Validation Error', 'Guest name is required.');
      return;
    }
    setClaiming(true);
    try {
      const { error } = await supabase.from('lost_found_items').update({
        status: 'claimed',
        guest_name: claimForm.guest_name,
        guest_email: claimForm.guest_email || null,
        guest_phone: claimForm.guest_phone || null,
        claim_notes: claimForm.claim_notes || null,
        claimed_at: new Date().toISOString(),
      }).eq('id', claimingItem.id);
      if (error) throw error;
      addToast('success', 'Claimed', 'Item marked as claimed.');
      setClaimingItem(null);
      setClaimForm(emptyClaimForm);
      await fetchItems();
      await refreshTable('lost_found_items');
    } catch (err: any) {
      triggerAlert('Error', err.message || 'Failed to claim item');
    } finally {
      setClaiming(false);
    }
  };

  const handleReturn = async (item: LostItem) => {
    try {
      const { error } = await supabase.from('lost_found_items').update({
        status: 'returned',
        returned_at: new Date().toISOString(),
      }).eq('id', item.id);
      if (error) throw error;
      addToast('success', 'Returned', 'Item marked as returned.');
      await fetchItems();
      await refreshTable('lost_found_items');
    } catch (err: any) {
      triggerAlert('Error', err.message || 'Failed to return item');
    }
  };

  const handleDispose = (item: LostItem) => {
    triggerConfirm('Dispose Item', `Permanently dispose "${item.item_name}"?`, async () => {
      try {
        const { error } = await supabase.from('lost_found_items').update({ status: 'disposed' }).eq('id', item.id);
        if (error) throw error;
        addToast('success', 'Disposed', 'Item marked as disposed.');
        await fetchItems();
        await refreshTable('lost_found_items');
      } catch (err: any) {
        triggerAlert('Error', err.message || 'Failed to dispose item');
      }
    }, true, 'Dispose');
  };

  const handleDelete = (item: LostItem) => {
    triggerConfirm('Delete Item', `Permanently delete "${item.item_name}"? This cannot be undone.`, async () => {
      try {
        const { error } = await supabase.from('lost_found_items').delete().eq('id', item.id);
        if (error) throw error;
        addToast('success', 'Deleted', 'Item deleted permanently.');
        await fetchItems();
        await refreshTable('lost_found_items');
      } catch (err: any) {
        triggerAlert('Error', err.message || 'Failed to delete item');
      }
    }, true, 'Delete');
  };

  const openEditModal = (item: LostItem) => {
    setEditingItem(item);
    setEditForm({
      item_name: item.item_name,
      description: item.description,
      category: item.category,
      location_found: item.location_found,
      found_by: item.found_by,
      found_date: item.found_date,
      photo_url: item.photo_url || '',
    });
  };

  const openClaimModal = (item: LostItem) => {
    setClaimingItem(item);
    setClaimForm({
      guest_name: item.guest_name || '',
      guest_email: item.guest_email || '',
      guest_phone: item.guest_phone || '',
      claim_notes: item.claim_notes || '',
    });
  };

  const hasFilters = searchQuery || filterCategory || filterStatus;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-surface-900 tracking-tight">Lost & Found</h2>
          <p className="text-xs text-surface-400 mt-0.5">Track, manage, and return lost items to guests.</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-3 py-2 bg-surface-900 hover:bg-surface-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add Item
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-surface-100 shadow-sm p-4">
          <p className="text-2xl font-bold text-surface-900">{totalItems}</p>
          <p className="text-[10px] text-surface-400 font-semibold uppercase tracking-wider mt-0.5">Total Items</p>
        </div>
        <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-4">
          <p className="text-2xl font-bold text-amber-600">{unclaimedCount}</p>
          <p className="text-[10px] text-amber-500 font-semibold uppercase tracking-wider mt-0.5">Unclaimed</p>
        </div>
        <div className="bg-white rounded-2xl border border-sky-100 shadow-sm p-4">
          <p className="text-2xl font-bold text-sky-600">{claimedCount}</p>
          <p className="text-[10px] text-sky-500 font-semibold uppercase tracking-wider mt-0.5">Claimed</p>
        </div>
        <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-4">
          <p className="text-2xl font-bold text-emerald-600">{returnedThisMonth}</p>
          <p className="text-[10px] text-emerald-500 font-semibold uppercase tracking-wider mt-0.5">Returned This Month</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-surface-100 shadow-sm p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[140px] max-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-400" />
          <input
            type="text"
            placeholder="Search items..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-surface-50 border border-surface-100 rounded-lg text-xs text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-surface-200"
          />
        </div>
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className="px-3 py-1.5 bg-surface-50 border border-surface-100 rounded-lg text-xs text-surface-900 focus:outline-none focus:ring-2 focus:ring-surface-200"
        >
          <option value="">All Categories</option>
          {CATEGORY_OPTIONS.map(cat => (
            <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-1.5 bg-surface-50 border border-surface-100 rounded-lg text-xs text-surface-900 focus:outline-none focus:ring-2 focus:ring-surface-200"
        >
          <option value="">All Statuses</option>
          <option value="unclaimed">Unclaimed</option>
          <option value="claimed">Claimed</option>
          <option value="returned">Returned</option>
          <option value="disposed">Disposed</option>
        </select>
        {hasFilters && (
          <button
            onClick={() => { setSearchQuery(''); setFilterCategory(''); setFilterStatus(''); }}
            className="px-2 py-1.5 text-rose-600 hover:bg-rose-50 rounded-lg text-[10px] font-bold cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-surface-100 shadow-sm p-12 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-surface-400 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-surface-100 p-12 text-center max-w-sm mx-auto shadow-sm">
          <Package className="w-10 h-10 text-surface-200 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-surface-700">No lost items yet</h3>
          <p className="text-xs text-surface-400 mt-1">Add a lost item to start tracking.</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-white rounded-2xl border border-surface-100 p-12 text-center max-w-sm mx-auto shadow-sm">
          <Filter className="w-10 h-10 text-surface-200 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-surface-700">No matching items</h3>
          <p className="text-xs text-surface-400 mt-1">Try adjusting your search or filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredItems.map(item => (
            <div
              key={item.id}
              className="bg-white rounded-2xl border border-surface-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setSelectedItem(selectedItem?.id === item.id ? null : item)}
            >
              {item.photo_url ? (
                <div className="aspect-[4/3] overflow-hidden bg-surface-50">
                  <img
                    src={item.photo_url}
                    alt={item.item_name}
                    className="w-full h-full object-cover"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              ) : (
                <div className="aspect-[4/3] flex items-center justify-center bg-surface-50">
                  <Camera className="w-8 h-8 text-surface-200" />
                </div>
              )}
              <div className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-surface-900 truncate flex-1">{item.item_name}</p>
                  <span className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded-full border flex-shrink-0 ${STATUS_STYLES[item.status]}`}>
                    {STATUS_LABELS[item.status]}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-0.5 bg-surface-100 text-surface-600 text-[9px] font-bold uppercase rounded-full">
                    {CATEGORY_LABELS[item.category] || item.category}
                  </span>
                  <span className="text-[9px] text-surface-400">{item.location_found || 'N/A'}</span>
                </div>
                <p className="text-[10px] text-surface-400">Found: {item.found_date}</p>

                {selectedItem?.id === item.id && (
                  <div className="pt-2 border-t border-surface-100 space-y-2">
                    {item.description && (
                      <p className="text-[10px] text-surface-500">{item.description}</p>
                    )}
                    {item.found_by && (
                      <p className="text-[10px] text-surface-400">Found by: {item.found_by}</p>
                    )}
                    {item.guest_name && (
                      <div className="pt-1 space-y-0.5">
                        <p className="text-[10px] text-surface-600 font-semibold">Claim Info:</p>
                        <p className="text-[10px] text-surface-500 flex items-center gap-1"><User className="w-3 h-3" /> {item.guest_name}</p>
                        {item.guest_email && <p className="text-[10px] text-surface-500 flex items-center gap-1"><Mail className="w-3 h-3" /> {item.guest_email}</p>}
                        {item.guest_phone && <p className="text-[10px] text-surface-500 flex items-center gap-1"><Phone className="w-3 h-3" /> {item.guest_phone}</p>}
                        {item.claim_notes && <p className="text-[10px] text-surface-400 italic">"{item.claim_notes}"</p>}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {item.status === 'unclaimed' && (
                        <button
                          onClick={e => { e.stopPropagation(); openClaimModal(item); }}
                          className="px-2.5 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-[9px] font-bold cursor-pointer flex items-center gap-1"
                        >
                          <CheckCircle className="w-3 h-3" /> Claim
                        </button>
                      )}
                      {item.status === 'claimed' && (
                        <button
                          onClick={e => { e.stopPropagation(); handleReturn(item); }}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[9px] font-bold cursor-pointer flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" /> Return
                        </button>
                      )}
                      {item.status === 'unclaimed' && (
                        <button
                          onClick={e => { e.stopPropagation(); handleDispose(item); }}
                          className="px-2.5 py-1 bg-surface-200 hover:bg-surface-300 text-surface-600 rounded-lg text-[9px] font-bold cursor-pointer flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" /> Dispose
                        </button>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); openEditModal(item); }}
                        className="p-1.5 text-surface-400 hover:text-surface-700 hover:bg-surface-100 rounded-lg cursor-pointer"
                      >
                        <Package className="w-3 h-3" />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(item); }}
                        className="p-1.5 text-surface-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-surface-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl border border-surface-100 max-w-lg w-full p-6 space-y-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-surface-900">Add Lost Item</h3>
              <button onClick={() => setShowAddModal(false)} className="p-1 hover:bg-surface-100 rounded-lg cursor-pointer">
                <X className="w-4 h-4 text-surface-400" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="sm:col-span-2">
                <label className="block text-surface-500 font-semibold mb-1">Item Name *</label>
                <input type="text" value={newItem.item_name} onChange={e => setNewItem({ ...newItem, item_name: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-surface-500 font-semibold mb-1">Description</label>
                <textarea rows={2} value={newItem.description} onChange={e => setNewItem({ ...newItem, description: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500 resize-none" />
              </div>
              <div>
                <label className="block text-surface-500 font-semibold mb-1">Category</label>
                <select value={newItem.category} onChange={e => setNewItem({ ...newItem, category: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500">
                  {CATEGORY_OPTIONS.map(cat => (
                    <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-surface-500 font-semibold mb-1">Found Date</label>
                <input type="date" value={newItem.found_date} onChange={e => setNewItem({ ...newItem, found_date: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-surface-500 font-semibold mb-1">Location Found</label>
                <input type="text" value={newItem.location_found} onChange={e => setNewItem({ ...newItem, location_found: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-surface-500 font-semibold mb-1">Found By</label>
                <input type="text" value={newItem.found_by} onChange={e => setNewItem({ ...newItem, found_by: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-surface-500 font-semibold mb-1">Photo URL</label>
                <input type="text" value={newItem.photo_url} onChange={e => setNewItem({ ...newItem, photo_url: e.target.value })}
                  placeholder="https://example.com/photo.jpg"
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowAddModal(false)}
                className="flex-1 py-2.5 border border-surface-200 text-surface-600 rounded-lg text-xs font-semibold cursor-pointer hover:bg-surface-50 bg-white">
                Cancel
              </button>
              <button onClick={handleAddItem} disabled={adding}
                className="flex-1 py-2.5 bg-surface-900 text-white rounded-lg text-xs font-semibold cursor-pointer hover:bg-surface-800 disabled:opacity-50">
                {adding ? 'Adding...' : 'Add Item'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingItem && (
        <div className="fixed inset-0 bg-surface-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setEditingItem(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-surface-100 max-w-lg w-full p-6 space-y-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-surface-900">Edit Item</h3>
              <button onClick={() => setEditingItem(null)} className="p-1 hover:bg-surface-100 rounded-lg cursor-pointer">
                <X className="w-4 h-4 text-surface-400" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="sm:col-span-2">
                <label className="block text-surface-500 font-semibold mb-1">Item Name *</label>
                <input type="text" value={editForm.item_name} onChange={e => setEditForm({ ...editForm, item_name: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-surface-500 font-semibold mb-1">Description</label>
                <textarea rows={2} value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500 resize-none" />
              </div>
              <div>
                <label className="block text-surface-500 font-semibold mb-1">Category</label>
                <select value={editForm.category} onChange={e => setEditForm({ ...editForm, category: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500">
                  {CATEGORY_OPTIONS.map(cat => (
                    <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-surface-500 font-semibold mb-1">Found Date</label>
                <input type="date" value={editForm.found_date} onChange={e => setEditForm({ ...editForm, found_date: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-surface-500 font-semibold mb-1">Location Found</label>
                <input type="text" value={editForm.location_found} onChange={e => setEditForm({ ...editForm, location_found: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-surface-500 font-semibold mb-1">Found By</label>
                <input type="text" value={editForm.found_by} onChange={e => setEditForm({ ...editForm, found_by: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-surface-500 font-semibold mb-1">Photo URL</label>
                <input type="text" value={editForm.photo_url} onChange={e => setEditForm({ ...editForm, photo_url: e.target.value })}
                  placeholder="https://example.com/photo.jpg"
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setEditingItem(null)}
                className="flex-1 py-2.5 border border-surface-200 text-surface-600 rounded-lg text-xs font-semibold cursor-pointer hover:bg-surface-50 bg-white">
                Cancel
              </button>
              <button onClick={handleEditItem}
                className="flex-1 py-2.5 bg-surface-900 text-white rounded-lg text-xs font-semibold cursor-pointer hover:bg-surface-800">
                Update Item
              </button>
            </div>
          </div>
        </div>
      )}

      {claimingItem && (
        <div className="fixed inset-0 bg-surface-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setClaimingItem(null); setClaimForm(emptyClaimForm); }}>
          <div className="bg-white rounded-2xl shadow-xl border border-surface-100 max-w-md w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-surface-900">Claim Item</h3>
              <button onClick={() => { setClaimingItem(null); setClaimForm(emptyClaimForm); }} className="p-1 hover:bg-surface-100 rounded-lg cursor-pointer">
                <X className="w-4 h-4 text-surface-400" />
              </button>
            </div>
            <p className="text-xs text-surface-500">Marking "<span className="font-semibold text-surface-700">{claimingItem.item_name}</span>" as claimed. Enter guest details below.</p>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-surface-500 font-semibold mb-1">Guest Name *</label>
                <input type="text" value={claimForm.guest_name} onChange={e => setClaimForm({ ...claimForm, guest_name: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-surface-500 font-semibold mb-1">Email</label>
                  <input type="email" value={claimForm.guest_email} onChange={e => setClaimForm({ ...claimForm, guest_email: e.target.value })}
                    className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="block text-surface-500 font-semibold mb-1">Phone</label>
                  <input type="text" value={claimForm.guest_phone} onChange={e => setClaimForm({ ...claimForm, guest_phone: e.target.value })}
                    className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500" />
                </div>
              </div>
              <div>
                <label className="block text-surface-500 font-semibold mb-1">Claim Notes</label>
                <textarea rows={2} value={claimForm.claim_notes} onChange={e => setClaimForm({ ...claimForm, claim_notes: e.target.value })}
                  placeholder="Any additional notes about the claim..."
                  className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-brand-500 resize-none" />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => { setClaimingItem(null); setClaimForm(emptyClaimForm); }}
                className="flex-1 py-2.5 border border-surface-200 text-surface-600 rounded-lg text-xs font-semibold cursor-pointer hover:bg-surface-50 bg-white">
                Cancel
              </button>
              <button onClick={handleClaim} disabled={claiming}
                className="flex-1 py-2.5 bg-sky-600 text-white rounded-lg text-xs font-semibold cursor-pointer hover:bg-sky-700 disabled:opacity-50">
                {claiming ? 'Saving...' : 'Confirm Claim'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
