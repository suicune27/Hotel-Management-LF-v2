#!/usr/bin/env python3
"""Add the payroll modal JSX back into AdminDashboard.tsx after the employee modal."""
filepath = 'src/components/AdminDashboard.tsx'

with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find the closing of employee modal (line with ')}' that closes {employeeModal && (...) )
# Then find the booking detail modal start
emp_modal_close = None
booking_modal_start = None

for i, line in enumerate(lines):
    if 'BOOKING DETAIL MODAL' in line and booking_modal_start is None and i > 4400:
        booking_modal_start = i
    if booking_modal_start is not None and emp_modal_close is None:
        # We found booking detail after employee, now find emp modal close just before it
        pass

# Simpler approach: find the line that closes the employee modal
# The pattern is: employee modal JSX block ends with ')}' on its own line
# Look for it right after the employee modal content
for i in range(4430, min(4460, len(lines))):
    stripped = lines[i].strip()
    if stripped == ')' or stripped == ')}':
        # Check if this closes the employee modal
        # Look backwards for 'employeeModal &&'
        for j in range(i, max(0, i-50), -1):
            if 'employeeModal &&' in lines[j]:
                emp_modal_close = i
                break
        if emp_modal_close:
            break

if emp_modal_close:
    print(f"Employee modal closes at line {emp_modal_close+1}: {lines[emp_modal_close].rstrip()}")
else:
    # Fallback: find by searching for the pattern
    for i, line in enumerate(lines):
        if i > 4400 and 'employeeModal' in line and '&&' in line:
            # Find the matching closing
            depth = 0
            for j in range(i, min(len(lines), i+100)):
                depth += line.count('(') - line.count(')')
                depth += line.count('{') - line.count('}')
                if depth <= 0 and j > i:
                    emp_modal_close = j
                    print(f"Found emp modal close at line {j+1} (depth={depth})")
                    break
            if emp_modal_close:
                break

if emp_modal_close is None:
    print("Could not find employee modal close!")
    exit(1)

# Payroll modal JSX to insert
payroll_modal = """      {/* Payroll Settings Modal */}
      {payrollModal === 'payroll' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setPayrollModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-surface-100 p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-bold text-surface-900">Payroll Settings</h3>
                <p className="text-[10px] text-surface-400 mt-0.5">Configure hourly rate, overtime, and employment details</p>
              </div>
              <button onClick={() => setPayrollModal(null)} className="p-1 hover:bg-surface-100 rounded-lg cursor-pointer"><X className="w-4 h-4 text-surface-400" /></button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1 block">Hourly Rate ($)</label>
                  <input type="number" step="0.01" min="0"
                    value={payrollRateForm.hourly_rate}
                    onChange={e => setPayrollRateForm({ ...payrollRateForm, hourly_rate: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1 block">Overtime Rate ($)</label>
                  <input type="number" step="0.01" min="0"
                    value={payrollRateForm.overtime_rate}
                    onChange={e => setPayrollRateForm({ ...payrollRateForm, overtime_rate: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1 block">Pay Frequency</label>
                  <select value={payrollRateForm.pay_frequency}
                    onChange={e => setPayrollRateForm({ ...payrollRateForm, pay_frequency: e.target.value as any })}
                    className="w-full p-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400">
                    <option value="weekly">Weekly</option>
                    <option value="bi-weekly">Bi-Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1 block">Employment Type</label>
                  <select value={payrollRateForm.employment_type}
                    onChange={e => setPayrollRateForm({ ...payrollRateForm, employment_type: e.target.value as any })}
                    className="w-full p-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400">
                    <option value="regular">Regular</option>
                    <option value="probationary">Probationary</option>
                    <option value="contractual">Contractual</option>
                    <option value="seasonal">Seasonal</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1 block">Hire Date</label>
                <input type="date"
                  value={payrollRateForm.hire_date}
                  onChange={e => setPayrollRateForm({ ...payrollRateForm, hire_date: e.target.value })}
                  className="w-full p-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1 block">Tax ID</label>
                  <input type="text"
                    value={payrollRateForm.tax_id}
                    onChange={e => setPayrollRateForm({ ...payrollRateForm, tax_id: e.target.value })}
                    className="w-full p-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1 block">Bank Account</label>
                  <input type="text"
                    value={payrollRateForm.bank_account}
                    onChange={e => setPayrollRateForm({ ...payrollRateForm, bank_account: e.target.value })}
                    className="w-full p-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400" />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-1 block">Remarks</label>
                <textarea rows={2}
                  value={payrollRateForm.remarks}
                  onChange={e => setPayrollRateForm({ ...payrollRateForm, remarks: e.target.value })}
                  className="w-full p-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 resize-none" />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-surface-100">
              <button onClick={() => setPayrollModal(null)}
                className="px-4 py-2 text-xs font-semibold text-surface-600 hover:text-surface-800 bg-surface-100 hover:bg-surface-200 rounded-lg cursor-pointer transition-colors">
                Cancel
              </button>
              <button onClick={handleSaveEmployeePayroll}
                className="px-4 py-2 text-xs font-semibold text-white bg-surface-900 hover:bg-surface-800 rounded-lg cursor-pointer transition-colors">
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}

"""

# Insert after employee modal close
insert_pos = emp_modal_close + 1
lines.insert(insert_pos, payroll_modal)

print(f"Inserted payroll modal at line {insert_pos+1}")

with open(filepath, 'w', encoding='utf-8') as f:
    f.writelines(lines)

print(f"Total lines: {len(lines)}")
print("Done!")
