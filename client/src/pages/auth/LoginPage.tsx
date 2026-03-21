import { useState } from "react";
import { Github, Mail, Lock, User, Loader2 } from "lucide-react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../../lib/hooks/useAuth";
import { PasswordStrengthIndicator } from "../../components/auth/PasswordStrengthIndicator";

export function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const { setIdToken } = useAuth();

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || "/";

  const handleGitHubLogin = () => {
    setIsLoading(true);
    const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID;
    const redirectUri = `${window.location.origin}/auth/callback/github`;
    const scope = "user:email";

    const githubUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(from)}`;

    window.location.href = githubUrl;
  };

  const handleGoogleLogin = () => {
    setIsLoading(true);
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const redirectUri = `${window.location.origin}/auth/callback/google`;
    const scope = "email profile";

    const googleUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(from)}`;

    window.location.href = googleUrl;
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const endpoint = isRegistering ? "/auth/register" : "/auth/login";
    const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";

    try {
      const body = isRegistering
        ? { email, password, name: name || undefined }
        : { email, password };

      const response = await fetch(`${apiUrl}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || "Authentication failed");
      }

      if (isRegistering) {
        setError("Registration successful! Please check your email to verify your account.");
        setIsRegistering(false);
      } else {
        if (data.idToken) {
          setIdToken(data.idToken);
        }
        navigate(from);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="auth-title">
            Mindful
          </h1>
          <p className="auth-subtitle">
            Multi-Agent AI Platform
          </p>
        </div>

        <div className="auth-card space-y-4">
          <button
            onClick={handleGitHubLogin}
            disabled={isLoading}
            className="auth-button"
          >
            <Github className="h-5 w-5" />
            {isLoading ? "Connecting..." : "Sign in with GitHub"}
          </button>

          <button
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="auth-button"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            {isLoading ? "Connecting..." : "Sign in with Google"}
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[rgba(255,255,255,0.08)]" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-[#0a0a0a] px-2 text-muted-foreground">
                {isRegistering ? "Create your account" : "Sign in with email"}
              </span>
            </div>
          </div>

          <form onSubmit={handleEmailAuth} className="space-y-4">
            {isRegistering && (
              <div className="flex w-full items-center gap-3 rounded-md border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-3 py-0.5 focus-within:border-[rgba(255,255,255,0.16)]  transition-all">
                <User className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Name (optional)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="flex-1 bg-transparent py-2.5 text-sm font-mono text-[#e0e0e0] outline-none placeholder:text-[rgba(255,255,255,0.2)]"
                />
              </div>
            )}

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

            <div className="flex w-full items-center gap-3 rounded-md border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-3 py-0.5 focus-within:border-[rgba(255,255,255,0.16)]  transition-all">
              <Lock className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="flex-1 bg-transparent py-2.5 text-sm font-mono text-[#e0e0e0] outline-none placeholder:text-[rgba(255,255,255,0.2)]"
              />
            </div>

            {isRegistering && password && (
              <PasswordStrengthIndicator password={password} />
            )}

            {!isRegistering && (
              <div className="text-right">
                <Link
                  to="/forgot-password"
                  className="text-sm text-[#b5ff18] hover:text-[#c8ff50] transition-colors font-mono"
                >
                  Forgot password?
                </Link>
              </div>
            )}

            {error && (
              <p className={`text-sm ${isRegistering && error.includes("successful") ? "text-green-400" : "text-red-400"}`}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="auth-button-primary w-full"
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                isRegistering ? "Create Account" : "Sign In"
              )}
            </button>
          </form>

          <button
            onClick={() => {
              setIsRegistering(!isRegistering);
              setError("");
            }}
            className="w-full text-center text-sm font-mono text-[rgba(255,255,255,0.35)] hover:text-[#b5ff18] transition-colors"
          >
            {isRegistering
              ? "Already have an account? Sign in"
              : "Don't have an account? Register"}
          </button>
        </div>

        <p className="auth-footer">
          By signing in, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
}
