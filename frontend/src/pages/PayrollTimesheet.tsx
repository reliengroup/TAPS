import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { utils, writeFile } from "xlsx";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import DataTable from "../components/ui/DataTable";
import Button from "../components/ui/Button";
import {
  Loader,
  Trash2,
  PencilLine,
  Check,
  CheckSquare,
  Square,
} from "lucide-react";
import type { PayrollTimesheetEntryDTO } from "../utils/types";
import { findAndReplaceTimesheetEntry } from "../utils/functions";
import Modal from "../components/ui/Modal";
import { Plus } from "lucide-react";
import NotesEditor from "../components/ui/NotesEditor";

const serverUrl = import.meta.env.VITE_SERVER_URL;

// helpers
const toDateStr = (d: string | Date | undefined) => {
  let dateStr = d ? d.toString().split("T")[0] : "";
  const dateStrArr = dateStr.split("-");
  dateStr = `${dateStrArr[1]}/${dateStrArr[2]}/${dateStrArr[0]}`;
  return dateStr;
};

const SHIFT_FIELDS = ["am", "mid", "pm", "lt"] as const;
const SHIFT_VALUES = ["", "A", "P", "E", "S", "V"] as const;
type ShiftField = (typeof SHIFT_FIELDS)[number];
type ShiftValue = (typeof SHIFT_VALUES)[number];

const getRowKey = (row: any, selectedPayPeriodId: string) => {
  if (row?._id) return String(row._id);
  const empId = row?.employeeId || "unknown-emp";
  return `${empId}::${selectedPayPeriodId}`;
};

// Resolve the map key used in backend (supports both styles)
function resolvePayrollDataKey(
  entry: PayrollTimesheetEntryDTO,
  iso: string,
  dayName: string,
  rawDate: string,
) {
  if (entry.payrollData && entry.payrollData[iso]) return iso;
  const concatKey = `${rawDate}-${dayName}`;
  if (entry.payrollData && (entry.payrollData as any)[concatKey])
    return concatKey;
  return iso;
}

