#!/usr/bin/env python3
"""Fix workforce tab and remove duplicate payroll handlers."""
import os

filepath = 'src/components/AdminDashboard.tsx'

with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

print(f"Total lines: {len(lines)}")

# ============================================================
# 1. Remove corrupted duplicate block (lines 1425-1576)
#    This is the duplicate payroll handlers that interrupt handleExportOrders
# ============================================================

# Verify the block starts with handleExportOrders and ends before 'return'
assert 'const handleExportOrders' in lines[1424], f"Expected handleExportOrders at line 1425, got: {lines[1424].rstrip()}"
assert "// Payroll CRUD Handlers" in lines[1425], f"Expected Payroll CRUD at line 1426, got: {lines[1425].rstrip()}"

# Remove lines 1425-1576 (0-indexed: 1424-1575)
print(f"Removing lines 1425-1576 (current content):")
for i in range(1424, 1576):
    print(f"  Removing line {i+1}: {lines[i].rstrip()[:80]}")
    lines[i] = None  # Mark for deletion

# Filter out None lines
lines = [l for l in lines if l is not None]

print(f"\nAfter removal: {len(lines)} lines")

# ============================================================
# 2. Now fix handleExportOrders - wrap the orphaned line
# ============================================================

# Find the orphaned exportOrdersToPDF line
for i, line in enumerate(lines):
    if 'exportOrdersToPDF(guestOrders, settings.currencySymbol)' in line:
        print(f"\nFixing handleExportOrders - found body at new line {i+1}")
        # Replace the orphaned line with a proper function
        lines[i] = "  const handleExportOrders = () => {\n"
        # Insert the exportOrdersToPDF line after
        lines.insert(i+1, f"    exportOrdersToPDF(guestOrders, settings.currencySymbol);\n")
        # Insert closing brace
        lines.insert(i+2, "  };\n")
        print(f"  Added handleExportOrders wrapper")
        break

# ============================================================
# 3. Replace workforce tab (originally lines 2436-2544, now shifted)
# ============================================================

# Find the workforce tab section
workforce_start = None
workforce_end = None
for i, line in enumerate(lines):
    if "activeTab === 'workforce'" in line and workforce_start is None:
        workforce_start = i
    if workforce_start is not None and workforce_end is None:
        if "activeTab === 'guests'" in line or "activeTab === 'front_desk'" in line:
            if i > workforce_start:
                workforce_end = i
                break

