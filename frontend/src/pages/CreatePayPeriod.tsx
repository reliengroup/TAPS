import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Loader, Check, X } from "lucide-react";
import Button from "../components/ui/Button";
import DataTable from "../components/ui/DataTable";
import Modal from "../components/ui/Modal";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const serverUrl = import.meta.env.VITE_SERVER_URL;

// --- UTC-only helpers ---
const toISODate = (d: Date) => d.toISOString().slice(0, 10);

/** Return a Date pinned to UTC midnight for the given local Date */
const toUtcMidnight = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** Monday of the week for the given date (UTC-based) */
function mondayOfWeekUTC(from: Date) {
  const base = toUtcMidnight(from);
  const day = base.getUTCDay(); // 0..6 (Mon=1)
  const diff = (day + 6) % 7; // Mon -> 0, Tue -> 1, ... Sun -> 6
  base.setUTCDate(base.getUTCDate() - diff);
  return base; // UTC midnight Monday
}

/** Add N days in UTC */
function addDaysUTC(d: Date, n: number) {
  const copy = new Date(d.getTime());
  copy.setUTCDate(copy.getUTCDate() + n);
  return copy;
}

/** Validate "YYYY-MM-DD" is a Monday in UTC */
function isMondayISO(iso: string) {
  const d = new Date(iso);
  const utc = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  return !isNaN(+utc) && utc.getUTCDay() === 1;
}

// format helper
const dstr = (x?: string | Date) =>
  x ? new Date(x).toLocaleDateString() : "";

type PayPeriod = {
  _id: string;
  startDate: string;
  endDate: string;
  payDay?: string;
  createdAt?: string;
  updatedAt?: string;
};

