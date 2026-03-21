import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/hooks/useAuth";

export function OAuthCallback() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const handleCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const returnTo = params.get("state") ? decodeURIComponent(params.get("state")!) : "/";
      const pathParts = window.location.pathname.split("/");
      const provider = pathParts[pathParts.length - 1];

      if (!code) {
        setError("No authorization code received");
        return;
      }

      try {
        const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";
        const response = await fetch(`${apiUrl}/auth/${provider}/verify`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ code }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.message || "Authentication failed");
        }

        const data = await response.json();

        if (data.idToken) {
          localStorage.setItem("id_token", data.idToken);
        }

        await refreshUser();
        navigate(returnTo);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Authentication failed");
      }
    };

    handleCallback();
  }, [navigate, refreshUser]);

  if (error) {
    return (
      <div className="auth-page">
        <div className="callback-error space-y-4">
          <h1>Authentication Failed</h1>
          <p>{error}</p>
          <button
            onClick={() => navigate("/login")}
            className="auth-button"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="callback-loading space-y-4">
        <div className="callback-spinner" />
        <p className="auth-subtitle">
          Authenticating...
        </p>
      </div>
    </div>
  );
}
