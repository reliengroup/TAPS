import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import payrollLogo from "../assets/payrollLogo.jpeg";

const Login = () => {
  const { login, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>("");
  const navigate = useNavigate();
  const location = useLocation() as any;
  const from = location.state?.from?.pathname || "/employee";

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setError("");
    try {
      await login(email, password); // sets httpOnly cookie + user in context
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err?.message || "Invalid email or password");
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-background">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white px-8 pt-8 shadow-card flex flex-col items-center rounded-xl w-96"
      >
        <img src={payrollLogo} width={70} alt="" />
        <div className="mb-6">
          <h2 className="text-3xl text-center mt-2 font-semibold  text-primary">
            Login
          </h2>

        </div>
        {error && (
          <p className="text-red-500 mb-4" role="alert">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-3 border rounded-xl focus:outline-primary"
            required
            disabled={loading}
          />
          <input
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-3 border rounded-xl focus:outline-primary"
            required
            disabled={loading}
          />

          <motion.button
            type="submit"
            whileTap={{ scale: 0.98 }}
            className="w-full bg-primary mb-4 text-white p-3 rounded-xl shadow-button hover:bg-opacity-90 transition disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "Signing in..." : "Login"}
          </motion.button>
        </form>

          <p className="text-end w-full -mr-14">V0.1</p>
      </motion.div>

    </div>
  );
};

export default Login;
