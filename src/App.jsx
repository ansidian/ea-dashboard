import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { checkAuth } from "./api";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";

export default function App() {
  const [authenticated, setAuthenticated] = useState(null); // null = loading

  useEffect(() => {
    checkAuth()
      .then((res) => setAuthenticated(res.authenticated))
      .catch(() => setAuthenticated(false));
  }, []);

  if (authenticated === null) {
    return (
      <div className="page-center">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={
          authenticated ? <Navigate to="/" /> : <Login onLogin={() => setAuthenticated(true)} />
        } />
        <Route path="/" element={
          authenticated ? <Dashboard /> : <Navigate to="/login" />
        } />
        <Route path="/settings" element={
          authenticated ? <Settings /> : <Navigate to="/login" />
        } />
      </Routes>
    </BrowserRouter>
  );
}
