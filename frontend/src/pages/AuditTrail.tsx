import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Loader } from "lucide-react";
import DataTable from "../components/ui/DataTable";
import Button from "../components/ui/Button";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const serverUrl = import.meta.env.VITE_SERVER_URL;

type Operation = "create" | "update" | "delete";

type TimesheetAuditItem = {
  _id: string;
  targetType: "TimesheetEntry";
  targetId: string;
  operation: Operation;
  employeeDetails?: { name?: string; id?: string };
  changeDetails?: {
    fieldName?: "am" | "mid" | "pm" | "lt";
    fieldValue?: "A" | "P" | "E" | "S" | "V" | "";
  };
  payPeriod?: string | null;
  timesheetEntryDetails?: { totalDays?: number; total?: number };
  userName?: string;
  createdAt: string;
};

type EmployeeChange = { field: string; before?: any; after?: any };

type EmployeeAuditItem = {
  _id: string;
  targetType: "Employee";
  targetId: string;
  operation: Operation;
  employeeDetails?: { name?: string; id?: string };
  employeeChangeSet?: EmployeeChange[];
  userName?: string;
  createdAt: string;
};

type Paged<T> = {
  page: number;
  limit: number;
  sort: "asc" | "desc";
  total: number;
  totalPages: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
  data: T[];
};

type PayPeriodLite = { _id: string; startDate: string; endDate: string };

const toDateTime = (iso: string) => (iso ? new Date(iso).toLocaleString() : "");
const toDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString() : "");

