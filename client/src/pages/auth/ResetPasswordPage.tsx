import { useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { Lock, Loader2, CheckCircle, XCircle } from "lucide-react";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<"form" | "success" | "error">("form");
  const [message, setMessage] = useState("");

  const token = searchParams.get("token");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      setStatus("error");
      setMessage("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setStatus("error");
      setMessage("Password must be at least 8 characters");
      return;
    }

    setIsLoading(true);
    setMessage("");

    const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";

    try {
      const response = await fetch(`${apiUrl}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || "Failed to reset password");
      }

      setStatus("success");
      setMessage(data.message || "Password reset successfully!");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="auth-page">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h1 className="auth-title">Mindful</h1>
            <p className="auth-subtitle">Invalid Link</p>
          </div>

          <div className="auth-card flex flex-col items-center justify-center py-12 space-y-4">
            <XCircle className="h-12 w-12 text-red-400" />
            <p className="text-red-400 font-mono text-sm text-center">
              This password reset link is invalid or has expired.
            </p>
            <Link to="/forgot-password" className="auth-button text-center">
              Request New Link
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="auth-title">Mindful</h1>
          <p className="auth-subtitle">Set New Password</p>
        </div>

        <div className="auth-card space-y-4">
          {status === "form" && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-muted-foreground text-center font-mono">
                Enter your new password below.
              </p>

              <div className="flex w-full items-center gap-3 rounded-md border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-3 py-0.5 focus-within:border-[rgba(255,255,255,0.16)]  transition-all">
                <Lock className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <input
                  type="password"
                  placeholder="New password (min 8 characters)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="flex-1 bg-transparent py-2.5 text-sm font-mono text-[#e0e0e0] outline-none placeholder:text-[rgba(255,255,255,0.2)]"
                />
              </div>

              <div className="flex w-full items-center gap-3 rounded-md border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-3 py-0.5 focus-within:border-[rgba(255,255,255,0.16)]  transition-all">
                <Lock className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <input
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  className="flex-1 bg-transparent py-2.5 text-sm font-mono text-[#e0e0e0] outline-none placeholder:text-[rgba(255,255,255,0.2)]"
                />
              </div>

              {message && (
                <p className="text-sm text-red-400">{message}</p>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="auth-button-primary w-full"
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  "Reset Password"
                )}
              </button>
            </form>
          )}

          {status === "success" && (
            <div className="text-center py-4 space-y-4">
              <CheckCircle className="h-12 w-12 text-green-400 mx-auto" />
              <p className="text-sm text-green-400 font-mono">{message}</p>
              <button
                onClick={() => navigate("/login")}
                className="auth-button"
              >
                Continue to Login
              </button>
            </div>
          )}

          {status === "error" && message && (
            <div className="text-center py-4 space-y-4">
              <XCircle className="h-12 w-12 text-red-400 mx-auto" />
              <p className="text-sm text-red-400 font-mono">{message}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setStatus("form")}
                  className="auth-button flex-1"
                >
                  Try Again
                </button>
                <Link to="/forgot-password" className="auth-button flex-1 text-center">
                  New Link
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
