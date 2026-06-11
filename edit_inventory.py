import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

with open('src/components/AdminDashboard.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# ===== 1. Update imports =====
content = content.replace(
  "import { Room, Booking, Profile, Customer, ActivityLog, Hotel } from '../types';",
  "import { Room, Booking, Profile, Customer, ActivityLog, Hotel, MenuCategory, InventoryItem, GuestOrder } from '../types';"
)

# Add new lucide icons
content = content.replace(
  "Building, BookOpen, UserCheck, Users, Activity, Sparkles, DollarSign,\n  Plus, Edit2, Trash2, Check, X, Calendar, Edit3, Key, LogOut, Loader2, RefreshCw, Layers, Settings, AlertTriangle, Clock",
  "Building, BookOpen, UserCheck, Users, Activity, Sparkles, DollarSign,\n  Plus, Edit2, Trash2, Check, X, Calendar, Edit3, Key, LogOut, Loader2, RefreshCw, Layers, Settings, AlertTriangle, Clock,\n  Package, ShoppingCart, AlertCircle, Minus, PlusCircle"
)

# ===== 2. Add 'inventory' to AdminTab type =====
content = content.replace(
  "type AdminTab = 'insights' | 'rooms' | 'bookings' | 'workforce' | 'guests' | 'audit_logs' | 'settings';",
  "type AdminTab = 'insights' | 'rooms' | 'bookings' | 'workforce' | 'guests' | 'audit_logs' | 'inventory' | 'settings';"
)

# ===== 3. Add inventory state variables after employee CRUD states =====
old_states = """  // Employee CRUD states
  const [employeeModal, setEmployeeModal] = useState<'create' | 'edit' | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Profile | null>(null);
  const [employeeForm, setEmployeeForm] = useState({
    full_name: '',
    email: '',
    password: '',
    role: 'staff' as 'admin' | 'front_desk' | 'cook' | 'cleaner' | 'staff' | 'waiter'
  });

  // Debounced refetch"""
new_states = """  // Employee CRUD states
  const [employeeModal, setEmployeeModal] = useState<'create' | 'edit' | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Profile | null>(null);
  const [employeeForm, setEmployeeForm] = useState({
    full_name: '',
    email: '',
    password: '',
    role: 'staff' as 'admin' | 'front_desk' | 'cook' | 'cleaner' | 'staff' | 'waiter'
  });

  // Inventory CRUD states
  const [menuCategories, setMenuCategories] = useState<MenuCategory[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [guestOrders, setGuestOrders] = useState<GuestOrder[]>([]);
  const [inventoryModal, setInventoryModal] = useState<'category' | 'item' | 'stock' | 'order' | null>(null);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [itemForm, setItemForm] = useState({
    category_id: '',
    name: '',
    description: '',
    price: 0,
    stock_quantity: 0,
    unit: 'piece',
    low_stock_threshold: 5,
    image_url: ''
  });
  const [stockForm, setStockForm] = useState({ quantity: 0, action: 'add' as 'add' | 'remove' });
  const [orderForm, setOrderForm] = useState({ item_id: '', quantity: 1, notes: '' });

  // Debounced refetch"""
content = content.replace(old_states, new_states, 1)

# ===== 4. Add inventory data loading to loadDatabase =====
# Add inventory_items and menu_categories to the loadDatabase fetch
old_load = """      const [roomsD, bookingsD, staffD, customersD, logsD] = await Promise.all([
        supabase.from('rooms').select('*, hotels(*)').order('room_number', { ascending: true }),
        supabase.from('bookings').select('*, rooms(*), customers(*), profiles:users(*)').order('created_at', { ascending: false }),
        supabase.from('users').select('*').order('full_name', { ascending: true }),
        supabase.from('customers').select('*').order('created_at', { ascending: false }),
        supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(LOG_PAGE_SIZE)
      ]);

      if (roomsD.data) setRooms(roomsD.data);
      if (bookingsD.data) setBookings(bookingsD.data);
      if (staffD.data) setEmployees(staffD.data.filter((p: Profile) => p.role === 'admin' || p.role === 'front_desk' || p.role === 'cook' || p.role === 'cleaner' || p.role === 'staff' || p.role === 'waiter' || p.role === 'employee'));
      if (customersD.data) setCustomers(customersD.data);
      if (logsD.data) { setLogs(logsD.data); setLogPage(0); setLogHasMore(logsD.data.length >= LOG_PAGE_SIZE); }"""
new_load = """      const [roomsD, bookingsD, staffD, customersD, logsD, categoriesD, itemsD, ordersD] = await Promise.all([
        supabase.from('rooms').select('*, hotels(*)').order('room_number', { ascending: true }),
        supabase.from('bookings').select('*, rooms(*), customers(*), profiles:users(*)').order('created_at', { ascending: false }),
        supabase.from('users').select('*').order('full_name', { ascending: true }),
        supabase.from('customers').select('*').order('created_at', { ascending: false }),
        supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(LOG_PAGE_SIZE),
        supabase.from('menu_categories').select('*').order('name', { ascending: true }),
        supabase.from('inventory_items').select('*, menu_categories(*)').order('name', { ascending: true }),
        supabase.from('guest_orders').select('*, inventory_items(*), bookings(*, customers(*), rooms(*))').order('created_at', { ascending: false })
      ]);

      if (roomsD.data) setRooms(roomsD.data);
      if (bookingsD.data) setBookings(bookingsD.data);
      if (staffD.data) setEmployees(staffD.data.filter((p: Profile) => p.role === 'admin' || p.role === 'front_desk' || p.role === 'cook' || p.role === 'cleaner' || p.role === 'staff' || p.role === 'waiter' || p.role === 'employee'));
      if (customersD.data) setCustomers(customersD.data);
      if (logsD.data) { setLogs(logsD.data); setLogPage(0); setLogHasMore(logsD.data.length >= LOG_PAGE_SIZE); }
      if (categoriesD.data) setMenuCategories(categoriesD.data);
      if (itemsD.data) setInventoryItems(itemsD.data);
      if (ordersD.data) setGuestOrders(ordersD.data);"""
content = content.replace(old_load, new_load, 1)

# ===== 5. Add inventory CRUD handlers before the return statement =====
# Find the last handler before return and add inventory handlers
old_handlers = """  const handleEmployeeDelete = (emp: Profile) => {
    triggerConfirm(
      'Remove Employee',
      `Are you sure you want to remove ${emp.full_name} (${emp.role}) from the workforce? This will revoke their portal access. Their existing booking assignments will be unlinked.`,
      async () => {
        try {
          // First unlink any bookings assigned to this employee
          await supabase.from('bookings').update({ assigned_employee_id: null }).eq('assigned_employee_id', emp.id);

          // Delete from public.users
          const { error } = await supabase.from('users').delete().eq('id', emp.id);
          if (error) throw error;

          await supabase.from('activity_logs').insert({
            user_id: userProfile?.id,
            user_name: userProfile?.full_name || 'Admin Specialist',
            action: 'Employee Removed',
            details: `${emp.full_name} (${emp.role}) removed from workforce`
          });

          addToast('success', 'Employee Removed', `${emp.full_name} has been removed.`);
          await loadDatabase();
        } catch (err: any) {
          triggerAlert("Delete Error", err.message);
        }
      },
      true,
      'Remove'
    );
  };

  return ("""
new_handlers = """  const handleEmployeeDelete = (emp: Profile) => {
    triggerConfirm(
      'Remove Employee',
      `Are you sure you want to remove ${emp.full_name} (${emp.role}) from the workforce? This will revoke their portal access. Their existing booking assignments will be unlinked.`,
      async () => {
        try {
          await supabase.from('bookings').update({ assigned_employee_id: null }).eq('assigned_employee_id', emp.id);
          const { error } = await supabase.from('users').delete().eq('id', emp.id);
          if (error) throw error;
          await supabase.from('activity_logs').insert({
            user_id: userProfile?.id,
            user_name: userProfile?.full_name || 'Admin Specialist',
            action: 'Employee Removed',
            details: `${emp.full_name} (${emp.role}) removed from workforce`
          });
          addToast('success', 'Employee Removed', `${emp.full_name} has been removed.`);
          await loadDatabase();
        } catch (err: any) {
          triggerAlert("Delete Error", err.message);
        }
      },
      true,
      'Remove'
    );
  };

  // ===== INVENTORY CRUD HANDLERS =====
  const handleAddMenuCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    if (menuCategories.find(c => c.name.toLowerCase() === name.toLowerCase())) {
      triggerAlert('Duplicate Category', 'This menu category already exists.');
      return;
    }
    try {
      const { error } = await supabase.from('menu_categories').insert({ name });
      if (error) throw error;
      addToast('success', 'Category Added', `"${name}" menu category created.`);
      setNewCategoryName('');
      await loadDatabase();
    } catch (err: any) {
      triggerAlert('Error', err.message);
    }
  };

  const handleDeleteMenuCategory = (cat: MenuCategory) => {
    triggerConfirm('Delete Category', `Remove "${cat.name}" category? Items in this category will be unlinked.`, async () => {
      try {
        await supabase.from('menu_categories').delete().eq('id', cat.id);
        addToast('success', 'Category Deleted', `"${cat.name}" removed.`);
        await loadDatabase();
      } catch (err: any) {
        triggerAlert('Error', err.message);
      }
    }, true, 'Delete');
  };

  const handleOpenItemCreate = () => {
    setSelectedItem(null);
    setItemForm({ category_id: menuCategories[0]?.id || '', name: '', description: '', price: 0, stock_quantity: 0, unit: 'piece', low_stock_threshold: 5, image_url: '' });
    setInventoryModal('item');
  };

  const handleOpenItemEdit = (item: InventoryItem) => {
    setSelectedItem(item);
    setItemForm({ category_id: item.category_id, name: item.name, description: item.description, price: Number(item.price), stock_quantity: Number(item.stock_quantity), unit: item.unit, low_stock_threshold: Number(item.low_stock_threshold), image_url: item.image_url });
    setInventoryModal('item');
  };

  const handleItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        category_id: itemForm.category_id || null,
        name: itemForm.name.trim(),
        description: itemForm.description.trim(),
        price: Number(itemForm.price),
        stock_quantity: Number(itemForm.stock_quantity),
        unit: itemForm.unit.trim() || 'piece',
        low_stock_threshold: Number(itemForm.low_stock_threshold),
        image_url: itemForm.image_url.trim()
      };

      if (selectedItem) {
        const { error } = await supabase.from('inventory_items').update(payload).eq('id', selectedItem.id);
        if (error) throw error;
        addToast('success', 'Item Updated', `${payload.name} updated.`);
      } else {
        const { error } = await supabase.from('inventory_items').insert(payload);
        if (error) throw error;
        addToast('success', 'Item Created', `${payload.name} added to inventory.`);
      }

      setInventoryModal(null);
      await supabase.from('activity_logs').insert({
        user_id: userProfile?.id,
        user_name: userProfile?.full_name || 'Admin',
        action: selectedItem ? 'Inventory Updated' : 'Inventory Created',
        details: `${payload.name} ${selectedItem ? 'updated' : 'added'}`
      });
      await loadDatabase();
    } catch (err: any) {
      triggerAlert('Error', err.message);
    }
  };

  const handleDeleteInventoryItem = (item: InventoryItem) => {
    triggerConfirm('Delete Item', `Remove "${item.name}" from inventory?`, async () => {
      try {
        await supabase.from('inventory_items').delete().eq('id', item.id);
        addToast('success', 'Item Deleted', `${item.name} removed.`);
        await loadDatabase();
      } catch (err: any) {
        triggerAlert('Error', err.message);
      }
    }, true, 'Delete');
  };

  const handleOpenStockAdjust = (item: InventoryItem) => {
    setSelectedItem(item);
    setStockForm({ quantity: 0, action: 'add' });
    setInventoryModal('stock');
  };

  const handleStockAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || stockForm.quantity <= 0) return;
    try {
      const delta = stockForm.action === 'add' ? stockForm.quantity : -stockForm.quantity;
      const newQty = Number(selectedItem.stock_quantity) + delta;
      if (newQty < 0) throw new Error('Stock cannot go below 0.');

      const { error } = await supabase.from('inventory_items').update({ stock_quantity: newQty }).eq('id', selectedItem.id);
      if (error) throw error;

      addToast('success', 'Stock Updated', `${selectedItem.name} stock ${stockForm.action === 'add' ? 'increased' : 'reduced'} by ${stockForm.quantity}.`);
      setInventoryModal(null);
      await supabase.from('activity_logs').insert({
        user_id: userProfile?.id,
        user_name: userProfile?.full_name || 'Admin',
        action: 'Stock Adjusted',
        details: `${selectedItem.name}: ${stockForm.action === 'add' ? '+' : '-'}${stockForm.quantity} (now ${newQty})`
      });
      await loadDatabase();
    } catch (err: any) {
      triggerAlert('Stock Error', err.message);
    }
  };

  // Guest order placement
  const handleOpenOrderCreate = (booking: Booking) => {
    setSelectedBookingDetail(booking);
    setOrderForm({ item_id: inventoryItems[0]?.id || '', quantity: 1, notes: '' });
    setInventoryModal('order');
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBookingDetail) return;
    try {
      const item = inventoryItems.find(i => i.id === orderForm.item_id);
      if (!item) throw new Error('Select a menu item.');
      if (Number(item.stock_quantity) < orderForm.quantity) {
        throw new Error(`Insufficient stock: only ${item.stock_quantity} ${item.unit}(s) available.`);
      }
      const totalPrice = Number(item.price) * orderForm.quantity;

      const { error } = await supabase.from('guest_orders').insert({
        booking_id: selectedBookingDetail.id,
        item_id: orderForm.item_id,
        quantity: orderForm.quantity,
        unit_price: Number(item.price),
        total_price: totalPrice,
        status: 'pending',
        notes: orderForm.notes.trim()
      });
      if (error) throw error;

      // Deduct stock
      const newQty = Number(item.stock_quantity) - orderForm.quantity;
      await supabase.from('inventory_items').update({ stock_quantity: newQty }).eq('id', item.id);

      addToast('success', 'Order Placed', `${item.name} x${orderForm.quantity} added to booking.`);
      setInventoryModal(null);
      await supabase.from('activity_logs').insert({
        user_id: userProfile?.id,
        user_name: userProfile?.full_name || 'Admin',
        action: 'Guest Order Placed',
        details: `${item.name} x${orderForm.quantity} for ${selectedBookingDetail.customers?.full_name}`
      });
      await loadDatabase();
    } catch (err: any) {
      triggerAlert('Order Error', err.message);
    }
  };

  const handleUpdateOrderStatus = async (order: GuestOrder, newStatus: string) => {
    try {
      const { error } = await supabase.from('guest_orders').update({ status: newStatus }).eq('id', order.id);
      if (error) throw error;
      addToast('success', 'Order Updated', `Order status changed to ${newStatus}.`);
      await loadDatabase();
    } catch (err: any) {
      triggerAlert('Error', err.message);
    }
  };

  // Low-stock check helper
  const lowStockItems = inventoryItems.filter(i => Number(i.stock_quantity) <= Number(i.low_stock_threshold));

  return ("""
content = content.replace(old_handlers, new_handlers, 1)

# ===== 6. Add Inventory tab to the navigation tabs =====
old_tabs = """            {[
              { id: 'insights', label: 'Overview Metrics', icon: Activity },
              { id: 'rooms', label: 'Rooms Roster (CRUD)', icon: Building },
              { id: 'bookings', label: 'Bookings & Staffing', icon: BookOpen },
              { id: 'workforce', label: 'Hotel Workforce', icon: UserCheck },
              { id: 'guests', label: 'Active Guest Cards', icon: Users },
              { id: 'audit_logs', label: 'Security Logs', icon: Layers },
              { id: 'settings', label: 'Resort Settings', icon: Settings }
            ].map((tab) => {"""
new_tabs = """            {[
              { id: 'insights', label: 'Overview Metrics', icon: Activity },
              { id: 'rooms', label: 'Rooms Roster (CRUD)', icon: Building },
              { id: 'bookings', label: 'Bookings & Staffing', icon: BookOpen },
              { id: 'workforce', label: 'Hotel Workforce', icon: UserCheck },
              { id: 'guests', label: 'Active Guest Cards', icon: Users },
              { id: 'inventory', label: 'Kitchen Inventory', icon: Package },
              { id: 'audit_logs', label: 'Security Logs', icon: Layers },
              { id: 'settings', label: 'Resort Settings', icon: Settings }
            ].map((tab) => {"""
content = content.replace(old_tabs, new_tabs, 1)

# ===== 7. Add Inventory tab content before Settings tab =====
old_settings_tab = """              {/* TABS 7: RESORT SETTINGS SETUP */}
              {activeTab === 'settings' && ("""
new_settings_tab = """              {/* TABS 7: KITCHEN INVENTORY */}
              {activeTab === 'inventory' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 tracking-tight">Kitchen Menu &amp; Inventory</h2>
                      <p className="text-xs text-slate-400 mt-0.5">Manage menu categories, stock levels, and track guest orders.</p>
                    </div>
                    <button
                      onClick={handleOpenItemCreate}
                      className="px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 transition-all text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Menu Item</span>
                    </button>
                  </div>

                  {/* Low Stock Alert Banner */}
                  {lowStockItems.length > 0 && (
                    <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                      <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-amber-800 text-xs block">Low Stock Alert — {lowStockItems.length} item{lowStockItems.length > 1 ? 's' : ''} running low</span>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {lowStockItems.slice(0, 5).map(item => (
                            <span key={item.id} className="inline-flex items-center gap-1 px-2 py-1 bg-white rounded-md text-[10px] font-mono text-amber-700 border border-amber-200">
                              {item.name} ({Number(item.stock_quantity)} {item.unit})
                            </span>
                          ))}
                          {lowStockItems.length > 5 && <span className="text-[10px] text-amber-600 self-center">+{lowStockItems.length - 5} more</span>}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Menu Categories */}
                  <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5" /> Menu Categories
                    </h3>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {menuCategories.map(cat => (
                        <span key={cat.id} className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-50 border border-slate-150 rounded-lg text-[10px] font-medium text-slate-700">
                          {cat.name}
                          <button onClick={() => handleDeleteMenuCategory(cat)} className="w-3.5 h-3.5 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 flex items-center justify-center text-[8px]">×</button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input type="text" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)}
                        placeholder="New category name" className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-indigo-500"
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddMenuCategory(); } }} />
                      <button onClick={handleAddMenuCategory} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-semibold hover:bg-indigo-700 cursor-pointer">Add</button>
                    </div>
                  </div>

                  {/* Inventory Items Table */}
                  {inventoryItems.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center max-w-sm mx-auto">
                      <Package className="w-10 h-10 text-slate-300 mx-auto mb-4" />
                      <h3 className="text-base font-semibold text-slate-800">No menu items yet</h3>
                      <p className="text-xs text-slate-400 mt-1">Add menu items and stock to start tracking kitchen inventory.</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden text-xs">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50/80 border-b border-slate-150 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                              <th className="p-3">Item</th>
                              <th className="p-3">Category</th>
                              <th className="p-3">Price</th>
                              <th className="p-3">Stock</th>
                              <th className="p-3">Threshold</th>
                              <th className="p-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {inventoryItems.map(item => {
                              const isLow = Number(item.stock_quantity) <= Number(item.low_stock_threshold);
                              return (
                                <tr key={item.id} className="hover:bg-slate-50/50">
                                  <td className="p-3 font-semibold text-slate-900">{item.name}</td>
                                  <td className="p-3 text-slate-500">{item.menu_categories?.name || '—'}</td>
                                  <td className="p-3 font-mono font-semibold text-slate-900">{settings.currencySymbol}{Number(item.price).toFixed(2)}</td>
                                  <td className="p-3">
                                    <span className={`font-mono font-bold ${isLow ? 'text-rose-600' : 'text-emerald-600'}`}>
                                      {Number(item.stock_quantity)} {item.unit}
                                      {isLow && <AlertCircle className="w-3 h-3 inline ml-1 text-rose-500" />}
                                    </span>
                                  </td>
                                  <td className="p-3 text-slate-400 font-mono">{item.low_stock_threshold} {item.unit}</td>
                                  <td className="p-3 text-right space-x-1">
                                    <button onClick={() => handleOpenStockAdjust(item)} className="p-1 px-2 bg-emerald-50 text-emerald-700 rounded font-medium text-[10px] hover:bg-emerald-100 cursor-pointer">Stock</button>
                                    <button onClick={() => handleOpenItemEdit(item)} className="p-1 px-2 bg-slate-100 text-slate-700 rounded font-medium text-[10px] hover:bg-slate-200 cursor-pointer">Edit</button>
                                    <button onClick={() => handleDeleteInventoryItem(item)} className="p-1 px-2 bg-rose-50 text-rose-700 rounded font-medium text-[10px] hover:bg-rose-100 cursor-pointer">Del</button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Recent Guest Orders */}
                  {guestOrders.length > 0 && (
                    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                      <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                        <ShoppingCart className="w-3.5 h-3.5" /> Recent Guest Orders ({guestOrders.length})
                      </h3>
                      <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                        {guestOrders.slice(0, 20).map(o => (
                          <div key={o.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                            <div className="flex items-center gap-3">
                              <span className="font-semibold text-slate-800 min-w-[100px] text-[11px]">{o.inventory_items?.name}</span>
                              <span className="text-slate-400 text-[10px]">x{o.quantity}</span>
                              <span className="font-mono text-slate-600 text-[10px]">{settings.currencySymbol}{Number(o.total_price).toFixed(2)}</span>
                              <span className="text-slate-400 text-[10px]">— {o.bookings?.customers?.full_name || 'N/A'} (Suite {o.bookings?.rooms?.room_number || '?'})</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className={`px-1.5 py-0.5 font-bold uppercase text-[8px] rounded-full ${
                                o.status === 'served' ? 'bg-emerald-50 text-emerald-700' : o.status === 'preparing' ? 'bg-amber-50 text-amber-700' : o.status === 'cancelled' ? 'bg-rose-50 text-rose-700' : 'bg-sky-50 text-sky-700'
                              }`}>{o.status}</span>
                              {o.status === 'pending' && <button onClick={() => handleUpdateOrderStatus(o, 'preparing')} className="p-0.5 px-1.5 bg-amber-50 text-amber-700 rounded text-[8px] font-medium hover:bg-amber-100 cursor-pointer">Prep</button>}
                              {o.status === 'preparing' && <button onClick={() => handleUpdateOrderStatus(o, 'served')} className="p-0.5 px-1.5 bg-emerald-50 text-emerald-700 rounded text-[8px] font-medium hover:bg-emerald-100 cursor-pointer">Serve</button>}
                              {o.status === 'pending' && <button onClick={() => handleUpdateOrderStatus(o, 'cancelled')} className="p-0.5 px-1.5 bg-rose-50 text-rose-700 rounded text-[8px] font-medium hover:bg-rose-100 cursor-pointer">X</button>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TABS 8: RESORT SETTINGS SETUP */}
              {activeTab === 'settings' && ("""
content = content.replace(old_settings_tab, new_settings_tab, 1)

# ===== 8. Add inventory modals before the booking detail modal =====
old_inventory_modal_insert = """      {/* EMPLOYEE CREATE/EDIT MODAL */}
      {employeeModal && ("""
new_inventory_modal_insert = """      {/* INVENTORY ITEM CREATE/EDIT MODAL */}
      {inventoryModal === 'item' && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setInventoryModal(null)}>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">{selectedItem ? 'Edit Menu Item' : 'Add Menu Item'}</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">{selectedItem ? 'Update item details and pricing' : 'Add a new item to the kitchen menu'}</p>
              </div>
              <button onClick={() => setInventoryModal(null)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleItemSubmit} className="p-6 space-y-4 text-xs font-sans">
              <div>
                <label className="block text-slate-500 font-medium mb-1">Item Name</label>
                <input type="text" required value={itemForm.name} onChange={(e) => setItemForm({...itemForm, name: e.target.value})}
                  placeholder="e.g. Caprese Salad" className="w-full bg-white border border-slate-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 font-medium mb-1">Category</label>
                  <select value={itemForm.category_id} onChange={(e) => setItemForm({...itemForm, category_id: e.target.value})}
                    className="w-full bg-white border border-slate-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer">
                    <option value="">No category</option>
                    {menuCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-500 font-medium mb-1">Price ({settings.currencyCode})</label>
                  <input type="number" required min={0} step="0.01" value={itemForm.price} onChange={(e) => setItemForm({...itemForm, price: Number(e.target.value)})}
                    className="w-full bg-white border border-slate-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-indigo-500 font-mono" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-500 font-medium mb-1">Stock Qty</label>
                  <input type="number" required min={0} value={itemForm.stock_quantity} onChange={(e) => setItemForm({...itemForm, stock_quantity: Number(e.target.value)})}
                    className="w-full bg-white border border-slate-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-indigo-500 font-mono" />
                </div>
                <div>
                  <label className="block text-slate-500 font-medium mb-1">Unit</label>
                  <select value={itemForm.unit} onChange={(e) => setItemForm({...itemForm, unit: e.target.value})}
                    className="w-full bg-white border border-slate-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer">
                    <option value="piece">piece</option>
                    <option value="serving">serving</option>
                    <option value="plate">plate</option>
                    <option value="glass">glass</option>
                    <option value="bottle">bottle</option>
                    <option value="bowl">bowl</option>
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                    <option value="L">L</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-500 font-medium mb-1">Low Alert</label>
                  <input type="number" required min={0} value={itemForm.low_stock_threshold} onChange={(e) => setItemForm({...itemForm, low_stock_threshold: Number(e.target.value)})}
                    className="w-full bg-white border border-slate-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-indigo-500 font-mono" />
                </div>
              </div>
              <div>
                <label className="block text-slate-500 font-medium mb-1">Description</label>
                <textarea rows={2} value={itemForm.description} onChange={(e) => setItemForm({...itemForm, description: e.target.value})}
                  className="w-full bg-white border border-slate-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-indigo-500" />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setInventoryModal(null)} className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg font-medium cursor-pointer text-xs">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-lg font-semibold cursor-pointer text-xs">
                  {selectedItem ? 'Save Changes' : 'Add Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* STOCK ADJUSTMENT MODAL */}
      {inventoryModal === 'stock' && selectedItem && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setInventoryModal(null)}>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-sm w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Adjust Stock: {selectedItem.name}</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Current stock: {Number(selectedItem.stock_quantity)} {selectedItem.unit}</p>
              </div>
              <button onClick={() => setInventoryModal(null)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleStockAdjust} className="p-6 space-y-4 text-xs font-sans">
              <div className="flex gap-2">
                {(['add', 'remove'] as const).map(a => (
                  <button key={a} type="button" onClick={() => setStockForm({...stockForm, action: a})}
                    className={`flex-1 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      stockForm.action === a ? (a === 'add' ? 'bg-emerald-50 text-emerald-700 border-2 border-emerald-300' : 'bg-rose-50 text-rose-700 border-2 border-rose-300') : 'bg-slate-50 text-slate-400 border-2 border-transparent hover:border-slate-200'
                    }`}>
                    {a === 'add' ? <><PlusCircle className="w-3.5 h-3.5 inline mr-1" /> Add Stock</> : <><Minus className="w-3.5 h-3.5 inline mr-1" /> Remove</>}
                  </button>
                ))}
              </div>
              <div>
                <label className="block text-slate-500 font-medium mb-1">Quantity ({selectedItem.unit})</label>
                <input type="number" required min={1} value={stockForm.quantity || ''} onChange={(e) => setStockForm({...stockForm, quantity: Number(e.target.value)})}
                  className="w-full bg-white border border-slate-200 rounded-lg py-2.5 px-3 text-xs font-mono focus:outline-none focus:border-indigo-500" />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setInventoryModal(null)} className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg font-medium cursor-pointer text-xs">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-lg font-semibold cursor-pointer text-xs">Update Stock</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GUEST ORDER MODAL */}
      {inventoryModal === 'order' && selectedBookingDetail && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setInventoryModal(null)}>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-sm w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Place Order</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">For {selectedBookingDetail.customers?.full_name} — Suite {selectedBookingDetail.rooms?.room_number}</p>
              </div>
              <button onClick={() => setInventoryModal(null)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handlePlaceOrder} className="p-6 space-y-4 text-xs font-sans">
              <div>
                <label className="block text-slate-500 font-medium mb-1">Menu Item</label>
                <select value={orderForm.item_id} onChange={(e) => setOrderForm({...orderForm, item_id: e.target.value})}
                  className="w-full bg-white border border-slate-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer">
                  {inventoryItems.filter(i => Number(i.stock_quantity) > 0).map(i => (
                    <option key={i.id} value={i.id}>{i.name} — {settings.currencySymbol}{Number(i.price).toFixed(2)} ({Number(i.stock_quantity)} {i.unit} available)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-500 font-medium mb-1">Quantity</label>
                <input type="number" required min={1} value={orderForm.quantity} onChange={(e) => setOrderForm({...orderForm, quantity: Number(e.target.value)})}
                  className="w-full bg-white border border-slate-200 rounded-lg py-2.5 px-3 text-xs font-mono focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-slate-500 font-medium mb-1">Notes</label>
                <input type="text" value={orderForm.notes} onChange={(e) => setOrderForm({...orderForm, notes: e.target.value})}
                  placeholder="e.g. No onions" className="w-full bg-white border border-slate-200 rounded-lg py-2.5 px-3 text-xs focus:outline-none focus:border-indigo-500" />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setInventoryModal(null)} className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg font-medium cursor-pointer text-xs">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg font-semibold cursor-pointer text-xs">Place Order</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EMPLOYEE CREATE/EDIT MODAL */}
      {employeeModal && ("""
content = content.replace(old_inventory_modal_insert, new_inventory_modal_insert, 1)

# ===== 9. Add guest orders section to the booking detail modal =====
# Add "Place Order" button and orders list inside the booking detail modal
old_booking_modal_orders = """              {/* Occupancy Toggle Action */}
              {canToggle && ("""
new_booking_modal_orders = """              {/* Guest Orders */}
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                  <ShoppingCart className="w-3.5 h-3.5" /> Guest Orders
                </h4>
                {(() => {
                  const bookingOrders = guestOrders.filter(o => o.booking_id === b.id);
                  return (
                    <>
                      {bookingOrders.length === 0 ? (
                        <p className="text-slate-400 text-xs italic py-2">No orders placed for this booking yet.</p>
                      ) : (
                        <div className="space-y-1.5 max-h-[150px] overflow-y-auto mb-3">
                          {bookingOrders.map(o => (
                            <div key={o.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-800 text-[11px]">{o.inventory_items?.name}</span>
                                <span className="text-slate-400 text-[10px]">x{o.quantity}</span>
                                <span className="font-mono text-slate-600 text-[10px]">{settings.currencySymbol}{Number(o.total_price).toFixed(2)}</span>
                              </div>
                              <span className={`px-1.5 py-0.5 font-bold uppercase text-[8px] rounded-full ${
                                o.status === 'served' ? 'bg-emerald-50 text-emerald-700' : o.status === 'preparing' ? 'bg-amber-50 text-amber-700' : o.status === 'cancelled' ? 'bg-rose-50 text-rose-700' : 'bg-sky-50 text-sky-700'
                              }`}>{o.status}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <button onClick={() => handleOpenOrderCreate(b)} className="w-full py-2 bg-emerald-50 text-emerald-700 border-2 border-emerald-200 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-emerald-100 transition-all cursor-pointer flex items-center justify-center gap-1">
                        <Plus className="w-3.5 h-3.5" /> Place Order
                      </button>
                    </>
                  );
                })()}
              </div>

              {/* Occupancy Toggle Action */}
              {canToggle && ("""
content = content.replace(old_booking_modal_orders, new_booking_modal_orders, 1)

with open('src/components/AdminDashboard.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('All inventory edits applied successfully!')
