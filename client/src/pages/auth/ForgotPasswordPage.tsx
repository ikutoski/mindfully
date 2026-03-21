import { useState } from "react";
import { Mail, Loader2, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<"form" | "sent" | "error">("form");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage("");

    const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";

    try {
      const response = await fetch(`${apiUrl}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || "Failed to send reset email");
      }

      setStatus("sent");
      setMessage(data.message || "If an account exists with this email, a password reset link has been sent.");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Failed to send reset email");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="auth-title">Mindful</h1>
          <p className="auth-subtitle">Reset Your Password</p>
        </div>

        <div className="auth-card space-y-4">
          {status === "form" && (
            <>
              <p className="text-sm text-muted-foreground text-center font-mono">
                Enter your email address and we&apos;ll send you a link to reset your password.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex w-full items-center gap-3 rounded-md border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-3 py-0.5 focus-within:border-[rgba(255,255,255,0.16)]  transition-all">
                  <Mail className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <input
                    type="email"
                    placeholder="Email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="flex-1 bg-transparent py-2.5 text-sm font-mono text-[#e0e0e0] outline-none placeholder:text-[rgba(255,255,255,0.2)]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="auth-button-primary w-full"
                >
                  {isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    "Send Reset Link"
                  )}
                </button>
              </form>
            </>
          )}

          {status === "sent" && (
            <div className="text-center py-4 space-y-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-green-400/10 flex items-center justify-center">
                <Mail className="h-6 w-6 text-green-400" />
              </div>
              <p className="text-sm text-green-400 font-mono">{message}</p>
              <p className="text-xs text-muted-foreground font-mono">
                Didn&apos;t receive the email? Check your spam folder or{" "}
                <button
                  onClick={() => setStatus("form")}
                  className="text-[#b5ff18] hover:underline"
                >
                  try again
                </button>
              </p>
            </div>
          )}

          {status === "error" && (
            <div className="text-center py-4 space-y-4">
              <p className="text-sm text-red-400 font-mono">{message}</p>
              <button
                onClick={() => setStatus("form")}
                className="auth-button"
              >
                Try Again
              </button>
            </div>
          )}

          <Link
            to="/login"
            className="flex items-center justify-center gap-2 w-full text-center text-sm text-muted-foreground hover:text-[#b5ff18] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
