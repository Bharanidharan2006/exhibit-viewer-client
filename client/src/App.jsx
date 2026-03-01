import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext.jsx";

// Customer pages
import CustomerLogin from "./pages/customer/Login.jsx";
import CustomerRegister from "./pages/customer/Register.jsx";
import Exhibitions from "./pages/customer/Exhibitions.jsx";
import Viewer from "./pages/customer/Viewer.jsx";
import Checkout from "./pages/Checkout.jsx";

// Business pages
import BusinessLogin from "./pages/business/Login.jsx";
import BusinessRegister from "./pages/business/Register.jsx";
import Dashboard from "./pages/business/Dashboard.jsx";
import CreateExhibition from "./pages/business/CreateExhibition.jsx";

// Route guards
function RequireAuth({ children, role }) {
  const { user, ready } = useAuth();
  if (!ready) return null;
  if (!user)
    return (
      <Navigate
        to={role === "business" ? "/business/login" : "/login"}
        replace
      />
    );
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Navigate to="/exhibitions" replace />} />
      <Route path="/login" element={<CustomerLogin />} />
      <Route path="/register" element={<CustomerRegister />} />
      <Route path="/business/login" element={<BusinessLogin />} />
      <Route path="/business/register" element={<BusinessRegister />} />

      {/* Customer */}
      <Route path="/exhibitions" element={<Exhibitions />} />
      <Route
        path="/exhibition/:id"
        element={
          <RequireAuth role="customer">
            <Viewer />
          </RequireAuth>
        }
      />
      <Route
        path="/checkout"
        element={
          <RequireAuth role="customer">
            <Checkout />
          </RequireAuth>
        }
      />

      {/* Business */}
      <Route
        path="/business/dashboard"
        element={
          <RequireAuth role="business">
            <Dashboard />
          </RequireAuth>
        }
      />
      <Route
        path="/business/create"
        element={
          <RequireAuth role="business">
            <CreateExhibition />
          </RequireAuth>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
