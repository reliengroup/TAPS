import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { motion } from "framer-motion";
import { Users, Menu, X, Timer, TimerIcon, Book, User } from "lucide-react";
import Header from "./Header";
import payrollLogo from "../../assets/payrollLogo.jpeg";
import { useAuth } from "../../context/AuthContext";

const Sidebar = () => {
  const [isOpen, setIsOpen] = useState(true);
  const { user } = useAuth();

  // Toggle Sidebar
  const toggleSidebar = () => {
    setIsOpen(!isOpen);
  };

  // Static Links (No validation)
  const links = [
    { path: "/employee", name: "Employee Management", icon: <Users /> },
    { path: "/timesheet", name: "Timesheet", icon: <Timer /> },
    {
      path: "/create-pay-period",
      name: "Create Pay Period",
      icon: <TimerIcon />,
    },
    { path: "/audit-trail", name: "Audit Trail", icon: <Book /> },
      ];
    if(user?.role === "Admin")
      links.push({path:"/users",name:"User Management", icon:<User />})


  return (
    <div className="flex">
      {/* Sidebar */}
      <motion.div
        animate={{ width: isOpen ? "250px" : "80px" }}
        className="h-screen bg-white shadow-card p-5 pt-8 relative transition-all duration-300"
      >
        {/* Toggle Button */}
        <button
          onClick={toggleSidebar}
          className="absolute -right-3 bottom-9 bg-primary text-white p-2 rounded-full shadow-button"
        >
          {isOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        {/* Logo or Brand */}
        <div className="flex items-center gap-4 mb-10">
          <div className=" text-white p-2 rounded-md">
            <img src={payrollLogo} width={45} />
          </div>
          {isOpen && (
            <div>
              {" "}
              <h1 className="text-xl font-bold text-primary">
               TAPS 
              </h1>
            </div>
          )}
        </div>

        {/* Navigation Links */}
        <nav className="flex flex-col gap-4">
          {links.map((link, index) => (
            <NavLink
              key={index}
              to={link.path}
              className={({ isActive }) =>
                `flex items-center gap-3 p-2 rounded-md transition-colors ${isActive
                  ? "bg-primary text-white"
                  : "text-gray-500 hover:bg-gray-100"
                }`
              }
            >
              <div className="text-lg">{link.icon}</div>
              {isOpen && (
                <span className="text-md font-medium">{link.name}</span>
              )}
            </NavLink>
          ))}
        </nav>
      </motion.div>

      {/* Page Content */}
      <main className="flex-1 flex flex-col bg-background overflow-auto">
        <Header />
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Sidebar;
