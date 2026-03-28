import { useState } from "react";
import { login } from "../api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function Login({ onLogin }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!password || loading) return;
    setLoading(true);
    setError(null);

    try {
      await login(password);
      onLogin();
    } catch {
      setError("Invalid password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center text-text-body">
      <form className="w-full max-w-[340px] p-8 text-center" onSubmit={handleSubmit}>
        <div className="text-5xl mb-6">☀️</div>
        <h1 className="font-serif text-[28px] font-normal text-white/95 mb-2">EA Dashboard</h1>
        <p className="text-sm text-text-muted mb-6">Enter your password to continue</p>

        <Input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          className="mb-4"
        />

        {error && <p className="text-xs text-danger mb-4">{error}</p>}

        <Button type="submit" className="w-full" disabled={loading || !password}>
          {loading ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