export default function CreatePayPeriod() {
  // Default to current week's Monday in ISO
  const [startDate, setStartDate] = useState<string>(() => {
    const todayUTC = toUtcMidnight(new Date());
    return toISODate(mondayOfWeekUTC(todayUTC));
  });
  const [loading, setLoading] = useState(false);

  // auto-create switch state
  const [autoCreate, setAutoCreate] = useState<boolean>(false);
  const [savingAuto, setSavingAuto] = useState<boolean>(false);

  // Pay Day modal state
  const [payDayModalOpen, setPayDayModalOpen] = useState(false);
  const [payDayValue, setPayDayValue] = useState<string>(""); // yyyy-mm-dd
  const [payDayTargetId, setPayDayTargetId] = useState<string | null>(null); // null => create flow, id => edit row flow
  const [payDayMinDate, setPayDayMinDate] = useState<string>(""); // for client-side constraint

  // table data (all periods)
  const [periods, setPeriods] = useState<PayPeriod[]>([]);

  // fetch current auto-create flag
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${serverUrl}/pay-period/auto-creation`, {
          credentials: "include",
        });
        const j = await r.json();
        setAutoCreate(Boolean(j?.enabled));
      } catch {
        /* ignore */
      }
    })();
  }, []);

  // initial fetch of periods
  useEffect(() => {
    refreshPeriods();
  }, []);

  const refreshPeriods = async () => {
    try {
      setLoading(true);
      const r = await fetch(`${serverUrl}/pay-period/`, { cache: "no-store", credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch pay periods");
      const j = await r.json();
      const list: PayPeriod[] = j?.payPeriods ?? [];
      // sort newest first by startDate
      list.sort(
        (a, b) =>
          new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
      );
      setPeriods(list);
    } catch (e: any) {
      toast.error(e?.message || "Error loading pay periods");
    } finally {
      setLoading(false);
    }
  };

  const mondayWarning = useMemo(
    () =>
      startDate && !isMondayISO(startDate)
        ? "Selected date is not a Monday (UTC)."
        : "",
    [startDate],
  );

  const resetToThisMonday = () => {
    const todayUTC = toUtcMidnight(new Date());
    setStartDate(toISODate(mondayOfWeekUTC(todayUTC)));
  };

  const setNextMonday = () => {
    const todayUTC = toUtcMidnight(new Date());
    const thisMon = mondayOfWeekUTC(todayUTC);
    const nextMon = addDaysUTC(thisMon, 7);
    setStartDate(toISODate(nextMon));
  };

  // Create flow: instead of creating immediately, open modal to pick payDay
  const onSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    if (!startDate) {
      toast.error("Please select a start date.");
      return;
    }
    if (!isMondayISO(startDate)) {
      toast.error("Start date must be a Monday (UTC).");
      return;
    }

    // compute endDate (Mon + 11 days)
    const start = new Date(startDate + "T00:00:00.000Z");
    const end = addDaysUTC(start, 11); // backend uses 11 offset
    const endISO = toISODate(end);

    // set modal defaults and show it (create mode => payDayTargetId=null)
    setPayDayTargetId(null);
    setPayDayMinDate(endISO);
    // if no payDay chosen yet, default to end date (valid minimum)
    setPayDayValue((v) => v || endISO);
    setPayDayModalOpen(true);
  };

  // Create pay period then set payDay using the modal value
  const createWithPayDay = async () => {
    if (!startDate) return;

    // Validate payDay >= computed endDate before hitting backend
    const start = new Date(startDate + "T00:00:00.000Z");
    const end = addDaysUTC(start, 11);
    const endTime = end.getTime();
    const chosen = new Date(payDayValue);
    if (isNaN(chosen.getTime()) || chosen.getTime() < endTime) {
      toast.error("Pay day cannot be before pay period end date.");
      return;
    }

    setLoading(true);
    try {
      // 1) Create the pay period
      const res = await fetch(`${serverUrl}/pay-period/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate }),
        credentials: "include",
      });
      if (!res.ok) {
        let message = "Failed to create pay period";
        try {
          const data = await res.json();
          message = data?.message || message;
        } catch {}
        throw new Error(message);
      }

      // 2) Find the created period id (by startDate)
      await refreshPeriods();
      const created = periods.find((p) => toISODate(new Date(p.startDate)) === startDate);
      const targetId = created?._id;
      if (!targetId) {
        // try re-fetch again (periods state updates async)
        const r = await fetch(`${serverUrl}/pay-period/?q=all`, { cache: "no-store", credentials: "include" });
        const j = await r.json();
        const list: PayPeriod[] = j?.payPeriods ?? [];
        const found = list.find((p) => toISODate(new Date(p.startDate)) === startDate);
        if (!found?._id) {
          toast.warn("Pay period created, but couldn't immediately locate it to set pay day.");
          setPayDayModalOpen(false);
          return;
        }
        // 3) Set pay day
        await setPayDay(found._id, payDayValue, false);
      } else {
        // 3) Set pay day
        await setPayDay(targetId, payDayValue, false);
      }

      toast.success("Pay period created and pay day set.");
      setPayDayModalOpen(false);

      // optional ensure roll-forward
      await fetch(`${serverUrl}/pay-period/ensure`, {
        method: "POST",
        credentials: "include",
      }).catch(() => {});
    } catch (err: any) {
      toast.error(err?.message || "Something went wrong while creating pay period.");
    } finally {
      setLoading(false);
      // refresh list again to reflect latest payDay
      await refreshPeriods();
    }
  };

  // Update pay day for existing period
  const setPayDay = async (payPeriodId: string, payDay: string, closeModal = true) => {
    if (!payDay) {
      toast.error("Please select a pay day.");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(`${serverUrl}/pay-period/change-pay-day/${payPeriodId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payDay }),
        credentials: "include",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.message || "Failed to update pay day");
      toast.success("Pay day updated.");
      if (closeModal) setPayDayModalOpen(false);
      await refreshPeriods();
    } catch (e: any) {
      toast.error(e?.message || "Error updating pay day");
    } finally {
      setLoading(false);
    }
  };

  // auto-create toggle
  const toggleAutoCreate = async () => {
    try {
      setSavingAuto(true);
      const next = !autoCreate;
      const r = await fetch(`${serverUrl}/pay-period/auto-creation`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
        credentials: "include",
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.message || "Failed to update auto-creation setting");
      }
      setAutoCreate(next);
      toast.success(`Auto create ${next ? "enabled" : "disabled"}.`);
      if (next) {
        await fetch(`${serverUrl}/pay-period/ensure`, {
          method: "POST",
          credentials: "include",
        }).catch(() => {});
      }
    } catch (e: any) {
      toast.error(e?.message || "Could not update setting");
    } finally {
      setSavingAuto(false);
    }
  };

  // DataTable columns for pay periods
  const columns = useMemo(
    () => [
      { header: "Start Date", accessor: "startDate" },
      { header: "End Date", accessor: "endDate" },
      { header: "Pay Day", accessor: "payDay" },
      {
        header: "Status",
        accessor: "",
        cell: (row: PayPeriod) =>
          row.payDay
            ? <span className="text-green-600">Pay Day Set</span>
            : <span className="text-orange-600">No Pay Day</span>
      },
    ],
    []
  );

  // Pretty-print rows for DataTable without changing underlying state
  const tableRows = useMemo(
    () =>
      periods.map((p) => ({
        ...p,
        startDate: dstr(p.startDate),
        endDate: dstr(p.endDate),
        payDay: p.payDay ? dstr(p.payDay) : "",
      })),
    [periods]
  );

  // When a row is clicked -> open modal for updating payDay
  const onRowClick = (row: any) => {
    const original = periods.find((p) => p._id === row._id) || null;
    if (!original) return;

    // payDay must be >= endDate
    const minISO = toISODate(new Date(original.endDate));
    setPayDayMinDate(minISO);
    // default to existing payDay or minISO
    setPayDayValue(original.payDay ? toISODate(new Date(original.payDay)) : minISO);
    setPayDayTargetId(original._id);
    setPayDayModalOpen(true);
  };

  const computedEndStr = (() => {
    if (!startDate || !isMondayISO(startDate)) return "";
    const end = addDaysUTC(new Date(startDate + "T00:00:00.000Z"), 11);
    return dstr(end);
  })();

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative rounded-xl bg-card p-6 shadow-card"
      >
        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 z-50 flex items-center justify-center rounded-xl bg-white/75">
            <Loader className="animate-spin text-primary" size={50} />
          </div>
        )}

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="mb-1 text-2xl font-semibold">Create Pay Period</h2>
            <p className="text-sm text-secondary">
              Select the pay period start date. It must be a <strong>Monday</strong> (UTC).
              The backend will create 10 workdays (Mon–Fri × 2 weeks) and initialize timesheets for all employees.
            </p>
          </div>

          {/* Auto-create switch */}
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-800">
                Auto-create next period
              </div>
              <div className="text-xs text-gray-500">
                Create the next pay period automatically when the current one ends
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
                  ${autoCreate ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"}`}
              >
                {autoCreate ? "On" : "Off"}
              </span>

              <button
                type="button"
                onClick={toggleAutoCreate}
                disabled={savingAuto}
                role="switch"
                aria-checked={autoCreate}
                aria-label="Toggle automatic creation of next pay period"
                className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer items-center rounded-full border transition
                  ${autoCreate ? "bg-green-600 border-green-600" : "bg-gray-300 border-gray-300"}
                  ${savingAuto ? "opacity-60 cursor-not-allowed" : "hover:brightness-105"}
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2`}
                title="Toggle automatic creation of next pay period"
              >
                <span className="pointer-events-none absolute inset-0 flex items-center justify-between px-1">
                  <X className="h-3.5 w-3.5 text-white/70" />
                  <Check className="h-3.5 w-3.5 text-white/90" />
                </span>
                <span
                  className={`absolute left-0.5 top-0.5 grid h-6 w-6 place-items-center rounded-full bg-white shadow transition-transform
                    ${autoCreate ? "translate-x-7" : "translate-x-0"}`}
                >
                  {autoCreate ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <X className="h-4 w-4 text-gray-400" />
                  )}
                </span>
              </button>
            </div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-1">
            <label htmlFor="startDate" className="mb-1 block font-medium">
              Start Date (Monday)*
            </label>
            <input
              id="startDate"
              type="date"
              className="w-full rounded-xl border p-2"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            {mondayWarning && (
              <p className="mt-1 text-xs text-red-600">{mondayWarning}</p>
            )}
            {/* Show computed end date for context */}
            {startDate && !mondayWarning && (
              <p className="mt-2 text-xs text-gray-600">
                Computed End Date: <strong>{computedEndStr}</strong>
              </p>
            )}
          </div>

          <div className="sm:col-span-1 flex items-end gap-3">
            <Button type="button" onClick={setNextMonday} disabled={loading}>
              Use Next Monday
            </Button>
          </div>

          <div className="sm:col-span-2 flex gap-3">
            {/* IMPORTANT: this submits to open the Pay Day modal (not immediate create) */}
            <Button
              type="submit"
              className="bg-primary px-6 text-white"
              disabled={loading || !startDate}
            >
              Create Pay Period
            </Button>
            <Button type="button" onClick={resetToThisMonday} disabled={loading}>
              Reset to This Monday
            </Button>
          </div>
        </form>
      </motion.div>

      {/* --- NEW: All Pay Periods Section --- */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl bg-card p-6 shadow-card"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-semibold">All Pay Periods</h3>
          <span className="text-sm text-secondary">
            Click a row to set/update Pay Day
          </span>
        </div>

        <DataTable
          columns={columns as any}
          data={tableRows as any}
          title="Pay Periods"
          onRowClick={(row: any) => onRowClick(row)}
          // no Add button because we don’t pass onAddClick
        />
      </motion.div>

      {/* --- Pay Day Modal (shared for create + edit) --- */}
      <Modal
        isOpen={payDayModalOpen}
        onClose={() => setPayDayModalOpen(false)}
        title="Select Pay Day"
      >
        <div className="space-y-4">
          <label htmlFor="payday" className="block font-medium">
            Pay Day (must be on/after period's end date)
          </label>
          <input
            id="payday"
            type="date"
            className="w-full rounded-xl border p-2"
            value={payDayValue}
            min={payDayMinDate || undefined}
            onChange={(e) => setPayDayValue(e.target.value)}
          />

          <div className="mt-4 flex justify-end gap-3">
            <Button
              type="button"
              onClick={() => setPayDayModalOpen(false)}
            >
              Cancel
            </Button>

            {payDayTargetId ? (
              // Editing an existing period's pay day
              <Button
                type="button"
                className="bg-primary text-white"
                onClick={() => setPayDay(payDayTargetId, payDayValue)}
              >
                Update Pay Day
              </Button>
            ) : (
              // Creating a new period then setting pay day
              <Button
                type="button"
                className="bg-primary text-white"
                onClick={createWithPayDay}
              >
                Create & Set Pay Day
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}