const Badge = ({ children, className = "" }: { children: any; className?: string }) => (
  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${className}`}>
    {children}
  </span>
);

export default function AuditTrail() {
  const [loading, setLoading] = useState(false);

  // Tabs
  type Tab = "Timesheet" | "Employee";
  const [tab, setTab] = useState<Tab>("Timesheet");

  // Pay Periods (for timesheet tab)
  const [payPeriods, setPayPeriods] = useState<PayPeriodLite[]>([]);
  const [selectedPayPeriodId, setSelectedPayPeriodId] = useState<string>("");

  // Timesheet pagination/sort
  const [tsPage, setTsPage] = useState(1);
  const [tsLimit, setTsLimit] = useState(20);
  const [tsSort, setTsSort] = useState<"asc" | "desc">("desc");
  const [tsRows, setTsRows] = useState<TimesheetAuditItem[]>([]);
  const [tsTotalPages, setTsTotalPages] = useState(1);
  const [tsTotal, setTsTotal] = useState(0);

  // Employee pagination/sort
  const [empPage, setEmpPage] = useState(1);
  const [empLimit, setEmpLimit] = useState(20);
  const [empSort, setEmpSort] = useState<"asc" | "desc">("desc");
  const [empRows, setEmpRows] = useState<EmployeeAuditItem[]>([]);
  const [empTotalPages, setEmpTotalPages] = useState(1);
  const [empTotal, setEmpTotal] = useState(0);

  // expanded (employee change sets)
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const payPeriodLabel = useCallback(
    (id?: string | null) => {
      if (!id) return "";
      const pp = payPeriods.find(p => p._id === id);
      return pp ? `${toDate(pp.startDate)} → ${toDate(pp.endDate)}` : id!;
    },
    [payPeriods]
  );

  // Load pay periods once
  const fetchPayPeriods = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${serverUrl}/pay-period/`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch pay periods");
      const data = await res.json();
      const periods: PayPeriodLite[] = (data?.payPeriods ?? []).sort(
        (a:any, b:any) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
      );
      setPayPeriods(periods);
    } catch (e: any) {
      toast.error(e?.message || "Error fetching pay periods");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch timesheet audit
  const fetchTimesheetAudit = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("page", String(tsPage));
      params.set("limit", String(tsLimit));
      params.set("sort", tsSort);
      if (selectedPayPeriodId) params.set("payPeriod", selectedPayPeriodId);

      const res = await fetch(`${serverUrl}/audit-trail/timesheet?` + params.toString(), {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch timesheet audit");
      const data: Paged<TimesheetAuditItem> = await res.json();
      setTsRows(data.data || []);
      setTsTotalPages(data.totalPages || 1);
      setTsTotal(data.total || 0);
    } catch (e: any) {
      toast.error(e?.message || "Error fetching timesheet audit");
    } finally {
      setLoading(false);
    }
  }, [tsPage, tsLimit, tsSort, selectedPayPeriodId]);

  // Fetch employee audit
  const fetchEmployeeAudit = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("page", String(empPage));
      params.set("limit", String(empLimit));
      params.set("sort", empSort);

      const res = await fetch(`${serverUrl}/audit-trail/employee?` + params.toString(), {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch employee audit");
      const data: Paged<EmployeeAuditItem> = await res.json();
      setEmpRows(data.data || []);
      setEmpTotalPages(data.totalPages || 1);
      setEmpTotal(data.total || 0);
    } catch (e: any) {
      toast.error(e?.message || "Error fetching employee audit");
    } finally {
      setLoading(false);
    }
  }, [empPage, empLimit, empSort]);

  // init
  useEffect(() => {
    fetchPayPeriods();
  }, []);

  // refetch each tab on its own controls change
  useEffect(() => {
    if (tab === "Timesheet") fetchTimesheetAudit();
  }, [tab, fetchTimesheetAudit]);

  useEffect(() => {
    if (tab === "Employee") fetchEmployeeAudit();
  }, [tab, fetchEmployeeAudit]);

  // when timesheet filters change, reset page & fetch
  useEffect(() => {
    setTsPage(1);
  }, [selectedPayPeriodId, tsLimit, tsSort]);

  useEffect(() => {
    if (tab === "Timesheet") fetchTimesheetAudit();
  }, [tsPage, selectedPayPeriodId, tsLimit, tsSort, fetchTimesheetAudit, tab]);

  // when employee controls change, reset page & fetch
  useEffect(() => {
    setEmpPage(1);
  }, [empLimit, empSort]);

  useEffect(() => {
    if (tab === "Employee") fetchEmployeeAudit();
  }, [empPage, empLimit, empSort, fetchEmployeeAudit, tab]);

  // render helpers
  const renderOperationBadge = (op?: Operation) => {
    if (!op) return "";
    const base = "border bg-white";
    if (op === "create") return <Badge className={`${base} border-green-200 text-green-700`}>Create</Badge>;
    if (op === "delete") return <Badge className={`${base} border-red-200 text-red-700`}>Delete</Badge>;
    return <Badge className={`${base} border-blue-200 text-blue-700`}>Update</Badge>;
  };

  // columns: timesheet
  const tsColumns = useMemo(
    () => [
      { header: "When", accessor: "createdAt", cell: (r: TimesheetAuditItem) => toDateTime(r.createdAt) },
      {
        header: "Operation",
        accessor: "operation",
        cell: (r: TimesheetAuditItem) => renderOperationBadge(r.operation),
      },
      {
        header: "Employee",
        accessor: "employeeDetails.name",
        cell: (r: TimesheetAuditItem) =>
          `${r.employeeDetails?.name || ""} (${r.employeeDetails?.id || ""})`,
      },
      { header: "Made by", accessor: "userName" },
      {
        header: "Shift",
        accessor: "changeDetails.fieldName",
        cell: (r: TimesheetAuditItem) => r.changeDetails?.fieldName?.toUpperCase() || "",
      },
      {
        header: "Value",
        accessor: "changeDetails.fieldValue",
        cell: (r: TimesheetAuditItem) => (r.changeDetails?.fieldValue ?? ""),
      },
      {
        header: "Total Days (snap)",
        accessor: "timesheetEntryDetails.totalDays",
        cell: (r: TimesheetAuditItem) => r.timesheetEntryDetails?.totalDays ?? "",
      },
      {
        header: "Total (snap)",
        accessor: "timesheetEntryDetails.total",
        cell: (r: TimesheetAuditItem) =>
          r.timesheetEntryDetails?.total != null ? "$" + Math.round(Number(r.timesheetEntryDetails.total)) : "",
      },
      {
        header: "Pay Period",
        accessor: "payPeriod",
        cell: (r: TimesheetAuditItem) => payPeriodLabel(r.payPeriod),
      },
    ],
    [payPeriodLabel]
  );

  // columns: employee
  const empColumns = useMemo(
    () => [
      { header: "When", accessor: "createdAt", cell: (r: EmployeeAuditItem) => toDateTime(r.createdAt) },
      {
        header: "Operation",
        accessor: "operation",
        cell: (r: EmployeeAuditItem) => renderOperationBadge(r.operation),
      },
      {
        header: "Employee",
        accessor: "employeeDetails.name",
        cell: (r: EmployeeAuditItem) =>
          `${r.employeeDetails?.name || ""} (${r.employeeDetails?.id || ""})`,
      },
      { header: "Made by", accessor: "userName" },
      {
        header: "Changes",
        accessor: "employeeChangeSet",
        cell: (r: EmployeeAuditItem) => {
          if (r.operation === "create") return "Created employee";
          if (r.operation === "delete") return "Deleted employee";
          const count = r.employeeChangeSet?.length || 0;
          return (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-700">
                {count} field{count === 1 ? "" : "s"} changed
              </span>
              {count > 0 && (
                <Button className="px-2 py-1 text-xs" onClick={(e: any) => { e.stopPropagation(); toggleExpanded(r._id); }}>
                  {expanded.has(r._id) ? "Hide" : "View"}
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [expanded]
  );

  const EmpExpandedRows = () => {
    const list = empRows.filter(r => expanded.has(r._id));
    if (!list.length) return null;
    return (
      <div className="mt-4 space-y-3">
        {list.map(r => (
          <div key={`exp-${r._id}`} className="rounded-2xl border border-gray-200 bg-white p-3">
            <div className="mb-2 text-sm font-semibold">
              {r.employeeDetails?.name} ({r.employeeDetails?.id})
            </div>
            {(r.employeeChangeSet?.length ?? 0) > 0 ? (
              <div className="rounded-xl border border-gray-200 bg-white p-2 text-xs">
                <div className="mb-1 text-[11px] uppercase text-gray-500">Changed fields</div>
                <ul className="space-y-1">
                  {r.employeeChangeSet!.map((c, i) => (
                    <li key={i} className="grid grid-cols-3 gap-2">
                      <span className="font-medium break-words">{c.field === "aid" ? "aide" : c.field}</span>
                      <span className="truncate text-gray-600">
                        <span className="text-gray-500">before:</span> {String(c.before ?? "")}
                      </span>
                      <span className="truncate text-gray-600">
                        <span className="text-gray-500">after:</span> {String(c.after ?? "")}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-2 text-xs text-gray-600">
                No field-level changes recorded.
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="p-6 relative">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/75 z-50 rounded-xl">
          <Loader className="animate-spin text-primary" size={50} />
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Audit Trail</h2>

        {/* Tabs */}
        <div className="inline-flex rounded-xl border border-gray-200 overflow-hidden">
          {(["Timesheet", "Employee"] as Tab[]).map(t => (
            <button
              key={t}
              className={`px-4 py-2 text-sm ${
                tab === t ? "bg-primary text-white" : "bg-white text-gray-700"
              }`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Controls per tab */}
      {tab === "Timesheet" ? (
        <div className="mb-4 flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Pay Period:</label>
            <select
              className="border rounded-xl px-3 py-2 bg-white"
              value={selectedPayPeriodId}
              onChange={e => setSelectedPayPeriodId(e.target.value)}
              disabled={loading}
            >
              <option value="">All</option>
              {payPeriods.map(pp => (
                <option key={pp._id} value={pp._id}>
                  {`${toDate(pp.startDate)} → ${toDate(pp.endDate)}`}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Sort:</label>
            <select
              className="border rounded-xl px-3 py-2 bg-white"
              value={tsSort}
              onChange={e => setTsSort(e.target.value as "asc" | "desc")}
              disabled={loading}
            >
              <option value="desc">Latest first</option>
              <option value="asc">Oldest first</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Rows:</label>
            <select
              className="border rounded-xl px-2 py-1"
              value={tsLimit}
              onChange={e => setTsLimit(parseInt(e.target.value, 10))}
            >
              {[10, 20, 50, 100].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <div className="mb-4 flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Sort:</label>
            <select
              className="border rounded-xl px-3 py-2 bg-white"
              value={empSort}
              onChange={e => setEmpSort(e.target.value as "asc" | "desc")}
              disabled={loading}
            >
              <option value="desc">Latest first</option>
              <option value="asc">Oldest first</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Rows:</label>
            <select
              className="border rounded-xl px-2 py-1"
              value={empLimit}
              onChange={e => setEmpLimit(parseInt(e.target.value, 10))}
            >
              {[10, 20, 50, 100].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        {tab === "Timesheet" ? (
          <>
            <DataTable
              columns={tsColumns as any}
              data={tsRows as any}
              title="Timesheet Changes"
              onAddClick={undefined as any}
              onRowClick={undefined as any}
            />
            <div className="flex justify-between items-center mt-4">
              <div className="text-sm text-gray-600">
                Page {tsPage} of {tsTotalPages} • {tsTotal} changes
              </div>
              <div className="flex gap-2 items-center">
                <Button onClick={() => setTsPage(p => Math.max(1, p - 1))} disabled={tsPage <= 1 || loading} className="px-3 py-2">
                  Prev
                </Button>
                {Array.from({ length: Math.min(7, tsTotalPages) }, (_, i) => {
                  const start = Math.max(1, Math.min(tsPage - 3, tsTotalPages - 6));
                  const pageNum = start + i;
                  if (pageNum > tsTotalPages) return null;
                  return (
                    <Button
                      key={pageNum}
                      onClick={() => setTsPage(pageNum)}
                      className={`px-3 py-2 ${pageNum === tsPage ? "bg-primary" : "bg-white !text-black"}`}
                      disabled={loading}
                    >
                      {pageNum}
                    </Button>
                  );
                })}
                <Button onClick={() => setTsPage(p => Math.min(tsTotalPages, p + 1))} disabled={tsPage >= tsTotalPages || loading} className="px-3 py-2">
                  Next
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <DataTable
              columns={empColumns as any}
              data={empRows as any}
              title="Employee Changes"
              onAddClick={undefined as any}
              onRowClick={undefined as any}
            />
            <EmpExpandedRows />
            <div className="flex justify-between items-center mt-4">
              <div className="text-sm text-gray-600">
                Page {empPage} of {empTotalPages} • {empTotal} changes
              </div>
              <div className="flex gap-2 items-center">
                <Button onClick={() => setEmpPage(p => Math.max(1, p - 1))} disabled={empPage <= 1 || loading} className="px-3 py-2">
                  Prev
                </Button>
                {Array.from({ length: Math.min(7, empTotalPages) }, (_, i) => {
                  const start = Math.max(1, Math.min(empPage - 3, empTotalPages - 6));
                  const pageNum = start + i;
                  if (pageNum > empTotalPages) return null;
                  return (
                    <Button
                      key={pageNum}
                      onClick={() => setEmpPage(pageNum)}
                      className={`px-3 py-2 ${pageNum === empPage ? "bg-primary" : "bg-white !text-black"}`}
                      disabled={loading}
                    >
                      {pageNum}
                    </Button>
                  );
                })}
                <Button onClick={() => setEmpPage(p => Math.min(empTotalPages, p + 1))} disabled={empPage >= empTotalPages || loading} className="px-3 py-2">
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}

