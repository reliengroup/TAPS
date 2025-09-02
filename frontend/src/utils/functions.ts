import type { PayrollTimesheetEntryDTO  } from "./types";


export function findAndReplaceTimesheetEntry(
  arr: PayrollTimesheetEntryDTO[],
  updated: PayrollTimesheetEntryDTO,
  start: number,
  end: number
): PayrollTimesheetEntryDTO[] {
  if (!arr || start > end) return arr;

  // Clamp bounds to array range
  const s = Math.max(0, start | 0);
  const e = Math.min(arr.length - 1, end | 0);

  for (let i = s; i <= e; i++) {
    // String() guards against ObjectId vs string differences
    if (String(arr[i]?._id) === String(updated?._id)) {
      arr[i] = updated; // in-place replace
      break;
    }
  }
  return arr;
}

