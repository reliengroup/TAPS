import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Sidebar from "./components/ui/Sidebar";
import { Bounce, ToastContainer } from "react-toastify";
import EmployeeManagement from "./pages/EmployeeManagement";
import PayrollTimesheet from "./pages/PayrollTimesheet";
import CreatePayPeriod from "./pages/CreatePayPeriod";
import AuditTrail from "./pages/AuditTrail";
import Login from "./pages/Login";
import { AuthProvider } from "./context/AuthContext";
import { RequireAuth } from "./components/ui/RequireAuth";
import RequireAdminAuth from "./components/ui/RequireAdminAuth";
import UserManagement from "./pages/UserManagement";

const App = () => {
  return (
    <>
      <AuthProvider>
        <ToastContainer
          position="bottom-right"
          autoClose={1000}
          hideProgressBar={false}
          newestOnTop={false}
          closeOnClick={false}
          rtl={false}
          draggable
          pauseOnHover
          theme="light"
          transition={Bounce}
        />
        <Router>
          <Routes>
            <Route path="/" element={<Login />} />

            <Route path="/*" element={<Sidebar />}>
              {/* Admin Routes */}
              <Route path="employee" element={<RequireAuth><EmployeeManagement /></RequireAuth>} />
              <Route path="timesheet" element={<RequireAuth><PayrollTimesheet /> </RequireAuth>} />
              <Route path="create-pay-period" element={<RequireAuth><CreatePayPeriod /></RequireAuth>} />
              <Route path="audit-trail" element={<RequireAuth><AuditTrail /></RequireAuth>} />
              <Route path="users" element={<RequireAdminAuth > <UserManagement /> </RequireAdminAuth >} />
            </Route>
          </Routes>
        </Router>
      </AuthProvider>
    </>
  );
};

export default App;
