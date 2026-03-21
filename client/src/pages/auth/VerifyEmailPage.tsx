import { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");

    if (!token) {
      setStatus("error");
      setMessage("Invalid verification link. No token provided.");
      return;
    }

    const verifyEmail = async () => {
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";

      try {
        const response = await fetch(`${apiUrl}/auth/verify-email?token=${encodeURIComponent(token)}`, {
          method: "GET",
          credentials: "include",
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || data.error || "Verification failed");
        }

        setStatus("success");
        setMessage(data.message || "Email verified successfully!");
      } catch (err) {
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "Verification failed");
      }
    };

    verifyEmail();
  }, [searchParams]);

  return (
    <div className="auth-page">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="auth-title">Mindful</h1>
          <p className="auth-subtitle">Email Verification</p>
        </div>

        <div className="auth-card flex flex-col items-center justify-center py-12 space-y-4">
          {status === "loading" && (
            <>
              <Loader2 className="h-12 w-12 animate-spin text-[#b5ff18]" />
              <p className="text-muted-foreground font-mono text-sm">Verifying your email...</p>
            </>
          )}

          {status === "success" && (
            <>
              <CheckCircle className="h-12 w-12 text-green-400" />
              <p className="text-green-400 font-mono text-sm text-center">{message}</p>
              <button
                onClick={() => navigate("/login")}
                className="auth-button mt-4"
              >
                Continue to Login
              </button>
            </>
          )}

          {status === "error" && (
            <>
              <XCircle className="h-12 w-12 text-red-400" />
              <p className="text-red-400 font-mono text-sm text-center">{message}</p>
              <Link
                to="/login"
                className="auth-button mt-4 text-center"
              >
                Back to Login
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
