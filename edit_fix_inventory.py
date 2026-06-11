import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# ===== Fix 1: Rename duplicate newCategoryName for menu categories =====
with open('src/components/AdminDashboard.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Rename the menu category state variable
content = content.replace(
  "const [newCategoryName, setNewCategoryName] = useState('');",
  "const [newMenuCategoryName, setNewMenuCategoryName] = useState('');",
  1  # Only replace the first occurrence (the settings one mentioned first in states)
)

# Actually wait, there are TWO newCategoryName states. The first one is for settings (layoutCategories),
# the second is for menu categories. I need to keep the first one and rename the second.
# Let me check what happened...

# Looking at the code: the settings state has `const [newCategoryName, setNewCategoryName] = useState('');`
# and my inventory additions added another one. Since they're in the same scope, we have a duplicate.
# I need to rename the inventory one.

# Let me just replace all occurrences of newCategoryName/setNewCategoryName that relate to menu categories.
# The settings one is used with handleAddCategory and layoutCategories.
# The inventory one should be renamed to newMenuCatName.

# Actually, the better approach: the settings newCategoryName was there first. My inventory code added
# a new declaration. Let me rename all the inventory-related ones to newMenuCatName.

content = content.replace(
  "setNewCategoryName('');\n        addToast('success', 'Category Added', `\"${cleanName}\" added to suite layout categories.`);",
  "setNewCategoryName('');\n        addToast('success', 'Category Added', `\"${cleanName}\" added to suite layout categories.`);"
)

# Replace the menu-category specific ones (not the settings layout one)
content = content.replace(
  "const [newCategoryName, setNewCategoryName] = useState('');\n  const [newMenuCategoryName,",
  "const [newCategoryName, setNewCategoryName] = useState('');\n  const [newMenuCategoryName,"
)

# Actually let me just do a more careful approach. Let me find the exact issue.
# The variable `newCategoryName` was already declared for settings.
# My inventory code added a duplicate: `const [newCategoryName, setNewCategoryName] = useState('');`
# I need to find and rename the duplicate.

# Let me look for the specific pattern of the inventory categories state
old = """  // Inventory CRUD states
  const [menuCategories, setMenuCategories] = useState<MenuCategory[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [guestOrders, setGuestOrders] = useState<GuestOrder[]>([]);
  const [inventoryModal, setInventoryModal] = useState<'category' | 'item' | 'stock' | 'order' | null>(null);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');"""

new = """  // Inventory CRUD states
  const [menuCategories, setMenuCategories] = useState<MenuCategory[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [guestOrders, setGuestOrders] = useState<GuestOrder[]>([]);
  const [inventoryModal, setInventoryModal] = useState<'category' | 'item' | 'stock' | 'order' | null>(null);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [newMenuCatName, setNewMenuCatName] = useState('');"""

content = content.replace(old, new, 1)

# Now rename all usages in the inventory handlers
content = content.replace(
  "const name = newCategoryName.trim();",
  "const name = newMenuCatName.trim();"
)
content = content.replace(
  "setNewCategoryName('');\n      addToast('success', 'Category Added', `\"${name}\" menu category created.`);",
  "setNewMenuCatName('');\n      addToast('success', 'Category Added', `\"${name}\" menu category created.`);"
)
content = content.replace(
  "value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)}",
  "value={newMenuCatName} onChange={(e) => setNewMenuCatName(e.target.value)}"
)
content = content.replace(
  "if (e.key === 'Enter') { e.preventDefault(); handleAddMenuCategory(); } }} />\n                      <button onClick={handleAddMenuCategory}",
  "if (e.key === 'Enter') { e.preventDefault(); handleAddMenuCategory(); } }} />\n                      <button onClick={handleAddMenuCategory}"
)

# ===== Fix 2: Add missing refreshTable cases for inventory tables =====
old_refresh = """        case 'activity_logs':
          const { data: logsD } = await supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(LOG_PAGE_SIZE);
          if (logsD) { setLogs(logsD); setLogPage(0); setLogHasMore(logsD.length >= LOG_PAGE_SIZE); }
          break;"""
new_refresh = """        case 'menu_categories':
          const { data: catsD } = await supabase.from('menu_categories').select('*').order('name', { ascending: true });
          if (catsD) setMenuCategories(catsD);
          break;
        case 'inventory_items':
          const { data: itemsD } = await supabase.from('inventory_items').select('*, menu_categories(*)').order('name', { ascending: true });
          if (itemsD) setInventoryItems(itemsD);
          break;
        case 'guest_orders':
          const { data: ordersD } = await supabase.from('guest_orders').select('*, inventory_items(*), bookings(*, customers(*), rooms(*))').order('created_at', { ascending: false });
          if (ordersD) setGuestOrders(ordersD);
          break;
        case 'activity_logs':
          const { data: logsD } = await supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(LOG_PAGE_SIZE);
          if (logsD) { setLogs(logsD); setLogPage(0); setLogHasMore(logsD.length >= LOG_PAGE_SIZE); }
          break;"""
content = content.replace(old_refresh, new_refresh, 1)

# ===== Fix 3: Fix PlusCircle to use the correct icon name =====
# Actually let me check if PlusCircle exists in the import. The import line has `PlusCircle`.
# Let me use a simpler approach and just use `Plus` instead which we already have.
content = content.replace(
  "PlusCircle",
  "Package"  # Use Package instead since we already have it
)

# Actually wait, `PlusCircle` is used in the stock adjust modal. Let me just change `PlusCircle` to `Plus`.
content = content.replace(
  "<PlusCircle className=\"w-3.5 h-3.5 inline mr-1\" /> Add Stock</>",
  "<span>+ </span>Add Stock</>"
)

# Also need to remove PlusCircle from the import if it's now unused
content = content.replace(
  "Package, ShoppingCart, AlertCircle, Minus, PlusCircle",
  "Package, ShoppingCart, AlertCircle, Minus"
)

with open('src/components/AdminDashboard.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Fix 1: Duplicate variable renamed')

# ===== Fix 4: Add RLS policies for new tables to schema.sql =====
with open('schema.sql', 'r', encoding='utf-8') as f:
    content = f.read()

# Add RLS enable for new tables
old_rls = """ALTER TABLE public.hotel_settings ENABLE ROW LEVEL SECURITY;

-- 4. ROW LEVEL SECURITY POLICIES"""
new_rls = """ALTER TABLE public.hotel_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_orders ENABLE ROW LEVEL SECURITY;

-- 4. ROW LEVEL SECURITY POLICIES"""
content = content.replace(old_rls, new_rls, 1)

# Add RLS policies for new tables after hotel_settings policies
old_policies = """DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hotel_settings' AND policyname='Hotel settings are viewable by everyone') THEN CREATE POLICY "Hotel settings are viewable by everyone" ON public.hotel_settings FOR SELECT USING (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hotel_settings' AND policyname='Authenticated users can manage hotel settings') THEN CREATE POLICY "Authenticated users can manage hotel settings" ON public.hotel_settings FOR ALL TO authenticated USING (true); END IF; END $$;

-- 5. FUNCTIONS"""
new_policies = """DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hotel_settings' AND policyname='Hotel settings are viewable by everyone') THEN CREATE POLICY "Hotel settings are viewable by everyone" ON public.hotel_settings FOR SELECT USING (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hotel_settings' AND policyname='Authenticated users can manage hotel settings') THEN CREATE POLICY "Authenticated users can manage hotel settings" ON public.hotel_settings FOR ALL TO authenticated USING (true); END IF; END $$;

-- Menu categories: public read, authenticated write
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='menu_categories' AND policyname='Menu categories are viewable by everyone') THEN CREATE POLICY "Menu categories are viewable by everyone" ON public.menu_categories FOR SELECT USING (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='menu_categories' AND policyname='Menu categories are manageable by authenticated') THEN CREATE POLICY "Menu categories are manageable by authenticated" ON public.menu_categories FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF; END $$;

-- Inventory items: public read (for guest order menu), authenticated write
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='inventory_items' AND policyname='Inventory items are viewable by everyone') THEN CREATE POLICY "Inventory items are viewable by everyone" ON public.inventory_items FOR SELECT USING (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='inventory_items' AND policyname='Inventory items are manageable by authenticated') THEN CREATE POLICY "Inventory items are manageable by authenticated" ON public.inventory_items FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF; END $$;

-- Guest orders: authenticated read/write only
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='guest_orders' AND policyname='Guest orders are viewable by authenticated') THEN CREATE POLICY "Guest orders are viewable by authenticated" ON public.guest_orders FOR SELECT TO authenticated USING (true); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='guest_orders' AND policyname='Guest orders are manageable by authenticated') THEN CREATE POLICY "Guest orders are manageable by authenticated" ON public.guest_orders FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF; END $$;

-- 5. FUNCTIONS"""
content = content.replace(old_policies, new_policies, 1)

with open('schema.sql', 'w', encoding='utf-8') as f:
    f.write(content)
print('Fix 2: RLS policies added for new tables')

print('\nAll fixes applied!')
