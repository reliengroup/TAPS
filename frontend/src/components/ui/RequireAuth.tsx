import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import type { Role } from "../../types/auth";

type Props = {
  children: React.ReactNode;
  roles?: Role[]; // optional role restriction
  redirectTo?: string;
  loadingFallback?: React.ReactNode;
};

export const RequireAuth: React.FC<Props> = ({
  children,
  roles,
  redirectTo = "/",
  loadingFallback = <div>Loading...</div>,
}) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <>{loadingFallback}</>;

  if (!user) {
    return <Navigate to={redirectTo} replace state={{ from: location }} />;
  }

  if (roles && !roles.includes(user.role)) {
    // optional: send to 403 or home
    return <Navigate to="/forbidden" replace />;
  }

  return children;
};