if workforce_start and workforce_end:
    print(f"\nWorkforce tab: lines {workforce_start+1} to {workforce_end}")
    
    # Build the enhanced workforce tab JSX
    enhanced_tab = [
        "              {activeTab === 'workforce' && (\n",
        '                <div className="space-y-6">\n',
        '\n',
        '                  {/* Workforce Sub-tabs */}\n',
        '                  <div className="flex items-center gap-2 border-b border-surface-100 pb-3">\n',
        '                    {[\n',
        "                      { id: 'directory', label: 'Staff Directory', icon: 'UserCheck' },\n",
        "                      { id: 'time', label: 'Time Tracking', icon: 'Clock' },\n",
        "                      { id: 'payroll', label: 'Payroll', icon: 'DollarSign' }\n",
        '                    ].map(sub => {\n',
        "                      const Icon = sub.id === 'directory' ? UserCheck : sub.id === 'time' ? Clock : DollarSign;\n",
        '                      const isActive = wfSubTab === sub.id;\n',
        '                      return (\n',
        '                        <button\n',
        '                          key={sub.id}\n',
        '                          onClick={() => setWfSubTab(sub.id as "directory" | "time" | "payroll")}\n',
        "                          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-all cursor-pointer ${\n",
        "                            isActive\n",
        "                              ? 'border-brand-500 text-brand-600 bg-brand-50/30'\n",
        "                              : 'border-transparent text-surface-400 hover:text-surface-600 hover:border-surface-300'\n",
        '                          }`}\n',
        '                        >\n',
        '                          <Icon className="w-4 h-4" />\n',
        '                          <span>{sub.label}</span>\n',
        '                        </button>\n',
        '                      );\n',
        '                    })}\n',
        '                  </div>\n',
        '\n',
        '                  {/* === STAFF DIRECTORY SUB-TAB === */}\n',
        '                  {wfSubTab === \'directory\' && (\n',
        '                    <div className="space-y-6">\n',
        '                      {/* Staff Role Summary */}\n',
        '                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">\n',
        '                        {{\n',
        "                          role: 'admin', label: 'Admin', color: 'bg-brand-500' },\n",
        "                          { role: 'front_desk', label: 'Front Desk', color: 'bg-sky-500' },\n",
        "                          { role: 'staff', label: 'Staff', color: 'bg-emerald-500' },\n",
        "                          { role: 'cook', label: 'Cook', color: 'bg-amber-500' },\n",
        "                          { role: 'cleaner', label: 'Cleaner', color: 'bg-teal-500' },\n",
        "                          { role: 'waiter', label: 'Waiter', color: 'bg-rose-500' },\n",
        "                          { role: 'employee', label: 'Employee', color: 'bg-violet-500' },\n",
        '                        ].map(s => {{\n',
        '                          const count = employees.filter(e => e.role === s.role).length;\n',
        '                          return (\n',
        '                            <div key={s.role} className="bg-white rounded-xl border border-surface-100 p-3 text-center shadow-sm">\n',
        '                              <div className={`w-2 h-2 rounded-full ${s.color} mx-auto mb-1`} />\n',
        '                              <span className="text-lg font-bold text-surface-900 block">{count}</span>\n',
        '                              <span className="text-[8px] text-surface-400 uppercase tracking-wider font-semibold">{s.label}</span>\n',
        '                            </div>\n',
        '                          );\n',
        '                        }})}\n',
        '                      </div>\n',
        '\n',
        '                      {employees.length === 0 ? (\n',
        '                        <div className="bg-white rounded-2xl border border-surface-100 p-12 text-center max-w-sm mx-auto">\n',
        '                          <UserCheck className="w-10 h-10 text-surface-300 mx-auto mb-4" />\n',
        '                          <h3 className="text-base font-semibold text-surface-800">No staff on roster</h3>\n',
        '                          <p className="text-xs text-surface-400 mt-1">Add employees and admins to manage hotel operations and bookings.</p>\n',
        '                        </div>\n',
        '                      ) : (\n',
        '                        <div className="bg-white rounded-2xl border border-surface-100 shadow-sm overflow-hidden text-xs">\n',
        '                          <div className="overflow-x-auto">\n',
        '                            <table className="w-full text-left border-collapse">\n',
        '                              <thead>\n',
        '                                <tr className="bg-surface-50/80 border-b border-surface-150 text-[10px] text-surface-400 font-bold uppercase tracking-wider">\n',
        '                                  <th className="p-4">Full Name</th>\n',
        '                                  <th className="p-4">Email</th>\n',
        '                                  <th className="p-4">Role</th>\n',
        '                                  <th className="p-4">Hourly Rate</th>\n',
        '                                  <th className="p-4">Type</th>\n',
        '                                  <th className="p-4">Joined</th>\n',
        '                                  <th className="p-4 text-right">Actions</th>\n',
        '                                </tr>\n',
        '                              </thead>\n',
        '                              <tbody className="divide-y divide-surface-100 text-surface-700 font-sans tracking-tight">\n',
        '                                {employees.map((emp) => {\n',
        '                                  const payroll = employeePayrolls.find(ep => ep.user_id === emp.id);\n',
        '                                  return (\n',
        '                                    <tr key={emp.id} className="hover:bg-surface-50/50">\n',
        '                                      <td className="p-4 font-semibold text-surface-900">{emp.full_name}</td>\n',
        '                                      <td className="p-4 font-mono font-medium text-surface-650">{emp.email}</td>\n',
        '                                      <td className="p-4">\n',
        '                                        <span className={`px-2 py-0.5 font-bold uppercase text-[9px] rounded-full ${\n',
        "                                          emp.role === 'admin'\n",
        "                                            ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200'\n",
        "                                            : emp.role === 'front_desk'\n",
        "                                            ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-200'\n",
        "                                            : emp.role === 'cook'\n",
        "                                            ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'\n",
        "                                            : emp.role === 'cleaner'\n",
        "                                            ? 'bg-teal-50 text-teal-700 ring-1 ring-teal-200'\n",
        "                                            : emp.role === 'waiter'\n",
        "                                            ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'\n",
        "                                            : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'\n",
        '                                        }`}>\n',
        "                                        {emp.role === 'front_desk' ? 'Front Desk' : emp.role === 'staff' ? 'Staff' : emp.role.charAt(0).toUpperCase() + emp.role.slice(1)}\n",
        '                                      </span>\n',
        '                                    </td>\n',
        '                                    <td className="p-4">\n',
        '                                      {payroll ? (\n',
        "                                        <span className='font-mono font-bold text-emerald-600'>${Number(payroll.hourly_rate).toFixed(2)}/hr</span>\n",
        '                                      ) : (\n',
        "                                        <span className='text-surface-300 italic'>Not set</span>\n",
        '                                      )}\n',
        '                                    </td>\n',
        '                                    <td className="p-4">\n',
        '                                      {payroll ? (\n',
        "                                        <span className='text-[10px] font-semibold text-surface-500 uppercase'>{payroll.employment_type}</span>\n",
        '                                      ) : (\n',
        "                                        <span className='text-surface-300 italic text-[10px]'>-</span>\n",
        '                                      )}\n',
        '                                    </td>\n',
        '                                    <td className="p-4 text-surface-400 text-[10px]">{new Date(emp.created_at).toLocaleDateString()}</td>\n',
        '                                    <td className="p-4 text-right space-x-1.5">\n',
        '                                      <button\n',
        '                                        onClick={() => handleOpenEmployeePayroll(emp.id)}\n',
        "                                        className='px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-bold cursor-pointer transition-colors'\n",
        "                                      >\n",
        "                                        {payroll ? 'Edit Rate' : 'Set Rate'}\n",
        '                                      </button>\n',
        '                                      <button\n',
        '                                        onClick={() => handleOpenEmployeeEdit(emp)}\n',
        "                                        className='px-2.5 py-1 bg-surface-100 hover:bg-surface-200 text-surface-700 rounded-lg text-[10px] font-bold cursor-pointer transition-colors'\n",
        "                                      >\n",
        '                                        Edit\n',
        '                                      </button>\n',
        '                                      <button\n',
        '                                        onClick={() => handleEmployeeDelete(emp)}\n',
        "                                        className='px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-[10px] font-bold cursor-pointer transition-colors'\n",
        "                                      >\n",
        '                                        Delete\n',
        '                                      </button>\n',
        '                                    </td>\n',
        '                                  </tr>\n',
        '                                );})}\n',
        '                              </tbody>\n',
        '                            </table>\n',
        '                          </div>\n',
        '                        </div>\n',
        '                      )}\n',
        '                    </div>\n',
        "                  )}\n",
        '\n',
        "                  {/* === TIME TRACKING SUB-TAB === */}\n",
        "                  {wfSubTab === 'time' && (\n",
        '                    <div className="space-y-4">\n',
        '                      <div className="flex justify-between items-center">\n',
        '                        <div>\n',
        '                          <h2 className="text-lg font-bold text-surface-900 tracking-tight">Time Tracking</h2>\n',
        '                          <p className="text-xs text-surface-400 mt-0.5">Employee clock-in and clock-out records</p>\n',
        '                        </div>\n',
        '                      </div>\n',
        '                      {timeEntries.length === 0 ? (\n',
        '                        <div className="bg-white rounded-2xl border border-surface-100 p-12 text-center max-w-sm mx-auto">\n',
        '                          <Clock className="w-10 h-10 text-surface-300 mx-auto mb-4" />\n',
        '                          <h3 className="text-base font-semibold text-surface-800">No time entries yet</h3>\n',
        '                          <p className="text-xs text-surface-400 mt-1">Employees will appear here once they clock in.</p>\n',
        '                        </div>\n',
        '                      ) : (\n',
        '                        <div className="bg-white rounded-2xl border border-surface-100 shadow-sm overflow-hidden text-xs">\n',
        '                          <div className="overflow-x-auto">\n',
        '                            <table className="w-full text-left border-collapse">\n',
        '                              <thead>\n',
        '                                <tr className="bg-surface-50/80 border-b border-surface-150 text-[10px] text-surface-400 font-bold uppercase tracking-wider">\n',
        '                                  <th className="p-3">Employee</th>\n',
        '                                  <th className="p-3">Clock In</th>\n',
        '                                  <th className="p-3">Clock Out</th>\n',
        '                                  <th className="p-3">Hours</th>\n',
        '                                  <th className="p-3">Overtime</th>\n',
        '                                  <th className="p-3">Notes</th>\n',
        '                                </tr>\n',
        '                              </thead>\n',
        '                              <tbody className="divide-y divide-surface-100">\n',
        '                                {timeEntries.slice(0, 50).map((entry) => (\n',
        '                                  <tr key={entry.id} className="hover:bg-surface-50/50">\n',
        '                                    <td className="p-3 font-semibold text-surface-900">{(entry as any).users?.full_name || (entry as any).users?.email || \'Unknown\'}</td>\n',
        '                                    <td className="p-3 font-mono text-surface-600">{new Date(entry.clock_in).toLocaleString()}</td>\n',
        '                                    <td className="p-3 font-mono text-surface-600">{entry.clock_out ? new Date(entry.clock_out).toLocaleString() : <span className="text-emerald-500 font-bold">Active</span>}</td>\n',
        '                                    <td className="p-3 font-mono font-bold">{entry.total_hours ? Number(entry.total_hours).toFixed(1) : \'-\'}</td>\n',
        '                                    <td className="p-3">{entry.is_overtime ? <span className="text-rose-500 font-bold">Yes</span> : \'No\'}</td>\n',
        '                                    <td className="p-3 text-surface-400 max-w-[120px] truncate">{entry.notes || \'-\'}</td>\n',
        '                                  </tr>\n',
        '                                ))}\n',
        '                              </tbody>\n',
        '                            </table>\n',
        '                          </div>\n',
        '                        </div>\n',
        '                      )}\n',
        '                    </div>\n',
        "                  )}\n",
        '\n',
        "                  {/* === PAYROLL SUB-TAB === */}\n",
        "                  {wfSubTab === 'payroll' && (\n",
        '                    <div className="space-y-6">\n',
        '                      <div className="flex justify-between items-center">\n',
        '                        <div>\n',
        '                          <h2 className="text-lg font-bold text-surface-900 tracking-tight">Payroll Management</h2>\n',
        '                          <p className="text-xs text-surface-400 mt-0.5">Manage pay periods, process payroll, and approve payments</p>\n',
        '                        </div>\n',
        '                        <button\n',
        '                          onClick={handleCreatePayrollPeriod}\n',
        "                          className='px-4 py-2 bg-surface-900 text-white hover:bg-surface-800 transition-all text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer'\n",
        '                        >\n',
        '                          <Plus className="w-4 h-4" />\n',
        '                          <span>New Pay Period</span>\n',
        '                        </button>\n',
        '                      </div>\n',
        '\n',
        '                      {/* Payroll Periods */}\n',
        '                      {payrollPeriods.length === 0 ? (\n',
        '                        <div className="bg-white rounded-2xl border border-surface-100 p-12 text-center max-w-sm mx-auto">\n',
        '                          <DollarSign className="w-10 h-10 text-surface-300 mx-auto mb-4" />\n',
        '                          <h3 className="text-base font-semibold text-surface-800">No payroll periods</h3>\n',
        '                          <p className="text-xs text-surface-400 mt-1">Click "New Pay Period" to create one and start processing payroll.</p>\n',
        '                        </div>\n',
        '                      ) : (\n',
        '                        <div className="space-y-3">\n',
        '                          {payrollPeriods.map((period) => (\n',
        '                            <div key={period.id} className="bg-white rounded-2xl border border-surface-100 p-5 shadow-sm">\n',
        '                              <div className="flex items-center justify-between mb-3">\n',
        '                                <div>\n',
        '                                  <h4 className="text-sm font-bold text-surface-900">{period.name}</h4>\n',
        '                                  <p className="text-[10px] text-surface-400 mt-0.5">\n',
        "                                    {new Date(period.start_date).toLocaleDateString()} - {new Date(period.end_date).toLocaleDateString()}\n",
        '                                  </p>\n',
        '                                </div>\n',
        '                                <div className="flex items-center gap-2">\n',
        '                                  <span className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded-full ${\n',
        "                                    period.status === 'completed' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' :\n",
        "                                    period.status === 'processing' ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' :\n",
        "                                    'bg-surface-50 text-surface-500 ring-1 ring-surface-200'\n",
        '                                  }`}>{period.status}</span>\n',
        '                                  {period.status === \'pending\' && (\n',
        '                                    <button\n',
        '                                      onClick={() => handleProcessPayrollPeriod(period.id)}\n',
        "                                      className='px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-[10px] font-bold cursor-pointer transition-colors'\n",
        '                                    >\n',
        '                                      <RefreshCw className="w-3 h-3 inline-block mr-1" />\n',
        '                                      Process\n',
        '                                    </button>\n',
        '                                  )}\n',
        '                                </div>\n',
        '                              </div>\n',
        '\n',
        '                              {/* Payroll Entries for this period */}\n',
        '                              {payrollEntries.filter(e => e.period_id === period.id).length > 0 && (\n',
        '                                <table className="w-full text-left border-collapse text-[10px]">\n',
        '                                  <thead>\n',
        '                                    <tr className="bg-surface-50/80 border-y border-surface-150 text-[9px] text-surface-400 font-bold uppercase tracking-wider">\n',
        '                                      <th className="p-2">Employee</th>\n',
        '                                      <th className="p-2">Regular Hrs</th>\n',
        '                                      <th className="p-2">OT Hrs</th>\n',
        '                                      <th className="p-2">Rate</th>\n',
        '                                      <th className="p-2">Gross Pay</th>\n',
        '                                      <th className="p-2">Deductions</th>\n',
        '                                      <th className="p-2">Net Pay</th>\n',
        '                                      <th className="p-2">Status</th>\n',
        '                                      <th className="p-2 text-right">Actions</th>\n',
        '                                    </tr>\n',
        '                                  </thead>\n',
        '                                  <tbody className="divide-y divide-surface-100">\n',
        '                                    {payrollEntries.filter(e => e.period_id === period.id).map((entry) => (\n',
        '                                      <tr key={entry.id} className="hover:bg-surface-50/50">\n',
        '                                        <td className="p-2 font-semibold text-surface-900">{(entry as any).users?.full_name || (entry as any).users?.email || \'Unknown\'}</td>\n',
        '                                        <td className="p-2 font-mono">{Number(entry.total_regular_hours || 0).toFixed(1)}</td>\n',
        '                                        <td className="p-2 font-mono">{Number(entry.total_overtime_hours || 0).toFixed(1)}</td>\n',
        '                                        <td className="p-2 font-mono">${Number(entry.hourly_rate || 0).toFixed(2)}</td>\n',
        '                                        <td className="p-2 font-mono font-bold">${Number(entry.gross_pay || 0).toFixed(2)}</td>\n',
        '                                        <td className="p-2 font-mono text-rose-500">${Number(entry.deductions || 0).toFixed(2)}</td>\n',
        '                                        <td className="p-2 font-mono font-bold text-emerald-600">${Number(entry.net_pay || 0).toFixed(2)}</td>\n',
        '                                        <td className="p-2">\n',
        '                                          <span className={`px-1.5 py-0.5 text-[8px] font-bold uppercase rounded-full ${\n',
        "                                            entry.status === 'paid' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' :\n",
        "                                            entry.status === 'approved' ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' :\n",
        "                                            'bg-surface-50 text-surface-500 ring-1 ring-surface-200'\n",
        '                                          }`}>{entry.status}</span>\n',
        '                                        </td>\n',
        '                                        <td className="p-2 text-right space-x-1">\n',
        "                                          {entry.status === 'pending' && (\n",
        '                                            <button\n',
        '                                              onClick={() => handleUpdatePayrollEntryStatus(entry.id, \'approved\')}\n',
        "                                              className='px-1.5 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-[8px] font-bold cursor-pointer'\n",
        '                                            >\n',
        '                                              Approve\n',
        '                                            </button>\n',
        '                                          )}\n',
        "                                          {entry.status === 'approved' && (\n",
        '                                            <button\n',
        '                                              onClick={() => handleUpdatePayrollEntryStatus(entry.id, \'paid\')}\n',
        "                                              className='px-1.5 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded text-[8px] font-bold cursor-pointer'\n",
        '                                            >\n',
        '                                              Mark Paid\n',
        '                                            </button>\n',
        '                                          )}\n',
        '                                        </td>\n',
        '                                      </tr>\n',
        '                                    ))}\n',
        '                                  </tbody>\n',
        '                                </table>\n',
        '                              )}\n',
        '                            </div>\n',
        '                          ))}\n',
        '                        </div>\n',
        '                      )}\n',
        '                    </div>\n',
        "                  )}\n",
        '                </div>\n',
        '              )}\n',
    ]
    
    # Replace workforce tab section
    lines[workforce_start:workforce_end] = enhanced_tab
    print(f"Replaced workforce tab with enhanced version ({len(enhanced_tab)} lines)")
else:
    print("Could not find workforce tab boundaries!")

# ============================================================
# 4. Write back
# ============================================================
with open(filepath, 'w', encoding='utf-8') as f:
    f.writelines(lines)

print(f"\nFinal total lines: {len(lines)}")
print("Done!")
