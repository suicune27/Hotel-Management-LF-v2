import type { EmployeePayroll, PayrollEntry, TimeEntry } from '../types';

export interface PerformanceModifiers {
  roomTurnoversCount?: number;
  highTierCheckinsUnder3Min?: boolean;
  zeroLateBonus?: boolean;
}

export interface PayrollComputationInput {
  profile: EmployeePayroll;
  entries: TimeEntry[];
  periodStart: string;
  periodEnd: string;
  customEarnings?: Record<string, number>;
  customDeductions?: Record<string, number>;
  performanceModifiers?: PerformanceModifiers;
}

export interface PayrollComputationResult {
  regularHours: number;
  overtimeHours: number;
  nightDiffHours: number;
  lateMinutes: number;
  undertimeMinutes: number;
  absences: number;
  holidayHours: number;
  restDayHours: number;
  gross: number;
  deductions: number;
  net: number;
  earningsBreakdown: Record<string, number>;
  deductionsBreakdown: Record<string, number>;
  performanceReport: string[];
}

function n(v: number | null | undefined): number {
  return Number(v || 0);
}

function sum(values: number[]): number {
  return values.reduce((acc, cur) => acc + cur, 0);
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function computePayroll(input: PayrollComputationInput): PayrollComputationResult {
  const hourlyRate = n(input.profile.hourly_rate);
  const overtimeRate = n(input.profile.overtime_rate) || round2(hourlyRate * 1.5); // Standard multiplier at 1.5x
  const nightDiffRate = n(input.profile.night_diff_rate) || round2(hourlyRate * 0.1);
  const dailyRate = n(input.profile.daily_rate);
  const basicSalary = n(input.profile.basic_salary);

  // --- AUTOMATED OVERTIME & BREAK ENGINE ---
  // Each day, any consecutive hours past 8 are automatically routed to overtime.
  // We also track if meal break taken (metadata indicator)
  let calculatedRegularHours = 0;
  let calculatedOvertimeHours = 0;
  let totalMealBreaksCount = 0;

  input.entries.forEach((e) => {
    const rawTotal = n(e.total_hours);
    let meta: any = {};
    const notesStr = e.notes || (e as any).metadata;
    if (notesStr) {
      if (typeof notesStr === 'string' && notesStr.trim().startsWith('{')) {
        try {
          meta = JSON.parse(notesStr);
        } catch (err) {}
      } else if (typeof notesStr === 'object') {
        meta = notesStr;
      }
    }
    
    // Check meal-break tracking indicators
    if (meta.meal_break_taken || meta.has_meal_break) {
      totalMealBreaksCount++;
    }

    if (rawTotal > 8) {
      calculatedRegularHours += 8;
      calculatedOvertimeHours += (rawTotal - 8);
    } else {
      calculatedRegularHours += rawTotal;
    }
  });

  const regularHours = round2(calculatedRegularHours);
  // Auto merge calculated overtime with database prelogged overtimes
  const preloggedOvertime = sum(input.entries.map((e) => n(e.overtime_hours)));
  const overtimeHours = round2(Math.max(calculatedOvertimeHours, preloggedOvertime));

  const nightDiffHours = round2(sum(input.entries.map((e) => n(e.night_diff_hours))));
  const lateMinutes = Math.round(sum(input.entries.map((e) => n(e.late_minutes))));
  const undertimeMinutes = Math.round(sum(input.entries.map((e) => n(e.undertime_minutes))));
  const absences = round2(sum(input.entries.map((e) => n(e.absence_hours))) / 8);
  const holidayHours = round2(sum(input.entries.map((e) => n(e.holiday_work_hours))));
  const restDayHours = round2(sum(input.entries.map((e) => n(e.rest_day_work_hours))));

  const latePenalty = round2(((lateMinutes + undertimeMinutes) / 60) * hourlyRate);
  const absenceDeduction = round2(absences * (dailyRate || (hourlyRate * 8)));

  const basePay = (() => {
    if (input.profile.salary_type === 'monthly' && basicSalary > 0) return basicSalary;
    if (input.profile.salary_type === 'daily' && dailyRate > 0) return round2((regularHours / 8) * dailyRate);
    return round2(regularHours * hourlyRate);
  })();

  // --- PERFORMANCE MODIFIERS SECTION ---
  const perf = input.performanceModifiers || {};
  let modifierEarnings = 0;
  const performanceReport: string[] = [];

  // Rule 1: handles high-tier guest check-ins under 3 minutes (5% bonus per working hour multiplier)
  if (perf.highTierCheckinsUnder3Min) {
    const checkinBonus = round2(regularHours * (hourlyRate * 0.05));
    if (checkinBonus > 0) {
      modifierEarnings += checkinBonus;
      performanceReport.push(`Rapid Check-In Premium (5% / hr): +${checkinBonus.toFixed(2)}`);
    }
  }

  // Rule 2: successfully processes more than 15 room turn-overs
  if (perf.roomTurnoversCount && perf.roomTurnoversCount > 15) {
    const crossoverBonus = 50.00; // Flat milestone premium
    modifierEarnings += crossoverBonus;
    performanceReport.push(`High Volume Turnovers Milestone (>15): +${crossoverBonus.toFixed(2)}`);
  }

  // Rule 3: Attendance consistency (waive late penalties for pristine records / custom reward)
  if (perf.zeroLateBonus && lateMinutes === 0) {
    const consistencyBonus = 25.00;
    modifierEarnings += consistencyBonus;
    performanceReport.push(`Perfect Attendance Incentive: +${consistencyBonus.toFixed(2)}`);
  }

  const earningsBreakdown: Record<string, number> = {
    basic_salary: basePay,
    overtime_pay: round2(overtimeHours * overtimeRate),
    night_diff_pay: round2(nightDiffHours * nightDiffRate),
    holiday_premium: round2(holidayHours * hourlyRate * 0.3),
    rest_day_premium: round2(restDayHours * hourlyRate * 0.3),
    allowances: n(input.customEarnings?.allowances),
    incentives: n(input.customEarnings?.incentives) + modifierEarnings,
    bonuses: n(input.customEarnings?.bonuses),
    commissions: n(input.customEarnings?.commissions),
    tips: n(input.customEarnings?.tips),
    service_charge_distribution: n(input.customEarnings?.service_charge_distribution),
    hazard_pay: n(input.customEarnings?.hazard_pay),
    custom_earnings: n(input.customEarnings?.custom_earnings),
  };

  const statutoryDeductions: Record<string, number> = {
    sss: round2(basePay * 0.045),
    philhealth: round2(basePay * 0.025),
    pagibig: round2(Math.min(basePay * 0.02, 200)),
    withholding_tax: round2(Math.max(basePay - 20833, 0) * 0.15),
  };

  const deductionsBreakdown: Record<string, number> = {
    ...statutoryDeductions,
    late_penalties: latePenalty,
    absence_deductions: absenceDeduction,
    cash_advance: n(input.customDeductions?.cash_advance),
    salary_loans: n(input.customDeductions?.salary_loans),
    uniform_charges: n(input.customDeductions?.uniform_charges),
    meal_charges: n(input.customDeductions?.meal_charges),
    custom_deductions: n(input.customDeductions?.custom_deductions),
  };

  const gross = round2(sum(Object.values(earningsBreakdown)));
  const deductions = round2(sum(Object.values(deductionsBreakdown)));
  const net = round2(gross - deductions);

  return {
    regularHours,
    overtimeHours,
    nightDiffHours,
    lateMinutes,
    undertimeMinutes,
    absences,
    holidayHours,
    restDayHours,
    gross,
    deductions,
    net,
    earningsBreakdown,
    deductionsBreakdown,
    performanceReport,
  };
}

export function toPayrollEntry(
  periodId: string,
  userId: string,
  result: PayrollComputationResult,
  profile: EmployeePayroll
): Omit<PayrollEntry, 'id' | 'created_at'> {
  return {
    period_id: periodId,
    user_id: userId,
    total_regular_hours: result.regularHours,
    total_overtime_hours: result.overtimeHours,
    total_night_diff_hours: result.nightDiffHours,
    total_late_minutes: result.lateMinutes,
    total_undertime_minutes: result.undertimeMinutes,
    total_absence_days: result.absences,
    hourly_rate: n(profile.hourly_rate),
    overtime_rate: n(profile.overtime_rate),
    earnings_total: result.gross,
    deductions_total: result.deductions,
    gross_pay: result.gross,
    deductions: result.deductions,
    net_pay: result.net,
    status: 'pending',
    paid_at: null,
    notes: JSON.stringify({
      earnings: result.earningsBreakdown,
      deductions: result.deductionsBreakdown,
    }),
    version: 1,
  };
}
