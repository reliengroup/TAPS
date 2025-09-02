
/** Core Employee shape as returned by your API (unpopulated) */
export interface EmployeeDTO {
  _id: ObjectIdString;
  employeeName: string;
  position: string;

  amRate: number;   // ≥ 0
  midRate: number;  // ≥ 0
  pmRate: number;   // ≥ 0
  ltRate: number;   // ≥ 0

  cashSplitPercent: number;   // 0..100
  /** Optional: minimum increment when counting days (e.g., 0.25 = quarter-day) */
  daysIncrementValue?: number;

  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

/** Payload for creating a new Employee */
export interface EmployeeCreatePayload {
  employeeName: string;
  position: string;

  amRate: number;
  midRate: number;
  pmRate: number;
  ltRate: number;

  cashSplitPercent: number;
  daysIncrementValue?: number;
}

/** Payload for updating an Employee (partial) */
export type EmployeeUpdatePayload = Partial<EmployeeCreatePayload>;

/** Useful keys & helpers for UI forms/tables */
export const RATE_KEYS = ["amRate", "midRate", "pmRate", "ltRate"] as const;
export type RateKey = typeof RATE_KEYS[number];

/** Minimal shape for lightweight lists/selects */
export interface EmployeeMinimal {
  _id: ObjectIdString;
  employeeName: string;
  position: string;
}

/** Mongo ObjectId represented as a string on the frontend */
export type ObjectIdString = string;

/** Shift code used for each slot (AM/MID/PM/LT) */
export type ShiftCode = "" | "A" | "P" | "E" | "S" | "V";

/** Single day in the pay period */
export interface PayPeriodDay {
  /** e.g. "Mon", "Tue" */
  dayName: string;
  /** ISO string (e.g., "2025-08-26T00:00:00.000Z") */
  date: string;
}

/** Entry for a specific date containing 4 shift slots */
export interface PayrollDataEntry {
  payPeriodDate: PayPeriodDay;
  am: ShiftCode;
  mid: ShiftCode;
  pm: ShiftCode;
  lt: ShiftCode;
}

/**
 * API DTO as returned to the frontend (unpopulated refs).
 * Matches the schema fields but uses string IDs and ISO date strings.
 */
export interface PayrollTimesheetEntryDTO {
  _id: string;
  payPeriod?: ObjectIdString | null;   // ref: "PayPeriod"
  employeeId?:  string;    // ref: "Employee"
  employeeName?:string;
  employeePosition?:string;
  payrollData: any;
  totalDays: number;                   // default 0 in backend
  totalShifts: number;
  payRate: number;                     // required
  cash?: number;
  payroll?: number;
  total?: number;
  notes?: string;
}

/**
 * Optional populated shape if your API returns populated refs.
 * Replace fields with your real PayPeriod/Employee frontend types if needed.
 */
export interface PayPeriodMinimal {
  _id: ObjectIdString;
  name?: string;
  startDate?: string; // ISO
  endDate?: string;   // ISO
}



export type PayrollTimesheetEntryPopulated = Omit<
  PayrollTimesheetEntryDTO,
  "payPeriod" | "employee"
> & {
  payPeriod?: PayPeriodMinimal | null;
  employee?: EmployeeMinimal | null;
};

/* -------------------- (Optional) UI helpers -------------------- */

/** Flattened row you might feed to a table if you keep computed amounts client-side */
export interface PayrollTimesheetRow {
  _id: ObjectIdString;
  employeeName: string;
  employeeId:string;
  position?: string;
  payRate: number;
  /** Map by ISO date for quick lookup in a grid */
  dayMap: Record<string, { am: ShiftCode; mid: ShiftCode; pm: ShiftCode; lt: ShiftCode }>;
  totalDays: number;
  totalShifts:number;
  cash?: number;
  payroll?: number;
  total?: number;
  notes?: string;
  createdAt:Date;
  updatedAt:Date;
}

/** Union of all four shift slots for convenient iteration in UI */
export const SHIFT_SLOTS = ["am", "mid", "pm", "lt"] as const;
export type ShiftSlot = typeof SHIFT_SLOTS[number];
