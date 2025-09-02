import { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, User, ChevronRight, LogOut } from "lucide-react";
import { useAuth } from "../../context/AuthContext"; // adjust path if needed

const Header = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading, isAuthenticated, logout } = useAuth();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close popover on outside click / ESC
  useEffect(() => {
    const handleClick = (e:any) => {
      //@ts-ignore
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    const handleEsc = (e:any) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, []);

  const routeNames:any = {
    "/employee": "Employee Management",
    "/timesheet": "Timesheet",
    "/audit-trail": "Audit Trail",
    "/create-pay-period": "Create Pay Period",
    "/users":"User Management"
  };
  
  
  const currentRoute = routeNames[location.pathname] || "";

  const displayName = user?.name || user?.email || "User";
  const role = user?.role || "—";

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      navigate("/", { replace: true });
    }
  };

  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-between p-4 bg-white shadow-md relative"
    >
      {/* Breadcrumbs & Page Title */}
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold text-primary">{currentRoute}</h1>
        <div className="flex items-center gap-1 text-gray-500">
          <ChevronRight />
          <span className="capitalize">{role}</span>
        </div>
      </div>

      {/* Right side: Notifications + Profile */}
      <div className="flex items-center gap-4">
        {/* Notifications (optional) */}
        <div className="relative">
          <Bell className="text-gray-600 cursor-pointer" />
        </div>

        {/* Profile / Auth */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-gray-100 transition"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <User className="text-gray-600" />
            <span className="text-md font-medium text-gray-700 max-w-[160px] truncate">
              {loading ? "Loading..." : displayName}
            </span>
          </button>

          {/* Popover Menu */}
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                key="menu"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.12 }}
                className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-lg p-2 z-50"
                role="menu"
              >
                {isAuthenticated ? (
                  <>
                    <div className="px-3 py-2">
                      <p className="text-sm text-gray-500">Signed in as</p>
                      <p className="text-sm font-medium text-gray-800 truncate">{displayName}</p>
                      <span className="mt-1 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                        {role}
                      </span>
                    </div>
                    <div className="my-2 h-px bg-gray-100" />
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 text-left text-sm text-gray-800"
                      role="menuitem"
                    >
                      <LogOut size={16} />
                      Logout
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => navigate("/login")}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 text-left text-sm text-gray-800"
                    role="menuitem"
                  >
                    <User size={16} />
                    Login
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.header>
  );
};

export default Header;

