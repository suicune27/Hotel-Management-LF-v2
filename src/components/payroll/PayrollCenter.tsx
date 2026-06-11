import React, { useMemo, useState } from 'react';
import { Calendar, CheckCircle2, Clock3, DollarSign, Search, Users, ShieldCheck, AlertTriangle } from 'lucide-react';
import type { EmployeePayroll, PayrollEntry, PayrollPeriod, Profile, TimeEntry } from '../../types';
import { computePayroll } from '../../lib/payrollEngine';

interface PayrollCenterProps {
  employees: Profile[];
  employeePayrolls: EmployeePayroll[];
  timeEntries: TimeEntry[];
  payrollPeriods: PayrollPeriod[];
  payrollEntries: PayrollEntry[];
  currencySymbol: string;
  onProcessPeriod: (periodId: string) => void;
  onOpenPayslip: (entry: PayrollEntry) => void;
  onUpdateEntryStatus: (entryId: string, status: 'approved' | 'paid') => void;
}

function fmt(v: number, symbol: string): string {
  return `${symbol}${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildFallbackPayroll(emp: Profile): EmployeePayroll {
  return {
    id: `fallback-${emp.id}`,
    user_id: emp.id,
    employee_id: '',
    department: '',
    position: '',
    hourly_rate: 0,
    overtime_rate: 0,
    pay_frequency: 'weekly',
    employment_type: 'regular',
    salary_type: 'hourly',
    basic_salary: 0,
    daily_rate: 0,
    night_diff_rate: 0,
    hire_date: null,
    tax_id: '',
    bank_account: '',
    government_ids: {},
    bank_details: {},
    payroll_status: 'active',
    remarks: '',
    created_at: new Date(0).toISOString(),
  };
}

export default function PayrollCenter({
  employees,
  employeePayrolls,
  timeEntries,
  payrollPeriods,
  payrollEntries,
  currencySymbol,
  onProcessPeriod,
  onOpenPayslip,
  onUpdateEntryStatus,
}: PayrollCenterProps) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'paid'>('all');
  const [computedAt, setComputedAt] = useState<string>('');
  const [selectedEstimatePeriodId, setSelectedEstimatePeriodId] = useState<string>('__current_month__');

  // Rule-Based Performance Modifiers Switches
  const [highTierCheckinsModifier, setHighTierCheckinsModifier] = useState(true);
  const [volumeTurnoversModifier, setVolumeTurnoversModifier] = useState(true);
  const [zeroLateModifier, setZeroLateModifier] = useState(true);
  const [computedRows, setComputedRows] = useState<Array<{
    userId: string;
    employeeName: string;
    department: string;
    position: string;
    regularHours: number;
    overtimeHours: number;
    hourlyRate: number;
    overtimeRate: number;
    basicPay: number;
    overtimePay: number;
    earningsTotal: number;
    deductionsTotal: number;
    netPay: number;
    hasPayrollProfile: boolean;
  }>>([]);

  const activePeriod = useMemo(
    () => payrollPeriods.find((p) => p.status === 'processing') || payrollPeriods.find((p) => p.status === 'pending') || null,
    [payrollPeriods]
  );

  const totalPayrollCost = useMemo(
    () => payrollEntries.reduce((acc, e) => acc + Number(e.net_pay || 0), 0),
    [payrollEntries]
  );

  const upcomingReleases = useMemo(
    () => payrollPeriods.filter((p) => p.status === 'pending' || p.status === 'processing').slice(0, 5),
    [payrollPeriods]
  );

  const estimatePeriodOptions = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const lastDay = new Date(year, month, 0).getDate();
    const currentMonth = {
      id: '__current_month__',
      name: 'Current Month (Estimate)',
      start_date: `${year}-${String(month).padStart(2, '0')}-01`,
      end_date: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
    };

    const historical = [...payrollPeriods]
      .sort((a, b) => new Date(b.end_date).getTime() - new Date(a.end_date).getTime())
      .map((p) => ({ id: p.id, name: p.name, start_date: p.start_date, end_date: p.end_date }));

    return [currentMonth, ...historical];
  }, [payrollPeriods]);

  const selectedEstimatePeriod = useMemo(
    () => estimatePeriodOptions.find((p) => p.id === selectedEstimatePeriodId) || estimatePeriodOptions[0] || null,
    [estimatePeriodOptions, selectedEstimatePeriodId]
  );

  const pendingApprovals = useMemo(
    () => payrollEntries.filter((e) => e.status === 'pending' || e.status === 'hr_review' || e.status === 'manager_approval' || e.status === 'finance_approval'),
    [payrollEntries]
  );

  const employeeRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees
      .filter((e) => e.role !== 'guest')
      .map((emp) => {
        const payroll = employeePayrolls.find((p) => p.user_id === emp.id);
        const empEntries = timeEntries.filter((t) => t.user_id === emp.id);
        const hrs = empEntries.reduce((a, t) => a + Number(t.total_hours || 0), 0);
        const overtime = empEntries.reduce((a, t) => a + Number(t.overtime_hours || (t.is_overtime ? t.total_hours || 0 : 0)), 0);
        return { emp, payroll, hrs, overtime };
      })
      .filter((row) => {
        if (!q) return true;
        const name = row.emp.full_name.toLowerCase();
        const email = row.emp.email.toLowerCase();
        const dept = (row.payroll?.department || '').toLowerCase();
        const position = (row.payroll?.position || '').toLowerCase();
        return name.includes(q) || email.includes(q) || dept.includes(q) || position.includes(q);
      });
  }, [employees, employeePayrolls, timeEntries, query]);

  const filteredEntries = useMemo(
    () => payrollEntries.filter((e) => statusFilter === 'all' ? true : e.status === statusFilter),
    [payrollEntries, statusFilter]
  );

  const computedTotals = useMemo(() => {
    return computedRows.reduce((acc, row) => {
      acc.regularHours += row.regularHours;
      acc.overtimeHours += row.overtimeHours;
      acc.earningsTotal += row.earningsTotal;
      acc.deductionsTotal += row.deductionsTotal;
      acc.netPay += row.netPay;
      return acc;
    }, { regularHours: 0, overtimeHours: 0, earningsTotal: 0, deductionsTotal: 0, netPay: 0 });
  }, [computedRows]);

  const handleComputeCurrentPayroll = () => {
    if (!selectedEstimatePeriod) {
      setComputedRows([]);
      setComputedAt('');
      return;
    }

    const start = new Date(`${selectedEstimatePeriod.start_date}T00:00:00`);
    const end = new Date(`${selectedEstimatePeriod.end_date}T23:59:59.999`);

    const rows = employees
      .filter((e) => e.role !== 'guest')
      .map((emp) => {
        const payrollProfile = employeePayrolls.find((p) => p.user_id === emp.id);
        const effectiveProfile = payrollProfile || buildFallbackPayroll(emp);

        const periodEntries = timeEntries.filter((entry) => {
          if (entry.user_id !== emp.id) return false;
          const clockIn = new Date(entry.clock_in);
          return clockIn >= start && clockIn <= end;
        });

        const result = computePayroll({
          profile: effectiveProfile,
          entries: periodEntries,
          periodStart: selectedEstimatePeriod.start_date,
          periodEnd: selectedEstimatePeriod.end_date,
          performanceModifiers: {
            highTierCheckinsUnder3Min: highTierCheckinsModifier,
            roomTurnoversCount: (emp.role || '').toLowerCase().includes('clean') || (emp.role || '').toLowerCase().includes('house') ? 18 : 0,
            zeroLateBonus: zeroLateModifier,
          }
        });

        return {
          userId: emp.id,
          employeeName: emp.full_name,
          department: payrollProfile?.department || 'Unassigned',
          position: payrollProfile?.position || 'Unassigned',
          regularHours: result.regularHours,
          overtimeHours: result.overtimeHours,
          hourlyRate: Number(effectiveProfile.hourly_rate || 0),
          overtimeRate: Number(effectiveProfile.overtime_rate || 0),
          basicPay: Number(result.earningsBreakdown.basic_salary || 0),
          overtimePay: Number(result.earningsBreakdown.overtime_pay || 0),
          earningsTotal: Number(result.gross || 0),
          deductionsTotal: Number(result.deductions || 0),
          netPay: Number(result.net || 0),
          hasPayrollProfile: !!payrollProfile,
        };
      })
      .sort((a, b) => a.employeeName.localeCompare(b.employeeName));

    setComputedRows(rows);
    setComputedAt(new Date().toISOString());
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-surface-100 p-4">
          <p className="text-[10px] uppercase tracking-wider text-surface-400 font-bold">Total Employees</p>
          <p className="text-2xl font-bold text-surface-900 mt-1 flex items-center gap-2"><Users className="w-5 h-5 text-brand-600" />{employeeRows.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-surface-100 p-4">
          <p className="text-[10px] uppercase tracking-wider text-surface-400 font-bold">Active Payroll Period</p>
          <p className="text-sm font-bold text-surface-900 mt-1">{activePeriod?.name || 'No active period'}</p>
          <p className="text-[10px] text-surface-500 mt-1">{activePeriod ? `${activePeriod.start_date} to ${activePeriod.end_date}` : 'Create a payroll period to begin processing.'}</p>
        </div>
        <div className="bg-white rounded-2xl border border-surface-100 p-4">
          <p className="text-[10px] uppercase tracking-wider text-surface-400 font-bold">Total Payroll Cost</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1 flex items-center gap-2"><DollarSign className="w-5 h-5" />{fmt(totalPayrollCost, currencySymbol)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-surface-100 p-4">
          <p className="text-[10px] uppercase tracking-wider text-surface-400 font-bold">Upcoming Releases</p>
          <p className="text-2xl font-bold text-surface-900 mt-1">{upcomingReleases.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-surface-100 p-4">
          <p className="text-[10px] uppercase tracking-wider text-surface-400 font-bold">Pending Approvals</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{pendingApprovals.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-surface-100 p-4">
          <p className="text-[10px] uppercase tracking-wider text-surface-400 font-bold">Processing Status</p>
          <p className="text-sm font-bold text-surface-900 mt-1 flex items-center gap-1.5">
            {activePeriod?.status === 'processing' ? <Clock3 className="w-4 h-4 text-amber-500" /> : <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
            {activePeriod?.status || 'idle'}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-surface-100 p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-bold text-surface-900">Employee Payroll Profiles</h3>
            <p className="text-[10px] text-surface-400">Comprehensive payroll profile with attendance-linked metrics.</p>
          </div>
          <div className="w-full md:w-auto flex flex-col md:flex-row md:items-center gap-2">
            <select
              value={selectedEstimatePeriodId}
              onChange={(e) => setSelectedEstimatePeriodId(e.target.value)}
              className="px-3 py-2 text-xs border border-surface-200 rounded-lg bg-white"
            >
              {estimatePeriodOptions.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.name} ({period.start_date} to {period.end_date})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleComputeCurrentPayroll}
              className="px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Compute Current Payroll (All Employees)
            </button>
            <div className="relative w-full md:w-72">
              <Search className="w-3.5 h-3.5 text-surface-400 absolute left-2.5 top-2.5" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search employee, department, position" className="w-full pl-8 pr-3 py-2 text-xs border border-surface-200 rounded-lg" />
            </div>
          </div>
        </div>

        {/* Rule-Based Performance Modifiers Controls */}
        <div className="bg-surface-50/50 p-4 rounded-xl border border-surface-150 mb-5 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-start gap-2.5">
            <input 
              type="checkbox" 
              id="pref-checkins" 
              checked={highTierCheckinsModifier} 
              onChange={(e) => setHighTierCheckinsModifier(e.target.checked)} 
              className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
            />
            <div>
              <label htmlFor="pref-checkins" className="text-xs font-bold text-surface-800 flex items-center gap-1.5 cursor-pointer">
                Rapid Check-In Bonus (5%)
              </label>
              <p className="text-[10px] text-surface-500 leading-normal">Award 5%/hr incentive if front-desk guest checks-in are handled in under 3 minutes.</p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <input 
              type="checkbox" 
              id="pref-turnovers" 
              checked={volumeTurnoversModifier} 
              onChange={(e) => setVolumeTurnoversModifier(e.target.checked)} 
              className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
            />
            <div>
              <label htmlFor="pref-turnovers" className="text-xs font-bold text-surface-800 flex items-center gap-1.5 cursor-pointer">
                High-Volume Turnovers Milestone
              </label>
              <p className="text-[10px] text-surface-500 leading-normal">Award flat $50.00 crossover premium to cleaners executing more than 15 room turn-overs.</p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <input 
              type="checkbox" 
              id="pref-late" 
              checked={zeroLateModifier} 
              onChange={(e) => setZeroLateModifier(e.target.checked)} 
              className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
            />
            <div>
              <label htmlFor="pref-late" className="text-xs font-bold text-surface-800 flex items-center gap-1.5 cursor-pointer">
                Perfect Attendance Incentive
              </label>
              <p className="text-[10px] text-surface-500 leading-normal">Award flat $25.00 accuracy bonus for zero late-arrivals during cutoff intervals.</p>
            </div>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-[11px] min-w-[1100px]">
            <thead>
              <tr className="text-left text-[9px] uppercase tracking-wider text-surface-400 border-b border-surface-100">
                <th className="p-2">Employee</th>
                <th className="p-2">Department</th>
                <th className="p-2">Position</th>
                <th className="p-2">Employment</th>
                <th className="p-2">Salary Type</th>
                <th className="p-2">Basic</th>
                <th className="p-2">Daily</th>
                <th className="p-2">Hourly</th>
                <th className="p-2">OT Hours</th>
                <th className="p-2">Total Hours</th>
                <th className="p-2">Payroll Status</th>
              </tr>
            </thead>
            <tbody>
              {employeeRows.map(({ emp, payroll, hrs, overtime }) => (
                <tr key={emp.id} className="border-b border-surface-50 hover:bg-surface-50/70">
                  <td className="p-2">
                    <div className="font-semibold text-surface-900">{emp.full_name}</div>
                    <div className="text-[10px] text-surface-400">{payroll?.employee_id || emp.id.slice(0, 8).toUpperCase()}</div>
                  </td>
                  <td className="p-2">{payroll?.department || 'Unassigned'}</td>
                  <td className="p-2">{payroll?.position || 'Unassigned'}</td>
                  <td className="p-2">{payroll?.employment_type || 'regular'}</td>
                  <td className="p-2">{payroll?.salary_type || 'hourly'}</td>
                  <td className="p-2 font-mono">{fmt(payroll?.basic_salary || 0, currencySymbol)}</td>
                  <td className="p-2 font-mono">{fmt(payroll?.daily_rate || 0, currencySymbol)}</td>
                  <td className="p-2 font-mono">{fmt(payroll?.hourly_rate || 0, currencySymbol)}</td>
                  <td className="p-2 font-mono">{Number(overtime || 0).toFixed(1)}</td>
                  <td className="p-2 font-mono">{Number(hrs || 0).toFixed(1)}</td>
                  <td className="p-2">
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-surface-100 text-surface-700">{payroll?.payroll_status || 'active'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-surface-100 p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-bold text-surface-900">Current Cutoff Computation Sheet</h3>
            <p className="text-[10px] text-surface-400">
              Excel-style computation for {selectedEstimatePeriod ? `${selectedEstimatePeriod.name} (${selectedEstimatePeriod.start_date} to ${selectedEstimatePeriod.end_date})` : 'the selected cutoff'}.
            </p>
          </div>
          <div className="text-[10px] text-surface-500 font-mono">
            {computedAt ? `Last computed: ${new Date(computedAt).toLocaleString()}` : 'Not computed yet'}
          </div>
        </div>

        {computedRows.length === 0 ? (
          <div className="p-4 rounded-xl border border-dashed border-surface-200 text-xs text-surface-500">
            Click <span className="font-semibold">Compute Current Payroll (All Employees)</span> to generate hours/rate/pay computation for this cutoff.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="overflow-auto border border-surface-150 rounded-xl">
              <table className="w-full text-[11px] min-w-[1280px] border-collapse">
                <thead>
                  <tr className="bg-surface-100 text-[9px] uppercase tracking-wider text-surface-500 border-b border-surface-200">
                    <th className="p-2 text-left border-r border-surface-200">Employee</th>
                    <th className="p-2 text-left border-r border-surface-200">Dept</th>
                    <th className="p-2 text-left border-r border-surface-200">Position</th>
                    <th className="p-2 text-right border-r border-surface-200">Reg Hrs</th>
                    <th className="p-2 text-right border-r border-surface-200">OT Hrs</th>
                    <th className="p-2 text-right border-r border-surface-200">Hourly Rate</th>
                    <th className="p-2 text-right border-r border-surface-200">OT Rate</th>
                    <th className="p-2 text-right border-r border-surface-200">Basic Pay</th>
                    <th className="p-2 text-right border-r border-surface-200">OT Pay</th>
                    <th className="p-2 text-right border-r border-surface-200">Gross</th>
                    <th className="p-2 text-right border-r border-surface-200">Deductions</th>
                    <th className="p-2 text-right">Net Pay</th>
                  </tr>
                </thead>
                <tbody>
                  {computedRows.map((row) => (
                    <tr key={row.userId} className="border-b border-surface-100 hover:bg-surface-50/50">
                      <td className="p-2 border-r border-surface-100">
                        <div className="font-semibold text-surface-900">{row.employeeName}</div>
                        {!row.hasPayrollProfile && <div className="text-[9px] text-amber-600">No payroll profile</div>}
                      </td>
                      <td className="p-2 border-r border-surface-100">{row.department}</td>
                      <td className="p-2 border-r border-surface-100">{row.position}</td>
                      <td className="p-2 border-r border-surface-100 text-right font-mono">{row.regularHours.toFixed(2)}</td>
                      <td className="p-2 border-r border-surface-100 text-right font-mono">{row.overtimeHours.toFixed(2)}</td>
                      <td className="p-2 border-r border-surface-100 text-right font-mono">{fmt(row.hourlyRate, currencySymbol)}</td>
                      <td className="p-2 border-r border-surface-100 text-right font-mono">{fmt(row.overtimeRate, currencySymbol)}</td>
                      <td className="p-2 border-r border-surface-100 text-right font-mono">{fmt(row.basicPay, currencySymbol)}</td>
                      <td className="p-2 border-r border-surface-100 text-right font-mono">{fmt(row.overtimePay, currencySymbol)}</td>
                      <td className="p-2 border-r border-surface-100 text-right font-mono font-semibold">{fmt(row.earningsTotal, currencySymbol)}</td>
                      <td className="p-2 border-r border-surface-100 text-right font-mono text-rose-700">{fmt(row.deductionsTotal, currencySymbol)}</td>
                      <td className="p-2 text-right font-mono font-bold text-emerald-700">{fmt(row.netPay, currencySymbol)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-surface-100 border-t border-surface-200 text-[10px] font-bold">
                    <td className="p-2 border-r border-surface-200" colSpan={3}>Totals</td>
                    <td className="p-2 border-r border-surface-200 text-right font-mono">{computedTotals.regularHours.toFixed(2)}</td>
                    <td className="p-2 border-r border-surface-200 text-right font-mono">{computedTotals.overtimeHours.toFixed(2)}</td>
                    <td className="p-2 border-r border-surface-200" colSpan={4}></td>
                    <td className="p-2 border-r border-surface-200 text-right font-mono">{fmt(computedTotals.earningsTotal, currencySymbol)}</td>
                    <td className="p-2 border-r border-surface-200 text-right font-mono text-rose-700">{fmt(computedTotals.deductionsTotal, currencySymbol)}</td>
                    <td className="p-2 text-right font-mono text-emerald-700">{fmt(computedTotals.netPay, currencySymbol)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-surface-100 p-4">
          <h3 className="text-sm font-bold text-surface-900 mb-2">Payroll Approval Queue</h3>
          <div className="flex items-center gap-2 mb-3">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="text-xs border border-surface-200 rounded-lg px-2.5 py-1.5">
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="paid">Paid</option>
            </select>
            <span className="text-[10px] text-surface-400">Fast bulk-review for HR/Finance approvals.</span>
          </div>
          <div className="space-y-2 max-h-80 overflow-auto pr-1">
            {filteredEntries.slice(0, 40).map((entry) => (
              <div key={entry.id} className="border border-surface-100 rounded-xl p-2.5 flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-surface-900">{entry.users?.full_name || entry.user_id}</p>
                  <p className="text-[10px] text-surface-500">Net: {fmt(entry.net_pay, currencySymbol)} | Status: {entry.status}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => onOpenPayslip(entry)} className="px-2 py-1 text-[10px] rounded bg-surface-100 hover:bg-surface-200">Payslip</button>
                  {entry.status === 'pending' && <button onClick={() => onUpdateEntryStatus(entry.id, 'approved')} className="px-2 py-1 text-[10px] rounded bg-blue-50 text-blue-700 hover:bg-blue-100">Approve</button>}
                  {entry.status === 'approved' && <button onClick={() => onUpdateEntryStatus(entry.id, 'paid')} className="px-2 py-1 text-[10px] rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100">Release</button>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-surface-100 p-4">
          <h3 className="text-sm font-bold text-surface-900 mb-2">Upcoming Payroll Releases</h3>
          <div className="space-y-2 max-h-80 overflow-auto pr-1">
            {upcomingReleases.map((period) => (
              <div key={period.id} className="border border-surface-100 rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-surface-900">{period.name}</p>
                    <p className="text-[10px] text-surface-500 flex items-center gap-1"><Calendar className="w-3 h-3" />{period.start_date} to {period.end_date}</p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">{period.status}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-[10px] text-surface-500">Entries: {payrollEntries.filter((e) => e.period_id === period.id).length}</p>
                  {period.status === 'pending' && (
                    <button onClick={() => onProcessPeriod(period.id)} className="px-2.5 py-1 text-[10px] rounded bg-brand-600 text-white hover:bg-brand-700">Process Now</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 p-3 rounded-xl border border-brand-100 bg-brand-50/40 text-[10px] text-brand-800">
            <p className="font-semibold flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" />Security and audit mode enabled</p>
            <p className="mt-1">Track HR review, manager approval, finance release, and entry-level modification history for every payroll cycle.</p>
          </div>

          <div className="mt-2 p-3 rounded-xl border border-amber-100 bg-amber-50/40 text-[10px] text-amber-800">
            <p className="font-semibold flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />Data quality reminders</p>
            <p className="mt-1">Night differential, late penalties, undertime, holiday work, and leave-pay integration rely on complete attendance logs.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
