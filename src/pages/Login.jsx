import { useState, useRef, useEffect } from "react";
import { login } from "../api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sun, Lock } from "lucide-react";

export default function Login({ onLogin }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [locked, setLocked] = useState(false);
  const inputRef = useRef(null);

  // Auto-focus input on mount and after lockout clears
  useEffect(() => {
    if (!locked) inputRef.current?.focus();
  }, [locked]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!password || loading || locked) return;
    setLoading(true);

    try {
      await login(password);
      onLogin();
    } catch (err) {
      const msg = err.message || "";
      if (msg.toLowerCase().includes("too many")) {
        setError(msg);
        setLocked(true);
        setTimeout(() => {
          setLocked(false);
          setError(null);
        }, 60_000);
      } else {
        setError(msg || "Invalid password");
      }
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center text-foreground px-4">
      <form
        className="w-full max-w-[360px] rounded-xl border border-white/[0.04] bg-card p-8 text-center"
        onSubmit={handleSubmit}
      >
        <div className="mb-6 flex justify-center text-[#f9e2af]"><Sun size={40} /></div>
        <h1 className="font-serif text-[28px] font-normal text-white/95 mb-1">EA Dashboard</h1>
        <p className="text-sm text-muted-foreground mb-8">Enter your password to continue</p>

        <div className="mb-4">
          <Input
            ref={inputRef}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error && !locked) setError(null);
            }}
            disabled={locked}
            autoFocus
          />
        </div>

        {error && (
          <div
            className={`text-xs mb-4 rounded-lg px-3 py-2 ${
              locked
                ? "bg-[#f9e2af]/10 text-[#f9e2af] border border-[#f9e2af]/20"
                : "bg-[#f38ba8]/10 text-[#f38ba8] border border-[#f38ba8]/20"
            }`}
          >
            {locked && (
              <Lock size={12} className="inline-block mr-1.5 -mt-0.5" />
            )}
            {error}
          </div>
        )}

        <Button
          type="submit"
          className="w-full"
          disabled={loading || !password || locked}
        >
          {loading ? "Signing in..." : locked ? "Locked" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