export default function PayrollTimesheet() {
  const [loading, setLoading] = useState<boolean>(false);

  const [selectedPayPeriodId, setSelectedPayPeriodId] = useState<string>("");
  const [payPeriodTotal, setPayPeriodTotal] = useState<number>(0);
  const [payPeriodTotalCash, setPayPeriodTotalCash] = useState<number>(0);
  const [payPeriodTotalPayroll, setPayPeriodTotalPayroll] = useState<number>(0);

  console.log({ payPeriodTotal });

  const [search, setSearch] = useState<string>("");

  // populated from backend
  const [payPeriodDetails, setPayPeriodDetails] = useState<{
    _id: string;
    startDate: string;
    endDate: string;
    payDay?: string;
  } | null>(null);

  const [payPeriodDays, setPayPeriodDays] = useState<
    { date: string; dayName: string }[]
  >([]);

  const [allPayPeriods, setAllPayPeriods] = useState<
    { _id: string; startDate: string; endDate: string }[]
  >([]);

  const [timesheetEntries, setTimesheetEntries] = useState<
    PayrollTimesheetEntryDTO[]
  >([]);

  // selection state for bulk delete
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Track per-cell pending state: `${employeeId}|${key}|${field}`
  const [pending, setPending] = useState<Record<string, boolean>>({});

  // row edit state (stable key)
  const [editingRowKey, setEditingRowKey] = useState<string | null>(null);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return timesheetEntries;
    return timesheetEntries.filter((e) => {
      const name = (e.employeeName || "").toLowerCase();
      const pos = (e.employeePosition || "").toLowerCase();
      return name.includes(q) || pos.includes(q);
    });
  }, [search, timesheetEntries]);

  // Esc to exit edit mode
  useEffect(() => {
    if (!editingRowKey) return;
    const onKey = (e: KeyboardEvent) =>
      e.key === "Escape" && setEditingRowKey(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editingRowKey]);

  // Create-entry modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createOptions, setCreateOptions] = useState<
    { _id: string; employeeName: string }[]
  >([]);
  const [selectedEmployeeIdForCreate, setSelectedEmployeeIdForCreate] =
    useState<string>("");

  // fetch employees w/o entry for selected pay period
  const loadCreateOptions = useCallback(async () => {
    if (!selectedPayPeriodId) return;
    setCreateLoading(true);
    try {
      const r = await fetch(
        `${serverUrl}/employee/with-no-timesheet-entry/${selectedPayPeriodId}`,
        { credentials: "include" },
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j?.message || "Failed to load employees");
      setCreateOptions(Array.isArray(j?.employees) ? j.employees : []);
    } catch (e: any) {
      toast.error(e?.message || "Could not load employees");
    } finally {
      setCreateLoading(false);
    }
  }, [selectedPayPeriodId]);

  const onNotesSaved = useCallback((updated: PayrollTimesheetEntryDTO) => {
    setTimesheetEntries((prev) => {
      const next = findAndReplaceTimesheetEntry(
        prev,
        updated,
        0,
        prev.length - 1,
      );
      return Array.from(next);
    });
    toast.success("Notes saved");
  }, []);

  const openCreateModal = () => {
    if (!selectedPayPeriodId) {
      toast.error("Please select a pay period first.");
      return;
    }
    setSelectedEmployeeIdForCreate("");
    setCreateOpen(true);
    loadCreateOptions();
  };

  const createTimesheetForSelected = async () => {
    if (!selectedEmployeeIdForCreate) {
      toast.error("Choose an employee");
      return;
    }
    setCreateLoading(true);
    try {
      const r = await fetch(
        `${serverUrl}/timesheet/create-by-emp/${selectedEmployeeIdForCreate}/pay-period/${selectedPayPeriodId}`,
        { method: "POST", credentials: "include" },
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok)
        throw new Error(j?.message || "Failed to create timesheet entry");

      toast.success("Timesheet entry created");
      setCreateOpen(false);
      await fetchData(); // refresh table
    } catch (e: any) {
      toast.error(e?.message || "Create failed");
    } finally {
      setCreateLoading(false);
    }
  };

  // ---------- API ----------

  const fetchAllPayPeriods = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${serverUrl}/pay-period/`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch pay periods");
      const data = await res.json();
      const periods = (data?.payPeriods ?? []) as {
        _id: string;
        startDate: string;
        endDate: string;
      }[];
      periods.sort(
        (a, b) =>
          new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
      );
      setAllPayPeriods(periods);
    } catch (err: any) {
      toast.error(err?.message || "Error fetching pay periods");
    } finally {
      setLoading(false);
    }
  }, []);

  const getCurrentPayPeriodId = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${serverUrl}/pay-period/current-id`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch current pay period id");
      const data = await res.json();
      if (data?.currentPayPeriodId)
        setSelectedPayPeriodId(data.currentPayPeriodId);
    } catch (error: any) {
      toast.error(error?.message || "error fetching current id");
    } finally {
      setLoading(false);
    }
  }, []);

  function calculateTotal(entries: PayrollTimesheetEntryDTO[]): any {
    const grandTotal = Math.round(
      entries.reduce((acc, te) => (te.total || 0) + acc, 0),
    );
    const totalDays = entries.reduce((acc, te) => (te.totalDays || 0) + acc, 0);
    const totalCash = entries.reduce((acc, te) => (te.cash || 0) + acc, 0);
    const totalPayroll = entries.reduce(
      (acc, te) => (te.payroll || 0) + acc,
      0,
    );
    return {
      grandTotal,
      totalDays,
      totalCash,
      totalPayroll,
    };
  }

  const fetchData = useCallback(async () => {
    if (!selectedPayPeriodId) return;
    setLoading(true);
    try {
      const [daysRes, periodRes, timesheetRes] = await Promise.all([
        fetch(`${serverUrl}/pay-period/days/${selectedPayPeriodId}`, {
          credentials: "include",
        }),
        fetch(`${serverUrl}/pay-period/details/${selectedPayPeriodId}`, {
          credentials: "include",
        }),
        fetch(`${serverUrl}/timesheet/${selectedPayPeriodId}`, {
          credentials: "include",
        }),
      ]);

      if (!daysRes.ok) throw new Error("Failed to fetch pay period days");
      if (!periodRes.ok) throw new Error("Failed to fetch pay period details");
      if (!timesheetRes.ok)
        throw new Error("Failed to fetch timesheet entries");

      const daysData = await daysRes.json();
      const periodData = await periodRes.json();
      const timesheetData = await timesheetRes.json();

      setPayPeriodDays(daysData.days || []);
      setPayPeriodDetails(periodData.payPeriod || null);
      const rows = timesheetData.timesheetEntries || [];
      setTimesheetEntries(rows);
      const { grandTotal,  totalCash, totalPayroll } =
        calculateTotal(rows);
      setPayPeriodTotal(grandTotal);
      setPayPeriodTotalCash(totalCash);
      setPayPeriodTotalPayroll(totalPayroll);

      // keep selection only for still-existing rows
      setSelectedIds((prev) =>
        prev.filter((id) => rows.some((r: any) => r._id === id)),
      );
    } catch (error: any) {
      toast.error(error?.message || "error fetching data");
    } finally {
      setLoading(false);
    }
  }, [selectedPayPeriodId]);

  useEffect(() => {
    fetchAllPayPeriods();
    getCurrentPayPeriodId();
  }, []);

  useEffect(() => {
    if (selectedPayPeriodId) fetchData();
  }, [selectedPayPeriodId, fetchData]);

  // Update cell
  const updateShift = async (
    entry: PayrollTimesheetEntryDTO,
    iso: string,
    dayName: string,
    rawDate: string,
    fieldName: ShiftField,
    fieldValue: ShiftValue,
  ) => {
    const employeeId = entry.employeeId;
    if (!employeeId) {
      toast.error("Missing employee id for update");
      return;
    }

    const payrollDataKey = resolvePayrollDataKey(entry, iso, dayName, rawDate);
    const cellKey = `${employeeId}|${payrollDataKey}|${fieldName}`;

    setPending((p) => ({ ...p, [cellKey]: true }));
    try {
      const res = await fetch(`${serverUrl}/timesheet`, {
        credentials: "include",
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId,
          payrollDataKey,
          fieldName,
          fieldValue,
        }),
      });
      if (!res.ok) {
        let msg = "Failed to update timesheet";
        try {
          const j = await res.json();
          msg = j?.message || msg;
        } catch { }
        throw new Error(msg);
      }
      const data = await res.json();
      const updated = data.updatedTimesheetEntry as PayrollTimesheetEntryDTO;
      setTimesheetEntries((prev: PayrollTimesheetEntryDTO[]) => {
        const newEntries = findAndReplaceTimesheetEntry(
          prev,
          updated,
          0,
          prev.length - 1,
        );
        const { grandTotal,totalCash, totalPayroll } =
          calculateTotal(newEntries);
        setPayPeriodTotal(grandTotal);
        setPayPeriodTotalCash(totalCash);
        setPayPeriodTotalPayroll(totalPayroll);

        return Array.from(newEntries);
      });
      toast.success("Attendance updated");
    } catch (err: any) {
      toast.error(err?.message || "Error updating attendance");
    } finally {
      setPending((p) => {
        const { [cellKey]: _omit, ...rest } = p;
        return rest;
      });
    }
  };

  // delete entry (row-level)
  const deleteTimesheetEntry = async (entryId: string) => {
    if (!entryId) return;
    const ok = confirm("Delete this timesheet entry? This cannot be undone.");
    if (!ok) return;

    try {
      setLoading(true);
      const res = await fetch(`${serverUrl}/timesheet/${entryId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(j?.message || "Failed to delete timesheet entry");
      toast.success("Timesheet entry deleted");
      await fetchData();
    } catch (e: any) {
      toast.error(e?.message || "Delete failed");
    } finally {
      setLoading(false);
    }
  };

  // ===== BULK DELETE =====

  const isSelected = (id: string) => selectedIds.includes(id);
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const allOnPageSelected =
    timesheetEntries.length > 0 &&
    timesheetEntries.every((r) => selectedIds.includes(r._id as string));

  const toggleSelectPage = () => {
    if (allOnPageSelected) {
      // unselect all currently shown
      setSelectedIds((prev) =>
        prev.filter((id) => !timesheetEntries.some((r) => r._id === id)),
      );
    } else {
      // add all currently shown
      const ids = timesheetEntries.map((r) => String(r._id));
      setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
    }
  };

  const clearSelection = () => setSelectedIds([]);

  const deleteSelected = async () => {
    if (selectedIds.length === 0) return;
    const ok = confirm(
      `Delete ${selectedIds.length} timesheet entr${selectedIds.length === 1 ? "y" : "ies"}? This cannot be undone.`,
    );
    if (!ok) return;

    try {
      setLoading(true);
      const res = await fetch(`${serverUrl}/timesheet/bulk-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids: selectedIds }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Bulk delete failed");

      toast.success(
        `Deleted ${json?.timesheetDeletedCount ?? selectedIds.length} entr${selectedIds.length === 1 ? "y" : "ies"}`,
      );
      clearSelection();
      setEditingRowKey(null);
      await fetchData();
    } catch (e: any) {
      toast.error(e?.message || "Bulk delete failed");
    } finally {
      setLoading(false);
    }
  };

  // ---------- Columns (Desktop Table) ----------

  const columns = useMemo(() => {
    const selectColumn = {
      header: "",
      accessor: "__select",
      cell: (row: PayrollTimesheetEntryDTO) => (
        <input
          type="checkbox"
          checked={isSelected(String(row._id))}
          onChange={(e) => {
            e.stopPropagation();
            toggleSelect(String(row._id));
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ),
    };

    const dayColumns =
      payPeriodDays?.map((day: any) => {
        const rawDate = String(day.date);
        const iso = rawDate.split("T")[0];
        const header = `${iso} - ${day.dayName}`;

        return {
          header,
          accessor: `payrollData.${iso}`,
          cell: (row: PayrollTimesheetEntryDTO) => {
            const key = resolvePayrollDataKey(row, iso, day.dayName, rawDate);
            const attendance = row.payrollData?.[key] || {};
            const compact = `${attendance.am || ""}/${attendance.mid || ""}/${attendance.pm || ""}/${attendance.lt || ""}`;

            const rowKey = getRowKey(row, selectedPayPeriodId);

            if (editingRowKey !== rowKey) {
              return <span className="whitespace-nowrap">{compact}</span>;
            }

            const values: Record<ShiftField, ShiftValue> = {
              am: (attendance.am as ShiftValue) || "",
              mid: (attendance.mid as ShiftValue) || "",
              pm: (attendance.pm as ShiftValue) || "",
              lt: (attendance.lt as ShiftValue) || "",
            };

            return (
              <div
                className="flex gap-1"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                {SHIFT_FIELDS.map((slot) => {
                  const isBusy =
                    pending[
                    `${row.employeeId || (row as any).employeeId}|${key}|${slot}`
                    ] === true;

                  return (
                    <div key={slot} className="flex items-center gap-1">
                      <label className="text-[10px] uppercase text-secondary">
                        {slot}
                      </label>
                      <select
                        className={`border rounded-md px-1 py-0.5 text-sm ${isBusy ? "opacity-50 pointer-events-none" : ""}`}
                        value={values[slot]}
                        onChange={(e) =>
                          updateShift(
                            row,
                            iso,
                            day.dayName,
                            rawDate,
                            slot,
                            e.target.value as ShiftValue,
                          )
                        }
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {SHIFT_VALUES.map((v) => (
                          <option key={v} value={v}>
                            {v === "" ? "-" : v}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            );
          },
        };
      }) ?? [];

    return [
      selectColumn,
      { header: "Employee Name", accessor: "employeeName" as const },
      { header: "Employee Position", accessor: "employeePosition" },
      ...dayColumns,
      {
        header: "Total Days",
        accessor: "totalDays" as const,
        cell: (row: PayrollTimesheetEntryDTO) => row.totalDays,
      },
      {
        header: "Pay Rate",
        accessor: "payRate" as const,
        cell: (r: any) => "$" + r.payRate,
      },
      {
        header: "Cash",
        accessor: "cash" as const,
        cell: (r: any) => (r.cash != null ? "$" + r.cash.toFixed(2) : ""),
      },
      {
        header: "Payroll",
        accessor: "payroll" as const,
        cell: (r: any) => (r.payroll != null ? "$" + r.payroll.toFixed(2) : ""),
      },
      {
        header: "Total",
        accessor: "total" as const,
        cell: (r: any) => (r.total != null ? "$" + Math.round(r.total) : ""),
      },
      {
        header: "Notes",
        accessor: "notes" as const,
        cell: (row: PayrollTimesheetEntryDTO) => {
          const rk = getRowKey(row, selectedPayPeriodId);
          const entryId = String(row._id || "");
          return (
            <NotesEditor
              key={entryId}
              entryId={entryId}
              initialText={row.notes ?? ""}
              isEditing={editingRowKey === rk}
              serverUrl={serverUrl}
              onSaved={onNotesSaved}
            />
          );
        },
      },
      {
        header: "Actions",
        accessor: "__actions",
        cell: (row: PayrollTimesheetEntryDTO) => (
          <div className="flex items-center gap-2">
            <Button
              className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-700 px-2 py-1 text-xs text-red-700 "
              onClick={(e: any) => {
                e.stopPropagation();
                if (row?._id) deleteTimesheetEntry(row._id);
                else toast.error("Missing entry id");
              }}
            >
              <Trash2 size={14} /> Delete
            </Button>
          </div>
        ),
      },
    ];
  }, [
    payPeriodDays,
    pending,
    editingRowKey,
    selectedPayPeriodId,
    selectedIds,
    timesheetEntries,
  ]);

  // ---------- Excel export ----------

  const exportToExcel = () => {
    const headerDays = payPeriodDays.map(
      (d: any) => `${String(d.date).split("T")[0]} - ${d.dayName}`,
    );

    const rowsForSheet = [];
    rowsForSheet.push({
      "Start Date": payPeriodDetails?.startDate.split("T")[0],
      "End Date": payPeriodDetails?.endDate.split("T")[0],
      "Pay Day": payPeriodDetails?.payDay?.split("T")[0],
    });
    timesheetEntries.forEach((entry) => {
      const dayMap: Record<string, string> = {};
      payPeriodDays.forEach((d: any) => {
        const rawDate = String(d.date);
        const iso = rawDate.split("T")[0];
        const key = resolvePayrollDataKey(entry, iso, d.dayName, rawDate);
        const attendance = entry.payrollData?.[key];
        const cell = attendance
          ? `${attendance.am || ""}/${attendance.mid || ""}/${attendance.pm || ""}/${attendance.lt || ""}`
          : "";
        dayMap[`${iso} - ${d.dayName}`] = cell;
      });

      rowsForSheet.push({
        "Employee Name": entry.employeeName,
        ...dayMap,
        "Total Days": entry.totalDays,
        "Pay Rate": "$" + entry.payRate,
        Cash: "$" + entry.cash,
        Payroll: "$" + entry.payroll,
        Total: "$" + Math.round(entry.total || 0),
        Notes: entry.notes || "",
      });
    });

    rowsForSheet.push({
      "Employee Name": "Total",
      ...Object.fromEntries(headerDays.map((d: string) => [d, ""])),
      //@ts-ignore
      "Total Days": "",
      //@ts-ignore
      "Pay Rate": "",
      //@ts-ignore
      Cash: "",
      //@ts-ignore
      Payroll: "",
      Total: "$" + payPeriodTotal,
      Notes: "",
    });

    const ws = utils.json_to_sheet(rowsForSheet, {
      header: [
        "Employee Name",
        ...headerDays,
        "Total Days",
        "Pay Rate",
        "Cash",
        "Payroll",
        "Total",
        "Notes",
      ],
    });
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Timesheet");

    const first = payPeriodDays[0]?.date;
    const last = payPeriodDays[payPeriodDays.length - 1]?.date;
    const periodLabel = `${toDateStr(first)}–${toDateStr(last)}`;
    writeFile(wb, `Payroll_Timesheet_${periodLabel}.xlsx`);
  };

  // derived display strings
  const startStr = toDateStr(payPeriodDetails?.startDate);
  const endStr = toDateStr(payPeriodDetails?.endDate);
  const payDay = toDateStr(payPeriodDetails?.payDay);

  return (
    <div className="p-6 relative">
      {/* loading overlay */}
      {loading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-xl bg-white/80">
          <Loader className="animate-spin text-primary" size={50} />
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h2 className="text-2xl font-semibold">Timesheet</h2>

        <div className="flex flex-col items-end gap-3 ">
          <div className="flex gap-2 items-center">
            {/* Pay Period selector */}
            <div className="flex items-center flex-col md:flex-row gap-2">
              <label htmlFor="pp" className="text-sm font-medium">
                Pay Period:
              </label>
              <select
                id="pp"
                className="rounded-xl border bg-white px-3 py-2"
                value={selectedPayPeriodId}
                onChange={(e) => {
                  setEditingRowKey(null);
                  setSelectedIds([]); // clear selection on period change
                  setSelectedPayPeriodId(e.target.value);
                }}
                disabled={loading || allPayPeriods.length === 0}
              >
                {allPayPeriods.map((pp) => (
                  <option key={pp._id} value={pp._id}>
                    {`${toDateStr(pp.startDate)} → ${toDateStr(pp.endDate)}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Export */}
            <Button
              onClick={exportToExcel}
              className="bg-accent text-white shadow-button py-2"
              disabled={timesheetEntries.length === 0}
            >
              Export Excel
            </Button>
          </div>
          <div className="flex gap-2 items-center">
            {/* Bulk selection controls */}
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center overflow-hidden rounded-xl border border-gray-200 bg-white">
                <Button
                  onClick={toggleSelectPage}
                  className={`px-3 py-2 text-sm font-medium ${allOnPageSelected
                      ? "border-gray-200 bg-gray-50 text-gray-400"
                      : "border-red-200 bg-red-700 text-red-700"
                    }`}
                >
                  <span className="inline-flex items-center gap-2">
                    {allOnPageSelected ? (
                      <CheckSquare size={16} />
                    ) : (
                      <Square size={16} />
                    )}
                    {allOnPageSelected ? "Unselect All" : "Select All"}
                  </span>
                </Button>

                {/* Divider */}
                <div className="h-8 w-px self-center bg-gray-200" />

                {/* Selected counter pill */}
                <div className="px-3 py-2 text-sm text-gray-600">
                  <span className="inline-flex items-center gap-2">
                    Selected
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
                      {selectedIds.length}
                    </span>
                  </span>
                </div>
              </div>

              <Button
                onClick={deleteSelected}
                disabled={selectedIds.length === 0}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition
                ${selectedIds.length === 0
                    ? "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed"
                    : "border-red-200 bg-red-700 text-red-700"
                  }`}
              // title={
              //   selectedIds.length
              //     ? `Delete ${selectedIds.length} selected`
              //     : "No rows selected"
              // }
              >
                <Trash2 size={16} />
                Delete Selected
              </Button>

              <Button
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2"
                disabled={!selectedPayPeriodId || loading}
              // title={
              //   selectedPayPeriodId
              //     ? "Create a timesheet for an employee"
              //     : "Select a pay period first"
              // }
              >
                <Plus size={16} />
                New Timesheet Entry
              </Button>
            </div>
          </div>
        </div>
      </div>
      {/* Search */}
      <div className="flex w-full items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or position…"
          className="rounded-xl w-full border bg-white px-3 py-2"
        />
        {search && (
          <Button className="px-3 py-2 text-sm" onClick={() => setSearch("")}>
            Clear
          </Button>
        )}
      </div>

      {/* top-right (under controls on small screens) */}
      <div className="mb-2 text-right text-sm text-secondary">
        {startStr && endStr ? (
          <span>
            Start: <strong>{startStr}</strong> • Pay Day ={" "}
            <strong>{payDay}</strong>
          </span>
        ) : (
          <span>Select a pay period</span>
        )}
      </div>

      {/* legend */}
      <div className="flex justify-between">
        <div className="mb-4 text-xs text-secondary">
          Legend: <strong>P</strong> Present, <strong>A</strong> Absent,{" "}
          <strong>E</strong> Early out, <strong>S</strong> Sick,{" "}
          <strong>V</strong> Vacation, <strong>-</strong> unset •
          <span className="ml-1">Click a row to edit, press Esc to exit.</span>
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden lg:block">
        <div className="w-full xl:max-w-none xl:overflow-visible overflow-x-auto">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <DataTable
              columns={columns as any}
              data={filteredEntries as any} // <-- was timesheetEntries
              title="Timesheet"
              onAddClick={undefined as any}
              onRowClick={(row: any) => {
                const rowKey = getRowKey(row, selectedPayPeriodId);
                setEditingRowKey((curr) => (curr === rowKey ? null : rowKey));
              }}
              total={payPeriodTotal}
              totalCash={payPeriodTotalCash}
              totalPayroll={payPeriodTotalPayroll}
            />
          </motion.div>
        </div>
      </div>

      {/* Mobile/Tablet cards */}
      <div className="block lg:hidden">
        <div className="grid grid-cols-1 gap-4">
          {filteredEntries.map((row) => {
            const rk = getRowKey(row, selectedPayPeriodId);
            const editing = editingRowKey === rk;
            return (
              <div
                key={rk}
                className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isSelected(String(row._id))}
                      onChange={() => toggleSelect(String(row._id))}
                    />
                    <div>
                      <div className="text-sm text-gray-500">Employee</div>
                      <div className="text-base font-semibold">
                        {row.employeeName}
                      </div>
                      <div className="text-xs text-gray-500">
                        ID: {String(row.employeeId).slice(-6)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200  px-2 py-1 text-xs "
                      onClick={() =>
                        setEditingRowKey((curr) => (curr === rk ? null : rk))
                      }
                    >
                      {editing ? (
                        <>
                          <Check size={14} /> Done
                        </>
                      ) : (
                        <>
                          <PencilLine size={14} /> Edit
                        </>
                      )}
                    </Button>
                    <Button
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-500"
                      onClick={() =>
                        row?._id
                          ? deleteTimesheetEntry(row._id)
                          : toast.error("Missing entry id")
                      }
                    >
                      <Trash2 size={14} /> Delete
                    </Button>
                  </div>
                </div>

                {/* Days grid */}
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {payPeriodDays.map((d) => {
                    const rawDate = String(d.date);
                    const iso = rawDate.split("T")[0];
                    const key = resolvePayrollDataKey(
                      row,
                      iso,
                      d.dayName,
                      rawDate,
                    );
                    const attendance = row.payrollData?.[key] || {};
                    const compact = `${attendance.am || ""}/${attendance.mid || ""}/${attendance.pm || ""}/${attendance.lt || ""}`;

                    if (!editing) {
                      return (
                        <div
                          key={iso}
                          className="rounded-xl border border-gray-200 p-2"
                        >
                          <div className="text-[11px] text-gray-500">
                            {iso} • {d.dayName}
                          </div>
                          <div className="mt-1 text-sm font-medium">
                            {compact || "-"}
                          </div>
                        </div>
                      );
                    }

                    const values: Record<ShiftField, ShiftValue> = {
                      am: (attendance.am as ShiftValue) || "",
                      mid: (attendance.mid as ShiftValue) || "",
                      pm: (attendance.pm as ShiftValue) || "",
                      lt: (attendance.lt as ShiftValue) || "",
                    };

                    return (
                      <div
                        key={iso}
                        className="rounded-xl border border-primary/30 bg-primary/5 p-2"
                      >
                        <div className="text-[11px] text-gray-600">
                          {iso} • {d.dayName}
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          {SHIFT_FIELDS.map((slot) => {
                            const cellBusy =
                              pending[
                              `${row.employeeId || (row as any).employeeId}|${key}|${slot}`
                              ] === true;
                            return (
                              <label
                                key={slot}
                                className="flex items-center gap-2 text-xs"
                              >
                                <span className="w-6 text-[10px] uppercase text-gray-500">
                                  {slot}
                                </span>
                                <select
                                  className={`flex-1 rounded-md border px-2 py-1 text-xs ${cellBusy
                                      ? "opacity-50 pointer-events-none"
                                      : ""
                                    }`}
                                  value={values[slot]}
                                  onChange={(e) =>
                                    updateShift(
                                      row,
                                      iso,
                                      d.dayName,
                                      rawDate,
                                      slot,
                                      e.target.value as ShiftValue,
                                    )
                                  }
                                >
                                  {SHIFT_VALUES.map((v) => (
                                    <option key={v} value={v}>
                                      {v === "" ? "-" : v}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Totals */}
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-gray-700">
                  <div>
                    <span className="text-gray-500">Total Days:</span>{" "}
                    <strong>{row.totalDays}</strong>
                  </div>
                  <div>
                    <span className="text-gray-500">Pay Rate:</span>{" "}
                    <strong>{"$" + row.payRate}</strong>
                  </div>
                  <div>
                    <span className="text-gray-500">Cash:</span>{" "}
                    <strong>{"$" + row.cash?.toFixed(2)}</strong>
                  </div>
                  <div>
                    <span className="text-gray-500">Payroll:</span>{" "}
                    <strong>{"$" + row.payroll?.toFixed(2)}</strong>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-500">Total:</span>{" "}
                    <strong>{"$" + row.total?.toFixed(2)}</strong>
                  </div>
                </div>

                {editing ? (
                  <div className="mt-2">
                    <div className="text-xs font-medium text-gray-700 mb-1">
                      Notes
                    </div>
                    <NotesEditor
                      key={String(row._id)}
                      entryId={String(row._id)}
                      initialText={row.notes ?? ""}
                      isEditing={true}
                      serverUrl={serverUrl}
                      onSaved={onNotesSaved}
                    />
                  </div>
                ) : (
                  row.notes && (
                    <div className="mt-2 rounded-lg bg-gray-50 p-2 text-xs text-gray-600">
                      <span className="font-medium text-gray-700">Notes:</span>{" "}
                      {row.notes}
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Timesheet Entry"
      >
        <div className="space-y-4">
          <div className="text-sm text-secondary">
            Pay Period:{" "}
            <strong>{toDateStr(payPeriodDetails?.startDate)}</strong>
            {" → "}
            <strong>{toDateStr(payPeriodDetails?.endDate)}</strong>
          </div>

          <label className="block text-sm font-medium">Select Employee</label>
          <div>
            <select
              className="w-full rounded-xl border p-2"
              value={selectedEmployeeIdForCreate}
              onChange={(e) => setSelectedEmployeeIdForCreate(e.target.value)}
              disabled={createLoading}
            >
              <option value="">-- choose an employee --</option>
              {createOptions.map((emp) => (
                <option key={emp._id} value={emp._id}>
                  {emp.employeeName}
                </option>
              ))}
            </select>
            {createLoading && (
              <div className="mt-2 text-xs text-gray-500">
                Loading employees…
              </div>
            )}
            {!createLoading && createOptions.length === 0 && (
              <div className="mt-2 text-xs text-gray-500">
                All employees already have a timesheet for this pay period.
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              // variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={createLoading}
            >
              Cancel
            </Button>
            <Button
              className="bg-primary text-white"
              onClick={createTimesheetForSelected}
              disabled={!selectedEmployeeIdForCreate || createLoading}
            >
              {createLoading ? "Creating…" : "Create"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
