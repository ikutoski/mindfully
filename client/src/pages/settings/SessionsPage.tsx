import { useState, useEffect } from "react";
import { Monitor, Smartphone, Laptop, Tablet, Trash2, LogOut, AlertCircle } from "lucide-react";
import { useAuth } from "../../lib/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Tooltip } from "../../components/ui/Tooltip";

interface Session {
  id: string;
  userAgent?: string;
  ip?: string;
  lastActive: Date;
  expiresAt: Date;
  isCurrent: boolean;
}

export function SessionsPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [terminating, setTerminating] = useState<string | null>(null);

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";
      const response = await fetch(`${apiUrl}/auth/sessions`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch sessions");
      }

      const data = await response.json();
      setSessions(data.sessions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      setIsLoading(false);
    }
  };

  const handleTerminateSession = async (sessionId: string) => {
    if (terminating) return;
    
    setTerminating(sessionId);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";
      const response = await fetch(`${apiUrl}/auth/sessions/${sessionId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to terminate session");
      }

      setSessions(sessions.filter(s => s.id !== sessionId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to terminate session");
    } finally {
      setTerminating(null);
    }
  };

  const handleTerminateAll = async () => {
    if (terminating) return;
    
    setTerminating("all");
    try {
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";
      const response = await fetch(`${apiUrl}/auth/sessions`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to terminate sessions");
      }

      setSessions(sessions.filter(s => s.isCurrent));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to terminate sessions");
    } finally {
      setTerminating(null);
    }
  };

  const handleLogoutAll = async () => {
    await logout();
    navigate("/login");
  };

  const getDeviceIcon = (userAgent?: string) => {
    if (!userAgent) return <Monitor className="h-5 w-5" />;
    const ua = userAgent.toLowerCase();
    if (ua.includes("mobile") || ua.includes("android") || ua.includes("iphone")) {
      return <Smartphone className="h-5 w-5" />;
    }
    if (ua.includes("tablet") || ua.includes("ipad")) {
      return <Tablet className="h-5 w-5" />;
    }
    return <Laptop className="h-5 w-5" />;
  };

  const getDeviceName = (userAgent?: string) => {
    if (!userAgent) return "Unknown device";
    const ua = userAgent.toLowerCase();
    if (ua.includes("mobile") || ua.includes("android")) {
      if (ua.includes("iphone")) return "iPhone";
      if (ua.includes("android")) return "Android";
      return "Mobile device";
    }
    if (ua.includes("tablet") || ua.includes("ipad")) {
      if (ua.includes("ipad")) return "iPad";
      return "Tablet";
    }
    if (ua.includes("macintosh") || ua.includes("mac os")) return "Mac";
    if (ua.includes("windows")) return "Windows PC";
    if (ua.includes("linux")) return "Linux";
    return "Desktop";
  };

  const formatDate = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const formatExpiry = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    const diff = d.getTime() - now.getTime();
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `Expires in ${days}d`;
    if (hours > 1) return `Expires in ${hours}h`;
    return "Expires soon";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin text-[#b5ff18]" />
        <p className="text-sm text-muted-foreground font-mono">Loading sessions...</p>
      </div>
    );
  }

  const currentSession = sessions.find(s => s.isCurrent);
  const otherSessions = sessions.filter(s => !s.isCurrent);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Session Management</h1>
        <p className="text-sm text-muted-foreground font-mono">
          {sessions.length} active session{sessions.length !== 1 ? "s" : ""}
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-400/20 bg-red-400/10 p-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {currentSession && (
        <div className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(181,255,24,0.05)] p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              {getDeviceIcon(currentSession.userAgent)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-foreground">{getDeviceName(currentSession.userAgent)}</p>
                <span className="rounded-full bg-green-400/10 px-2 py-0.5 text-xs font-mono text-green-400">
                  Current
                </span>
              </div>
              <p className="text-sm text-muted-foreground font-mono">
                {currentSession.ip || "Unknown location"} • {formatDate(currentSession.lastActive)}
              </p>
              <p className="text-xs text-muted-foreground font-mono mt-1">
                {formatExpiry(currentSession.expiresAt)}
              </p>
            </div>
          </div>
        </div>
      )}

      {otherSessions.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-foreground">Other Sessions</h2>
            <button
              onClick={handleTerminateAll}
              disabled={terminating !== null}
              className="flex items-center gap-2 rounded-md border border-red-400/20 bg-red-400/10 px-3 py-1.5 text-sm font-mono text-red-400 transition-colors hover:bg-red-400/20 disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" />
              {terminating === "all" ? "Terminating..." : "Sign out all other devices"}
            </button>
          </div>

          <div className="space-y-3">
            {otherSessions.map((session) => (
              <div
                key={session.id}
                className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-4 hover:border-[rgba(255,255,255,0.14)] transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-shrink-0">
                    {getDeviceIcon(session.userAgent)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">{getDeviceName(session.userAgent)}</p>
                    </div>
                    <p className="text-sm text-muted-foreground font-mono">
                      {session.ip || "Unknown location"} • {formatDate(session.lastActive)}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono mt-1">
                      {formatExpiry(session.expiresAt)}
                    </p>
                  </div>
                  <Tooltip content="Terminate session">
                    <button
                      onClick={() => handleTerminateSession(session.id)}
                      disabled={terminating !== null}
                      className="flex-shrink-0 rounded p-2 text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </Tooltip>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {otherSessions.length === 0 && currentSession && (
        <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.03)] p-6 text-center">
          <AlertCircle className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground font-mono">No other active sessions</p>
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-[rgba(255,255,255,0.06)]">
        <button
          onClick={handleLogoutAll}
          className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 font-mono transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign out of all devices
        </button>
      </div>
    </div>
  );
}
