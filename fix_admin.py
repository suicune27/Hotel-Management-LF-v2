#!/usr/bin/env python3
import os

filepath = 'src/components/AdminDashboard.tsx'

# Try different encodings
content = None
for enc in ['utf-8', 'utf-8-sig', 'cp1252', 'latin-1']:
    try:
        with open(filepath, 'r', encoding=enc) as f:
            content = f.read()
        print(f"Opened with encoding: {enc}")
        break
    except UnicodeDecodeError:
        continue

if content is None:
    print("Could not open file with any encoding")
    exit(1)

lines = content.split('\n')
print(f"Total lines: {len(lines)}")

# 1. Update types import
if ', ContactMessage } from' in content and '../types' in content:
    content = content.replace(", ContactMessage } from '../types';", ", ContactMessage, EmployeePayroll, TimeEntry, PayrollPeriod, PayrollEntry } from '../types';", 1)
    print("1. Import updated")
else:
    print("1. Checking import line...")
    for i, line in enumerate(lines):
        if '../types' in line:
            print(f"  Line {i+1}: {line}")

# 2. Add state variables after employees state
target = "const [employees, setEmployees] = useState<Profile[]>([]);"
if target in content:
    extra = "\n  const [employeePayrolls, setEmployeePayrolls] = useState<EmployeePayroll[]>([]);"
    extra += "\n  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);"
    extra += "\n  const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriod[]>([]);"
    extra += "\n  const [payrollEntries, setPayrollEntries] = useState<PayrollEntry[]>([]);"
    extra += "\n  const [wfSubTab, setWfSubTab] = useState<'directory' | 'time' | 'payroll'>('directory');"
    extra += "\n  const [payrollModal, setPayrollModal] = useState<null | 'payroll' | 'time' | 'period' | 'run'>(null);"
    extra += "\n  const [selectedPayrollEmp, setSelectedPayrollEmp] = useState<string | null>(null);"
    extra += "\n  const [payrollRateForm, setPayrollRateForm] = useState({ hourly_rate: 0, overtime_rate: 0,"
    extra += " pay_frequency: 'weekly' as 'weekly' | 'bi-weekly' | 'monthly',"
    extra += " employment_type: 'regular' as 'regular' | 'probationary' | 'contractual' | 'seasonal',"
    extra += " hire_date: '', tax_id: '', bank_account: '', remarks: '' });"
    content = content.replace(target, target + extra, 1)
    print("2. State variables added")
else:
    print("2. TARGET NOT FOUND")

# 3. Update Promise.all destructuring
old_dest = "const [roomsD, bookingsD, staffD, customersD, logsD, categoriesD, itemsD, ordersD, callsD, extsD, chatsD, contactsD] = await Promise.all(["
new_dest = "const [roomsD, bookingsD, staffD, customersD, logsD, categoriesD, itemsD, ordersD, callsD, extsD, chatsD, contactsD, empPayrollsD, timeEntsD, payrollPerD, payrollEntsD] = await Promise.all(["
if old_dest in content:
    content = content.replace(old_dest, new_dest, 1)
    print("3. Promise.all destructuring updated")
else:
    print("3. DESTRUCTURING NOT FOUND")

# 4. Add payroll queries to Promise.all
old_query = "        supabase.from('contact_messages').select('*').order('created_at', { ascending: false })"
payroll_queries = """        supabase.from('contact_messages').select('*').order('created_at', { ascending: false }),
        supabase.from('employee_payroll').select('*, users(*)'),
        supabase.from('time_entries').select('*, users(*)').order('clock_in', { ascending: false }),
        supabase.from('payroll_periods').select('*').order('start_date', { ascending: false }),
        supabase.from('payroll_entries').select('*, payroll_periods(*), users(*)').order('created_at', { ascending: false })"""
if old_query in content:
    content = content.replace(old_query, payroll_queries, 1)
    print("4. Payroll queries added")
else:
    print("4. QUERY NOT FOUND")

# 5. Add data assignments
old_assign = "      if (contactsD.data) setContactMessages(contactsD.data);"
new_assign = old_assign + "\n      if (empPayrollsD.data) setEmployeePayrolls(empPayrollsD.data);\n      if (timeEntsD.data) setTimeEntries(timeEntsD.data);\n      if (payrollPerD.data) setPayrollPeriods(payrollPerD.data);\n      if (payrollEntsD.data) setPayrollEntries(payrollEntsD.data);"
if old_assign in content:
    content = content.replace(old_assign, new_assign, 1)
    print("5. Data assignments added")
else:
    print("5. ASSIGN NOT FOUND")

# 6. Add refreshTable cases
old_refresh = """          const { data: logsD } = await supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(LOG_PAGE_SIZE);
          if (logsD) { setLogs(logsD); setLogPage(0); setLogHasMore(logsD.length >= LOG_PAGE_SIZE); }
          break;"""
new_refresh = old_refresh + """
        case 'employee_payroll':
          const { data: epD } = await supabase.from('employee_payroll').select('*, users(*)');
          if (epD) setEmployeePayrolls(epD);
          break;
        case 'time_entries':
          const { data: teD } = await supabase.from('time_entries').select('*, users(*)').order('clock_in', { ascending: false });
          if (teD) setTimeEntries(teD);
          break;
        case 'payroll_periods':
          const { data: ppD } = await supabase.from('payroll_periods').select('*').order('start_date', { ascending: false });
          if (ppD) setPayrollPeriods(ppD);
          break;
        case 'payroll_entries':
          const { data: peD } = await supabase.from('payroll_entries').select('*, payroll_periods(*), users(*)').order('created_at', { ascending: false });
          if (peD) setPayrollEntries(peD);
          break;"""
if old_refresh in content:
    content = content.replace(old_refresh, new_refresh, 1)
    print("6. RefreshTable cases added")
