import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { checkAuth } from "./api";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import SettingsChrome from "./components/settings/SettingsChrome";
const Settings = lazy(() => import("./pages/Settings"));

function MouseSpotlight() {
  const spotlightRef = useRef(null);

  useEffect(() => {
    const spotlight = spotlightRef.current;
    if (!spotlight || window.matchMedia("(pointer: coarse)").matches) return undefined;

    const radius = 150;
    let rafId = 0;
    let visible = false;
    let latestX = -9999;
    let latestY = -9999;

    function applyPosition() {
      rafId = 0;
      const left = latestX - radius;
      const top = latestY - radius;
      spotlight.style.transform = `translate3d(${left}px, ${top}px, 0)`;
      spotlight.style.backgroundPosition = `${-left}px ${-top}px`;
      spotlight.style.opacity = visible ? "1" : "0";
    }

    function schedule() {
      if (!rafId) rafId = window.requestAnimationFrame(applyPosition);
    }

    function handleMove(event) {
      latestX = event.clientX;
      latestY = event.clientY;
      visible = true;
      schedule();
    }

    function handleLeave() {
      visible = false;
      schedule();
    }

    function handleMouseOut(event) {
      if (event.relatedTarget) return;
      handleLeave();
    }

    window.addEventListener("mousemove", handleMove, { passive: true });
    window.addEventListener("mouseout", handleMouseOut);
    window.addEventListener("blur", handleLeave);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseout", handleMouseOut);
      window.removeEventListener("blur", handleLeave);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  return <div ref={spotlightRef} className="mouse-spotlight" aria-hidden="true" />;
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(null); // null = loading

  useEffect(() => {
    checkAuth()
      .then((res) => setAuthenticated(res.authenticated))
      .catch(() => setAuthenticated(false));
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
      <MouseSpotlight />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={
            authenticated ? <Navigate to="/" /> : <Login onLogin={() => setAuthenticated(true)} />
          } />
          <Route path="/" element={
            authenticated ? <Dashboard /> : <Navigate to="/login" />
          } />
          <Route path="/settings" element={
            authenticated ? (
              <Suspense fallback={<SettingsChrome />}>
                <Settings />
              </Suspense>
            ) : <Navigate to="/login" />
          } />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  );
}
