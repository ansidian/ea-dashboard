import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
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

  useEffect(() => {
    const onMove = (e) => {
      document.body.style.setProperty("--mouse-x", e.clientX + "px");
      document.body.style.setProperty("--mouse-y", e.clientY + "px");
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  if (authenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-white/10 border-t-accent-light rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <TooltipProvider>
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
    </TooltipProvider>
  );
}
