import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import { Loader, Plus, Search, Eye, EyeOff } from "lucide-react";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import DataTable from "../components/ui/DataTable";
import { useAuth } from "../context/AuthContext";

type Role = "Admin" | "Manager";
type UserDTO = {
  _id?: string;
  name: string;
  email: string;
  role: Role;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

const serverUrl = import.meta.env.VITE_SERVER_URL;

/** Utility to read arrays from different backend list shapes */
function normalizeUsersPayload(payload: any): UserDTO[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.users)) return payload.users;
  const merged: UserDTO[] = [];
  if (Array.isArray(payload.admins)) merged.push(...payload.admins);
  if (Array.isArray(payload.managers)) merged.push(...payload.managers);
  return merged;
}

const UserManagement: React.FC = () => {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<UserDTO[]>([]);
  const [filtered, setFiltered] = useState<UserDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [isModalOpen, setModalOpen] = useState(false);
  const [editData, setEditData] = useState<UserDTO | null>(null);
  const [sortField, setSortField] = useState<keyof UserDTO>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // const isSelected = (id: string) => selectedIds.includes(id);
  // const toggleSelect = (id: string) =>
  //   setSelectedIds((prev) =>
  //     prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
  //   );

  const {
    register,
    handleSubmit,
    setValue,
    reset,
clearErrors,
    formState: { errors },
  } = useForm();

  // 👁️ password visibility state
  const [showPassword, setShowPassword] = useState(false);

  // ---------- Fetch Users (tries a few common endpoints) ----------
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const opts: RequestInit = { credentials: "include" as const };
      let res = await fetch(`${serverUrl}/users?role=all`, opts);
      if (!res.ok) {
        // fallbacks
        const [adminsRes, managersRes] = await Promise.allSettled([
          fetch(`${serverUrl}/users/admins`, opts),
          fetch(`${serverUrl}/users/managers`, opts),
        ]);
        const arrays: UserDTO[] = [];
        if (adminsRes.status === "fulfilled" && adminsRes.value.ok) {
          arrays.push(...normalizeUsersPayload(await adminsRes.value.json()));
        }
        if (managersRes.status === "fulfilled" && managersRes.value.ok) {
          arrays.push(...normalizeUsersPayload(await managersRes.value.json()));
        }
        if (arrays.length === 0) throw new Error("Could not fetch users");
        const sorted = arrays.sort((a, b) =>
          String(a.name ?? "").localeCompare(String(b.name ?? "")),
        );
        setUsers(sorted);
        setFiltered(sorted);
      } else {
        const json = await res.json();
        const list = normalizeUsersPayload(json);
        const sorted = list.sort((a, b) =>
          String(a.name ?? "").localeCompare(String(b.name ?? "")),
        );
        setUsers(sorted);
        setFiltered(sorted);
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to fetch users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // ---------- Search ----------
  useEffect(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      setFiltered(users);
      return;
    }
    setFiltered(
      users.filter(
        (u) =>
          (u.name || "").toLowerCase().includes(q) ||
          (u.email || "").toLowerCase().includes(q) ||
          (u.role || "").toLowerCase().includes(q),
      ),
    );
  }, [search, users]);

  // ---------- Sort ----------
  const sortedData = useMemo(() => {
    const list = [...filtered];
    if (!sortField) return list;
    return list.sort((a, b) => {
      const av = (a as any)[sortField] ?? "";
      const bv = (b as any)[sortField] ?? "";
      if (typeof av === "string" && typeof bv === "string") {
        return sortDirection === "asc"
          ? av.toLowerCase().localeCompare(bv.toLowerCase())
          : bv.toLowerCase().localeCompare(av.toLowerCase());
      }
      return sortDirection === "asc" ? (av > bv ? 1 : -1) : av < bv ? 1 : -1;
    });
  }, [filtered, sortField, sortDirection]);

  // ---------- Open Modal ----------
  const openModal = (u?: UserDTO) => {
    clearErrors();
    setModalOpen(true);
    setShowPassword(false); // reset visibility each open
    if (u) {
      setEditData(u);
      setValue("name", u.name);
      setValue("email", u.email);
      setValue("role", u.role);
      setValue("isActive", !!u.isActive);
      setValue("password", "");
    } else {
      setEditData(null);
      reset({ role: "Manager", isActive: true, password: "" });
    }
  };

  // ---------- Create / Update ----------
  const onSubmit = async (data: any) => {
    const payload = {
      name: String(data.name || "").trim(),
      email: String(data.email || "")
        .trim()
        .toLowerCase(),
      role: data.role as Role,
      isActive: !!data.isActive,
      ...(data.password ? { password: String(data.password) } : {}),
    };

    try {
      let res: Response;
      if (editData?._id) {
        // UPDATE
        const id = editData._id;
        const path = `${serverUrl}/users/${id}`;
        res = await fetch(path, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });
      } else {
        // CREATE
        if (payload.role === "Admin") {
          res = await fetch(`${serverUrl}/users/admin`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(payload),
          });
        } else {
          res = await fetch(`${serverUrl}/users/managers`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(payload),
          });
        }
      }

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          body?.message?.includes("exists") || res.status === 409
            ? "Email already exists."
            : body?.message || "Request failed";
        throw new Error(msg);
      }

      toast.success(editData ? "User updated" : "User created");
      setModalOpen(false);
      await fetchUsers();

      if (editData?._id && me && me._id === editData._id) {
        // optional refresh of session/user
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Request failed");
    }
  };

  // ---------- Delete ----------
  const deleteUser = async (u: UserDTO) => {
    if (!u._id) return;
    if (!confirm(`Delete ${u.name} (${u.role})?`)) return;
    try {
      const path = `${serverUrl}/users/${u._id}`;
      const res = await fetch(path, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message || "Delete failed");
      toast.success("User deleted");
      await fetchUsers();
      setSelectedIds((prev) => prev.filter((id) => id !== u._id));
    } catch (e: any) {
      toast.error(e?.message || "Delete failed");
    }
  };

  // ---------- Columns ----------
  const columns = useMemo(
    () => [
      { header: "Name", accessor: "name" },
      { header: "Email", accessor: "email" },
      { header: "Role", accessor: "role" },
      {
        header: "Active",
        cell: (row: any) => (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${row.isActive
                ? "bg-green-100 text-green-700"
                : "bg-gray-100 text-gray-600"
              }`}
          >
            {row.isActive ? "Yes" : "No"}
          </span>
        ),
      },
      {
        header: "Actions",
        cell: (row: any) => (
          <div className="flex gap-2">
            <Button
              onClick={(e: any) => {
                e.stopPropagation();
                deleteUser(row);
              }}
              className="bg-red flex items-center gap-1 text-white"
            >
              Delete
            </Button>
          </div>
        ),
      },
    ],
    [selectedIds],
  );

  return (
    <div className="p-8 bg-background min-h-screen">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">User Management</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => openModal()}
            className="bg-primary text-white px-4 py-2 rounded-lg flex items-center gap-2"
          >
            <Plus size={18} /> Add User
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <input
            type="text"
            placeholder="Search by name, email, or role..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full p-2 pl-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <Search size={20} className="absolute left-3 top-2.5 text-gray-400" />
        </div>
      </div>

      {/* Sort */}
      <div className="mb-4 flex items-center gap-2">
        <label
          htmlFor="sortField"
          className="font-medium text-sm text-gray-700"
        >
          Sort by
        </label>
        <select
          id="sortField"
          value={sortField}
          onChange={(e) => setSortField(e.target.value as keyof UserDTO)}
          className="appearance-none p-2 pr-9 border border-gray-200 rounded-xl text-sm text-gray-800 bg-white
                     shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40"
        >
          <option value="name">Name</option>
          <option value="email">Email</option>
          <option value="role">Role</option>
        </select>

        <Button
          onClick={() =>
            setSortDirection((d) => (d === "asc" ? "desc" : "asc"))
          }
          className="ml-2 inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium"
        >
          {sortDirection === "asc" ? "ASC ↑" : "DESC ↓"}
        </Button>
      </div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="relative"
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 z-50">
            <Loader className="animate-spin text-primary" size={42} />
          </div>
        )}
        <DataTable
          columns={columns}
          data={sortedData}
          title="Users"
          onRowClick={(row: any) => openModal(row)}
        />
      </motion.div>

      {/* Add / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setModalOpen(false)}
        title={editData ? "Edit User" : "Add New User"}
      >
        <form
          className="w-full grid grid-cols-2 gap-5 max-h-[70vh] overflow-auto"
          onSubmit={handleSubmit(onSubmit)}
        >
          {/* Name */}
          <div className="relative">
            <label className="block font-medium mb-1">Name*</label>
            <input
              type="text"
              placeholder="Full name"
              {...register("name", {
                required: "Name is required",
                maxLength: { value: 100, message: "Max 100 chars" },
              })}
              className={`w-full p-2 border rounded-xl ${errors.name ? "border-red-500" : "border-gray-300"
                }`}
            />
            {errors.name && (
              <p className="text-red-500 text-sm mt-1 absolute">
                {String(errors.name.message)}
              </p>
            )}
          </div>

          {/* Email */}
          <div className="relative">
            <label className="block font-medium mb-1">Email*</label>
            <input
              type="email"
              placeholder="email@example.com"
              {...register("email", {
                required: "Email is required",
                pattern: { value: /^\S+@\S+\.\S+$/, message: "Invalid email" },
              })}
              className={`w-full p-2 border rounded-xl ${errors.email ? "border-red-500" : "border-gray-300"
                }`}
            />
            {errors.email && (
              <p className="text-red-500 text-sm mt-1 absolute">
                {String(errors.email.message)}
              </p>
            )}
          </div>

          {/* Role */}
          <div className="relative">
            <label className="block font-medium mb-1">Role*</label>
            <select
              {...register("role", {
                required: "Role is required",
                validate: (v) =>
                  v === "Admin" || v === "Manager" ? true : "Invalid role",
              })}
              className={`w-full p-2 border rounded-xl ${errors.role ? "border-red-500" : "border-gray-300"
                }`}
              defaultValue="Manager"
            >
              <option value="Admin">Admin</option>
              <option value="Manager">Manager</option>
            </select>
            {errors.role && (
              <p className="text-red-500 text-sm mt-1 absolute">
                {String(errors.role.message)}
              </p>
            )}
          </div>

          {/* Active */}
          <div className="relative">
            <label className="block font-medium mb-1">Active</label>
            <input
              type="checkbox"
              {...register("isActive")}
              className="w-fit p-2 border rounded-xl"
            />
          </div>

          {/* Password */}
          <div className="relative col-span-2">
            <label className="block font-medium mb-1">
              {editData ? "New Password (optional)" : "Password*"}
            </label>
            <input
              type={showPassword ? "text" : "password"}
              placeholder={
                editData
                  ? "Leave blank to keep current password"
                  : "Set a strong password"
              }
              {...register("password", {
                required: editData ? false : "Password is required",
                validate: (val) => {
                  if (!val) return true; // allow blank on edit
                  return val.length >= 6 || "Min 6 characters";
                },
              })}
              className={`w-full p-2 pr-12 border rounded-xl ${errors.password ? "border-red-500" : "border-gray-300"
                }`}
            />
            {/* Eye toggle */}
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-3 top-9 p-1 text-gray-500 hover:text-gray-700"
              aria-label={showPassword ? "Hide password" : "Show password"}
              title={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>

            {errors.password && (
              <p className="text-red-500 text-sm mt-1 absolute">
                {String(errors.password.message)}
              </p>
            )}
          </div>

          <Button
            type="submit"
            className="mx-auto col-span-full px-24 bg-accent w-fit"
          >
            {editData ? "Update User" : "Add User"}
          </Button>
        </form>
      </Modal>
    </div>
  );
};

export default UserManagement;
