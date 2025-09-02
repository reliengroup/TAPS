import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

type Props = {
  children: React.ReactNode;
  redirectTo?: string;
  loadingFallback?: React.ReactNode;
};

const RequireAdminAuth: React.FC<Props> = ({
  children,
  redirectTo = "/",
  loadingFallback = <div className="p-8">Loading...</div>,
}) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <>{loadingFallback}</>;
  if (!user) return <Navigate to={redirectTo} replace state={{ from: location }} />;
  if (user.role !== "Admin") return <Navigate to="/forbidden" replace />;

  return children;
};

export default RequireAdminAuth;
