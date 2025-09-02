import React, { useState, useEffect, useRef, useMemo } from "react";
import DataTable from "../components/ui/DataTable";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { motion } from "framer-motion";
import {
  Loader,
  Plus,
  Search,
  Trash2,
  CheckSquare,
  Square,
  Download,
} from "lucide-react";
import Modal from "../components/ui/Modal";
import { useForm } from "react-hook-form";
import Button from "../components/ui/Button";
// ⬇️ add writeFile
import { read, utils, writeFile } from "xlsx";

const serverUrl = import.meta.env.VITE_SERVER_URL;

const EmployeeManagement = () => {
  const [employeeData, setEmployeeData] = useState<any[]>([]);
  const [filteredData, setFilteredData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setModalOpen] = useState(false);
  const [editData, setEditData] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  const [sortField, setSortField] = useState("employeeName");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [aids, setAids] = useState<any>();

  // NEW: selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;

  const sortedData = useMemo(() => {
    const list = [...filteredData];
    if (!sortField) return list;

    return list.sort((a, b) => {
      const aValue = a?.[sortField] ?? "";
      const bValue = b?.[sortField] ?? "";

      if (!isNaN(aValue as any) && !isNaN(bValue as any)) {
        return sortDirection === "asc"
          ? Number(aValue) - Number(bValue)
          : Number(bValue) - Number(aValue);
      }
      const aStr = String(aValue).toLowerCase();
      const bStr = String(bValue).toLowerCase();
      return sortDirection === "asc"
        ? aStr.localeCompare(bStr)
        : bStr.localeCompare(aStr);
    });
  }, [filteredData, sortField, sortDirection]);

  const currentEmployees = sortedData.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);

  // ---- Selection helpers ----
  const isSelected = (id: string) => selectedIds.includes(id);
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  const allOnPageSelected =
    currentEmployees.length > 0 &&
    currentEmployees.every((r) => selectedIds.includes(r._id));
  const toggleSelectPage = () => {
    if (allOnPageSelected) {
      // unselect all on page
      setSelectedIds((prev) =>
        prev.filter((id) => !currentEmployees.some((r) => r._id === id)),
      );
    } else {
      // add all on page
      const ids = currentEmployees.map((r) => r._id);
      setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
    }
  };
  const clearSelection = () => setSelectedIds([]);

  async function deleteEmployee(id: string) {
    try {
      await fetch(`${serverUrl}/employee/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      await fetchEmployeeData();
      setSelectedIds((prev) => prev.filter((x) => x !== id));
      toast.success("Employee deleted");
    } catch (error: any) {
      toast.error(error.message || "Error deleting employee");
    }
  }

  // NEW: bulk delete
  async function deleteSelected() {
    if (selectedIds.length === 0) return;
    if (
      !confirm(
        `Delete ${selectedIds.length} employee(s)? This cannot be undone.`,
      )
    )
      return;

    try {
      setLoading(true);
      const res = await fetch(`${serverUrl}/employee/bulk-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Bulk delete failed");

      toast.success(
        `Deleted ${json.deletedCount ?? selectedIds.length} employee(s)`,
      );
      clearSelection();
      await fetchEmployeeData();
    } catch (e: any) {
      toast.error(e?.message || "Bulk delete failed");
    } finally {
      setLoading(false);
    }
  }

  // Table Columns — aligned with form fields
  const columns = useMemo(
    () => [
      // NEW: selection checkbox column
      {
        header: "",
        cell: (row: any) => (
          <input
            type="checkbox"
            checked={isSelected(row._id)}
            onChange={(e) => {
              e.stopPropagation();
              toggleSelect(row._id);
            }}
            onClick={(e) => {
              e.stopPropagation();
            }}
          />
        ),
      },
      { header: "Employee Name", accessor: "employeeName" },
      { header: "Position", accessor: "position" },
      {
        header: "Aide",
        accessor: "aid.employeeName",
        cell: (row: any) => row.aid?.employeeName || "-",
      }, // if you populate
      {
        header: "AM Rate",
        accessor: "amRate",
        cell: (row: any) => `$${row.amRate}`,
      },
      {
        header: "MID Rate",
        accessor: "midRate",
        cell: (row: any) => `$${row.midRate}`,
      },
      {
        header: "PM Rate",
        accessor: "pmRate",
        cell: (row: any) => `$${row.pmRate}`,
      },
      {
        header: "LT Rate",
        accessor: "ltRate",
        cell: (row: any) => `$${row.ltRate}`,
      },
      { header: "Cash Split %", accessor: "cashSplitPercent" },
      {
        header: "Status",
        accessor: "isActive",
        cell: (row: any) => (
          <span
            className={`p-2 rounded-xl ${row.isActive ? "text-green-700 bg-green-100" : " text-red-600 bg-red-100"}`}
          >
            {row.isActive ? "Active" : "Not-Active"}
          </span>
        ),
      },
      {
        header: "Actions",
        cell: (row: any) => (
          <Button
            onClick={(e: any) => {
              e.stopPropagation();
              deleteEmployee(row._id);
            }}
            className="bg-red"
          >
            Delete
          </Button>
        ),
      },
    ],
    [selectedIds, currentEmployees],
  );

  useEffect(() => {
    setCurrentPage(1);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const filtered = employeeData.filter((emp) => {
        return (
          (emp.employeeName ?? "").toLowerCase().includes(q) ||
          (emp.position ?? "").toLowerCase().includes(q)
        );
      });
      setFilteredData(filtered);
    } else {
      setFilteredData(employeeData);
    }
  }, [searchQuery, employeeData]);

  useEffect(() => {
    fetchEmployeeData();
  }, []);

  const PaginationControls = () => (
    <div className="flex justify-between items-center mt-4">
      <div className="text-sm text-gray-600">
        Showing {Math.min(indexOfFirstItem + 1, filteredData.length)} -{" "}
        {Math.min(indexOfLastItem, filteredData.length)} of{" "}
        {filteredData.length}
      </div>
      <div className="flex gap-2 items-center">
        <Button
          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          disabled={currentPage === 1}
          className="px-4 py-2"
        >
          Previous
        </Button>

        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
          <Button
            key={page}
            onClick={() => setCurrentPage(page)}
            className={`px-4 py-2 ${page === currentPage ? "bg-primary text-white" : ""
              }`}
          >
            {page}
          </Button>
        ))}

        <Button
          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          disabled={currentPage === totalPages}
          className="px-4 py-2"
        >
          Next
        </Button>
      </div>
    </div>
  );

  const fetchEmployeeData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${serverUrl}/employee`, {
        cache: "no-store",
        credentials: "include",
      });
      const { employees } = await res.json();
      const sorted = (employees ?? []).sort((a: any, b: any) =>
        String(a.employeeName ?? "").localeCompare(
          String(b.employeeName ?? ""),
        ),
      );

      setEmployeeData(sorted);
      setFilteredData(sorted);
      // keep selection only for still-existing rows
      setSelectedIds((prev) =>
        prev.filter((id) => sorted.some((e: any) => e._id === id)),
      );
    } catch (error) {
      console.error("Failed to fetch employee data:", error);
      toast.error("Failed to fetch employee data");
    }
    setLoading(false);
  };

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
    watch,
  } = useForm();

  const position = watch("position");

  const fetchAids = async (employee: any = null) => {
    try {
      const aidRes = await fetch(
        `${serverUrl}/employee/aids/${employee?.aidId ??
        employee?.aid?._id ??
        employee?.aid ?? // if backend already stores raw id
        "0"
        }/employee/${employee?._id || 0}`,
        {
          credentials: "include",
          cache: "no-store",
        },
      );
      const { aids } = await aidRes.json();
      setAids(aids);
    } catch (error) {
      console.log(error);
    }
  };

  useEffect(() => {
    if (editData && position === "Driver") {
      fetchAids(editData);
    }
  }, [position]);

  const openModal = async (employee: any = null) => {
    try {
      setEditData(employee);

      if (employee) {
        Object.keys(employee).forEach((key) => {
          setValue(key, employee[key]);
        });
        // 👇 support common server shapes
        setValue(
          "aidId",
          employee.aidId ??
          employee.aid?._id ??
          employee.aid ?? // if backend already stores raw id
          "",
        );
        console.log({ employee });
        if (employee.position === "Driver") {
          await fetchAids(employee);
        }
        //        const empRes = await fetch(`${serverUrl}/employee/by-id/${employee.aidId ??
        //          employee.aid?._id ??
        //          employee.aid ?? // if backend already stores raw id
        //          ""
        // }`, {
        //        credentials: "include",
        //        cache: "no-store",
        //      });
        //        const {employee:emp}  = await empRes.json();
        //        setAids((prev:any) => [...prev,emp])
      } else {
        reset();
        await fetchAids();
      }

      setModalOpen(true);
    } catch (error: any) {
      toast.error(error.mesage);
    }
  };

  const onSubmit = async (data: any) => {
    const payload = {
      ...data,
      amRate: Number(data.amRate),
      midRate: Number(data.midRate),
      pmRate: Number(data.pmRate),
      ltRate: Number(data.ltRate),
      cashSplitPercent: Number(data.cashSplitPercent),
      // 👇 include aidId only for Driver
      aid: data.position === "Driver" ? data.aidId || null : null,
    };

    try {
      if (
        payload.amRate < 0 ||
        payload.midRate < 0 ||
        payload.pmRate < 0 ||
        payload.ltRate < 0
      ) {
        throw new Error("Rates cannot be negative");
      }
      if (
        isNaN(payload.cashSplitPercent) ||
        payload.cashSplitPercent < 0 ||
        payload.cashSplitPercent > 100
      ) {
        throw new Error("Cash split % must be between 0 and 100");
      }

      let res: Response;
      if (editData) {
        const id =
          editData?.id ??
          editData?._id ??
          editData?.empId ??
          editData?.employeeId;
        res = await fetch(`${serverUrl}/employee/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "include",
        });
      } else {
        res = await fetch(`${serverUrl}/employee/add`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",

          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // Friendly duplicate-name message
        const msg =
          body?.message?.includes("duplicate key") || res.status === 409
            ? "Employee name must be unique."
            : body?.message || "Request failed";
        throw new Error(msg);
      }

      if (editData) toast.success("Employee updated successfully");
      else toast.success("Employee added successfully");

      await fetchEmployeeData();
      setModalOpen(false);
    } catch (error: any) {
      console.error(error);
      toast.error(error.message ?? "Something went wrong");
    }
  };

  const triggerFilePicker = () => fileInputRef.current?.click();

  // ===== NEW: Download Import Template =====
  const downloadImportTemplate = () => {
    try {
      // Define headers in the exact shape your importer expects
      const headers = [
        "Employee Name",
        "Position",
        "Aide",
        "AM Rate",
        "MID Rate",
        "PM Rate",
        "LT Rate",
        "Cash Split %",
      ];

      // Optional example rows (safe defaults)
      const examples = [
        {
          "Employee Name": "John Doe",
          Position: "Driver",
          Aide: "Ayaan",
          "AM Rate": 100,
          "MID Rate": 0,
          "PM Rate": 50,
          "LT Rate": 0,
          "Cash Split %": 20,
        },
        {
          "Employee Name": "Ayaan",
          Position: "Aide",
          Aide: "",
          "AM Rate": 120,
          "MID Rate": 0,
          "PM Rate": 60,
          "LT Rate": 0,
          "Cash Split %": 30,
        },
      ];

      const ws = utils.json_to_sheet(examples, { header: headers });
      // Optional: add a note row at top
      // utils.sheet_add_aoa(ws, [["NOTE: 'Employee Name' must be unique. Cash split % must be 0–100."]], { origin: "A1" });

      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, "Employees");

      writeFile(wb, "employee_bulk_import_template.xlsx");
      toast.success("Template downloaded");
    } catch (e: any) {
      toast.error(e?.message || "Could not generate template");
    }
  };

  const normalizeRow = (row: Record<string, any>) => {
    const get = (...keys: string[]) => {
      for (const k of keys) {
        if (row[k] !== undefined && row[k] !== null) return row[k];
      }
      return undefined;
    };

    const data = {
      employeeName: get("Employee Name", "employeeName", "name"),
      position: get("Position", "position", "role", "title"),
      amRate: Number(get("AM Rate", "amRate", "am")),
      midRate: Number(get("MID Rate", "midRate", "mid")),
      pmRate: Number(get("PM Rate", "pmRate", "pm")),
      ltRate: Number(get("LT Rate", "ltRate", "lt")),
      cashSplitPercent: Number(
        get("Cash Split %", "cashSplitPercent", "cashSplit"),
      ),
      aid: get("Aide", "aid", "aide"),
    };

    return data;
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setLoading(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = read(buf, { type: "array" });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      if (!ws) throw new Error("No worksheet found in this file");

      const raw = utils.sheet_to_json(ws, { defval: "" }) as Record<
        string,
        any
      >[];
      if (!raw.length) throw new Error("The sheet appears to be empty");

      const employees = raw.map(normalizeRow);

      const res = await fetch(`${serverUrl}/employee/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employees }),
        credentials: "include",
      });

      const result = await res.json();

      if (!res.ok && res.status !== 207) {
        throw new Error(result?.message || "Bulk import failed");
      }

      const inserted = result?.insertedCount ?? 0;
      const failed = result?.failedCount ?? 0;
      if (failed > 0) {
        toast.warn(
          `Imported ${inserted} employee(s). ${failed} failed. Check your data.`,
        );
        if (Array.isArray(result?.failed)) console.table(result.failed);
      } else {
        toast.success(`Imported ${inserted} employee(s) successfully`);
      }

      await fetchEmployeeData();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Could not import file");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 bg-background min-h-screen">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Employee Management</h1>

        <div className="flex items-center gap-2">
          {/* NEW: Download template */}
          <Button
            onClick={downloadImportTemplate}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-3 text-sm"
          >
            <Download size={16} />
            Download import template
          </Button>

          {/* Existing: Bulk import */}
          <Button
            onClick={triggerFilePicker}
            className="bg-secondary text-white"
          >
            Bulk Import (Excel)
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleImportFile}
          />

          {/* Add Employee */}
          <button
            onClick={() => openModal()}
            className="bg-primary text-white px-4 py-2 rounded-lg flex items-center gap-2"
          >
            <Plus size={18} /> Add Employee
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <input
            type="text"
            placeholder="Search by employee name or position..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full p-2 pl-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <Search size={20} className="absolute left-3 top-2.5 text-gray-400" />
        </div>
      </div>

      {/* Sort + Bulk actions */}
      <div className="mb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Left: Sort */}
          <div className="flex items-center gap-2">
            <label
              htmlFor="sortField"
              className="font-medium text-sm text-gray-700"
            >
              Sort by
            </label>
            <div className="relative">
              <select
                id="sortField"
                value={sortField}
                onChange={(e) => setSortField(e.target.value)}
                className="appearance-none p-2 pr-9 border border-gray-200 rounded-xl text-sm text-gray-800 bg-white
                           shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40"
              >
                {columns
                  .filter((c: any) => c.accessor) // skip checkbox & actions columns
                  .map((c: any) => (
                    <option key={c.accessor} value={c.accessor}>
                      {c.header}
                    </option>
                  ))}
              </select>
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
                ▾
              </span>
            </div>

            {/* Direction toggle */}
            <Button
              onClick={() =>
                setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))
              }
              className={`ml-2 inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition
                ${sortDirection === "asc"
                  ? "border-blue-200 bg-blue-50 text-blue-700 "
                  : "border-violet-200 bg-violet-50 text-violet-700 "
                }`}
            >
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-white/70 border border-white/60 shadow">
                {sortDirection === "asc" ? "↑" : "↓"}
              </span>
              <span className="hidden sm:inline">
                {sortDirection === "asc" ? "Ascending" : "Descending"}
              </span>
              <span className="sm:hidden">
                {sortDirection === "asc" ? "ASC" : "DESC"}
              </span>
            </Button>
          </div>

          {/* Right: Select & Delete */}
          <div className="flex items-center gap-3">
            {/* Select page segmented control */}
            <div className="inline-flex items-center overflow-hidden rounded-xl border border-gray-200 bg-white">
              <Button
                onClick={toggleSelectPage}
                className={`px-3 py-2 text-sm font-medium ${allOnPageSelected
                    ? "border-gray-200 bg-gray-50 text-gray-400"
                    : "border-red-200 bg-red-700 text-red-700 "
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

            {/* Delete selected (destructive) */}
            <Button
              onClick={deleteSelected}
              disabled={selectedIds.length === 0}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition
                ${selectedIds.length === 0
                  ? "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed"
                  : "border-red-200 bg-red-700 text-red-700 "
                }`}
            >
              <Trash2 size={16} />
              Delete Selected
            </Button>
          </div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="relative"
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 z-50">
            <Loader className="animate-spin text-primary" size={50} />
          </div>
        )}

        <DataTable
          columns={columns}
          data={currentEmployees}
          title="Employee List"
          onRowClick={openModal}
        />

        <PaginationControls />
      </motion.div>

      {/* Add / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setModalOpen(false)}
        title={editData ? "Edit Employee" : "Add New Employee"}
      >
        <form
          className="w-full grid grid-cols-2 justify-start overflow-scroll max-h-[70vh] gap-5"
          onSubmit={handleSubmit(onSubmit)}
        >
          {/* Employee Name */}
          <div className="relative">
            <label htmlFor="employeeName" className="block font-medium mb-1">
              Employee Name*
            </label>
            <input
              id="employeeName"
              type="text"
              placeholder="Employee Name"
              {...register("employeeName", {
                required: "Employee Name is required",
                maxLength: {
                  value: 255,
                  message: "Maximum 255 characters allowed",
                },
              })}
              className={`w-full p-2 border rounded-xl ${errors.employeeName ? "border-red-500" : "border-gray-300"}`}
            />
            {errors.employeeName && (
              <p className="text-red-500 text-sm mt-1 absolute">
                {String(errors.employeeName.message)}
              </p>
            )}
          </div>

          {/* Position (select) */}
          <div className="relative">
            <label htmlFor="position" className="block font-medium mb-1">
              Position*
            </label>
            <select
              id="position"
              {...register("position", {
                required: "Position is required",
                validate: (v) =>
                  v === "Driver" ||
                  v === "Aide" ||
                  "Position must be Driver or Aide",
              })}
              className={`w-full p-2 border rounded-xl ${errors.position ? "border-red-500" : "border-gray-300"}`}
            >
              <option value="">Select position</option>
              <option value="Driver">Driver</option>
              <option value="Aide">Aide</option>
            </select>
            {errors.position && (
              <p className="text-red-500 text-sm mt-1 absolute">
                {String(errors.position.message)}
              </p>
            )}
          </div>

          {/* Conditional: Select Aid (only when Driver) */}
          {position === "Driver" && (
            <div className="relative col-span-2">
              <label htmlFor="aidId" className="block font-medium mb-1">
                Select Aide
              </label>
              <select
                id="aidId"
                {...register("aidId")}
                className="w-full p-2 border rounded-xl border-gray-300"
                defaultValue=""
              >
                <option value="">-- Choose an Aide --</option>
                {Array.isArray(aids) &&
                  aids.map((aid: any) => (
                    <option key={aid._id} value={aid._id}>
                      {aid.employeeName || aid.name || aid._id}
                    </option>
                  ))}
              </select>
            </div>
          )}

          {/* AM rate */}
          <div className="relative">
            <label htmlFor="amRate" className="block font-medium mb-1">
              AM rate
            </label>
            <input
              id="amRate"
              type="number"
              step="0.01"
              min={0}
              {...register("amRate", {
                min: { value: 0, message: "Minimum value is 0" },
                valueAsNumber: true,
              })}
              className={`w-full p-2 border rounded-xl ${errors.amRate ? "border-red-500" : "border-gray-300"}`}
            />
            {errors.amRate && (
              <p className="text-red-500 text-sm mt-1 absolute">
                {String(errors.amRate.message)}
              </p>
            )}
          </div>

          {/* MID rate */}
          <div className="relative">
            <label htmlFor="midRate" className="block font-medium mb-1">
              MID rate
            </label>
            <input
              id="midRate"
              type="number"
              step="0.01"
              min={0}
              {...register("midRate", {
                min: { value: 0, message: "Minimum value is 0" },
                valueAsNumber: true,
              })}
              className={`w-full p-2 border rounded-xl ${errors.midRate ? "border-red-500" : "border-gray-300"}`}
            />
            {errors.midRate && (
              <p className="text-red-500 text-sm mt-1 absolute">
                {String(errors.midRate.message)}
              </p>
            )}
          </div>

          {/* PM rate */}
          <div className="relative">
            <label htmlFor="pmRate" className="block font-medium mb-1">
              PM rate
            </label>
            <input
              id="pmRate"
              type="number"
              step="0.01"
              min={0}
              {...register("pmRate", {
                min: { value: 0, message: "Minimum value is 0" },
                valueAsNumber: true,
              })}
              className={`w-full p-2 border rounded-xl ${errors.pmRate ? "border-red-500" : "border-gray-300"}`}
            />
            {errors.pmRate && (
              <p className="text-red-500 text-sm mt-1 absolute">
                {String(errors.pmRate.message)}
              </p>
            )}
          </div>

          {/* LT rate */}
          <div className="relative">
            <label htmlFor="ltRate" className="block font-medium mb-1">
              LT rate
            </label>
            <input
              id="ltRate"
              type="number"
              step="0.01"
              min={0}
              {...register("ltRate", {
                min: { value: 0, message: "Minimum value is 0" },
                valueAsNumber: true,
              })}
              className={`w-full p-2 border rounded-xl ${errors.ltRate ? "border-red-500" : "border-gray-300"}`}
            />
            {errors.ltRate && (
              <p className="text-red-500 text-sm mt-1 absolute">
                {String(errors.ltRate.message)}
              </p>
            )}
          </div>

          {/* Cash split % */}
          <div className="relative">
            <label
              htmlFor="cashSplitPercent"
              className="block font-medium mb-1"
            >
              Cash split %*
            </label>
            <input
              id="cashSplitPercent"
              type="number"
              step="0.01"
              min={0}
              max={100}
              {...register("cashSplitPercent", {
                required: "Cash split % is required",
                min: { value: 0, message: "Minimum value is 0" },
                max: { value: 100, message: "Maximum value is 100" },
                valueAsNumber: true,
              })}
              className={`w-full p-2 border rounded-xl ${errors.cashSplitPercent ? "border-red-500" : "border-gray-300"}`}
            />
            {errors.cashSplitPercent && (
              <p className="text-red-500 text-sm mt-1 absolute">
                {String(errors.cashSplitPercent.message)}
              </p>
            )}
          </div>

          {/* Is Active */}
          <div className="relative">
            <label htmlFor="isActive" className="block font-medium mb-1">
              Active
            </label>
            <input
              id="isActive"
              type="checkbox"
              {...register("isActive")}
              className="w-fit p-2 border rounded-xl"
            />
          </div>

          <Button
            type="submit"
            className="mx-auto col-span-full px-24 bg-accent w-fit"
          >
            {editData ? "Update Employee" : "Add Employee"}
          </Button>
        </form>
      </Modal>
    </div>
  );
};

export default EmployeeManagement;