else:
    print("6. REFRESH NOT FOUND")

# 7. Add payroll handlers
old_ht = "  // Low-stock check helper"
new_ht = """  // Payroll CRUD Handlers
  const handleOpenEmployeePayroll = (empId: string) => {
    setSelectedPayrollEmp(empId);
    const existing = employeePayrolls.find(ep => ep.user_id === empId);
    if (existing) {
      setPayrollRateForm({
        hourly_rate: Number(existing.hourly_rate),
        overtime_rate: Number(existing.overtime_rate),
        pay_frequency: existing.pay_frequency,
        employment_type: existing.employment_type,
        hire_date: existing.hire_date || '',
        tax_id: existing.tax_id,
        bank_account: existing.bank_account,
        remarks: existing.remarks
      });
    } else {
      setPayrollRateForm({ hourly_rate: 0, overtime_rate: 0, pay_frequency: 'weekly', employment_type: 'regular', hire_date: '', tax_id: '', bank_account: '', remarks: '' });
    }
    setPayrollModal('payroll');
  };

  const handleSaveEmployeePayroll = async () => {
    if (!selectedPayrollEmp) return;
    try {
      const { error } = await supabase.from('employee_payroll').upsert({
        user_id: selectedPayrollEmp,
        hourly_rate: Number(payrollRateForm.hourly_rate),
        overtime_rate: Number(payrollRateForm.overtime_rate),
        pay_frequency: payrollRateForm.pay_frequency,
        employment_type: payrollRateForm.employment_type,
        hire_date: payrollRateForm.hire_date || null,
        tax_id: payrollRateForm.tax_id,
        bank_account: payrollRateForm.bank_account,
        remarks: payrollRateForm.remarks
      }, { onConflict: 'user_id' });
      if (error) throw error;
      addToast('success', 'Payroll Saved', 'Employee payroll settings updated.');
      setPayrollModal(null);
      await loadDatabase();
    } catch (err: any) {
      triggerAlert('Payroll Error', err.message);
    }
  };

  const handleCreatePayrollPeriod = async () => {
    const name = prompt('Enter payroll period name (e.g., Week 1 - March 2025):');
    if (!name) return;
    const startDate = prompt('Start date (YYYY-MM-DD):');
    if (!startDate) return;
    const endDate = prompt('End date (YYYY-MM-DD):');
    if (!endDate) return;
    try {
      const { error } = await supabase.from('payroll_periods').insert({
        name, start_date: startDate, end_date: endDate, status: 'pending'
      });
      if (error) throw error;
      addToast('success', 'Period Created', 'Payroll period "' + name + '" created.');
      await loadDatabase();
    } catch (err: any) {
      triggerAlert('Period Error', err.message);
    }
  };

  const handleProcessPayrollPeriod = async (periodId: string) => {
    triggerConfirm('Process Payroll', 'This will calculate gross pay for all employees with time entries in this period. Continue?', async () => {
      try {
        await supabase.from('payroll_periods').update({ status: 'processing' }).eq('id', periodId);
        const period = payrollPeriods.find(p => p.id === periodId);
        if (!period) throw new Error('Period not found.');
        const { data: entries } = await supabase
          .from('time_entries')
          .select('*, users(*)')
          .gte('clock_in', period.start_date)
          .lte('clock_in', period.end_date + 'T23:59:59');
        if (entries) {
          const userHours = {};
          for (const entry of entries) {
            if (!entry.total_hours) continue;
            if (!userHours[entry.user_id]) userHours[entry.user_id] = { regular: 0, overtime: 0 };
            if (entry.is_overtime) {
              userHours[entry.user_id].overtime += Number(entry.total_hours);
            } else {
              userHours[entry.user_id].regular += Number(entry.total_hours);
            }
          }
          for (const [userId, hours] of Object.entries(userHours)) {
            const payroll = employeePayrolls.find(ep => ep.user_id === userId);
            const hrRate = payroll ? Number(payroll.hourly_rate) : 0;
            const otRate = payroll ? Number(payroll.overtime_rate) : 0;
            const grossPay = (hours.regular * hrRate) + (hours.overtime * otRate);
            await supabase.from('payroll_entries').upsert({
              period_id: periodId, user_id: userId,
              total_regular_hours: hours.regular, total_overtime_hours: hours.overtime,
              hourly_rate: hrRate, overtime_rate: otRate,
              gross_pay: grossPay, deductions: 0, net_pay: grossPay,
              status: 'pending'
            }, { onConflict: 'period_id,user_id' });
          }
        }
        await supabase.from('payroll_periods').update({
          status: 'completed', processed_at: new Date().toISOString(), processed_by: userProfile?.id
        }).eq('id', periodId);
        addToast('success', 'Payroll Processed', 'Payroll period calculated successfully.');
        await loadDatabase();
      } catch (err: any) {
        triggerAlert('Processing Error', err.message);
      }
    }, false, 'Process');
  };

  const handleUpdatePayrollEntryStatus = async (entryId: string, newStatus: string) => {
    try {
      const updateData: any = { status: newStatus };
      if (newStatus === 'paid') updateData.paid_at = new Date().toISOString();
      const { error } = await supabase.from('payroll_entries').update(updateData).eq('id', entryId);
      if (error) throw error;
      addToast('success', 'Entry Updated', 'Payroll entry status changed to ' + newStatus + '.');
      await loadDatabase();
    } catch (err: any) {
      triggerAlert('Update Error', err.message);
    }
  };

  // Low-stock check helper"""
if old_ht in content:
    content = content.replace(old_ht, new_ht, 1)
    print("7. Payroll handlers added")
else:
    print("7. HANDLERS TARGET NOT FOUND")

# Write back with original encoding
with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("\nDone! All edits applied.")
