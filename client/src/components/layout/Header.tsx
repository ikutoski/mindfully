import { useState, useRef, useEffect, useCallback } from "react";
import { Bell, Search, Command, LogOut, ChevronDown, Mail, AlertCircle, Laptop } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../lib/hooks/useAuth";

interface HeaderProps {
  className?: string;
}

export function Header({ className }: HeaderProps) {
  const [searchFocused, setSearchFocused] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setUserMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const handleResendVerification = async () => {
    if (!user?.email || resending) return;
    setResending(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";
      const response = await fetch(`${apiUrl}/auth/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: user.email }),
      });
      if (response.ok) {
        setResent(true);
        setTimeout(() => setResent(false), 5000);
      }
    } catch (error) {
      console.error("Failed to resend verification:", error);
    } finally {
      setResending(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const userInitials = user?.name
    ? user.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() || "?";

  return (
    <header
      className={`sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[rgba(255,255,255,0.07)] px-4 md:px-6 header ${className || ""}`}
    >
      <div className="flex flex-1 items-center gap-4">
        <div
          className={`relative flex-1 max-w-xs md:max-w-md transition-all duration-300 ${
            searchFocused ? "md:max-w-lg" : ""
          }`}
        >
          <label htmlFor="header-search" className="sr-only">Search agents</label>
          <Search
            className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors duration-200 ${
              searchFocused ? "text-[#e0e0e0]" : "text-[rgba(255,255,255,0.35)]"
            }`}
            aria-hidden="true"
          />
          <input
            id="header-search"
            type="search"
            placeholder="Search agents…"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className="header-search-input h-10 w-full rounded-sm pl-10 pr-16 text-sm font-mono transition-[border-color,background-color] duration-200 placeholder:text-[rgba(255,255,255,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b5ff18] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]"
          />
          <div className="header-search-shortcut absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-mono text-[rgba(255,255,255,0.3)] md:flex">
            <Command className="h-3 w-3" />
            <span>K</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          aria-label="Notifications"
          className="header-icon-btn group relative flex h-9 w-9 items-center justify-center transition-[background-color,border-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b5ff18] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]"
        >
          <Bell className="h-4 w-4 text-[rgba(255,255,255,0.4)] transition-colors duration-200 group-hover:text-[#e0e0e0]" aria-hidden="true" />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-red-500" aria-label="New notifications" />
        </button>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            aria-label="User menu"
            aria-haspopup="true"
            aria-expanded={userMenuOpen}
            className="header-user-btn flex items-center gap-2 p-1.5 pr-3 transition-[background-color,border-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b5ff18] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]"
          >
            <div className="header-user-avatar flex h-7 w-7 items-center justify-center rounded-sm">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.name || "User avatar"} className="h-full w-full rounded-sm object-cover" />
              ) : (
                <span className="text-[11px] font-bold" aria-hidden="true">{userInitials}</span>
              )}
            </div>
            <span className="hidden md:block text-xs font-mono uppercase tracking-wider text-[rgba(255,255,255,0.7)] truncate max-w-[120px]">
              {user?.name || user?.email || "User"}
            </span>
            <ChevronDown className={`h-3 w-3 text-[rgba(255,255,255,0.35)] transition-transform duration-200 ${userMenuOpen ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>

          {userMenuOpen && (
            <div
              role="menu"
              aria-label="User account menu"
              className="absolute right-0 mt-2 w-56 rounded-sm border border-[rgba(255,255,255,0.08)] bg-[#0d0d0d]"
            >              <div className="border-b border-[rgba(255,255,255,0.07)] p-3">
                <p className="text-xs font-mono text-[#e0e0e0] truncate">{user?.name || "User"}</p>
                <p className="text-[10px] font-mono text-[rgba(255,255,255,0.35)] truncate mt-0.5">{user?.email}</p>
                {user?.emailVerified === false && (
                  <div className="mt-2 flex items-center gap-1.5 text-[10px] font-mono text-amber-400">
                    <AlertCircle className="h-3 w-3" />
                    <span>Email not verified</span>
                  </div>
                )}
              </div>
              {user?.emailVerified === false && (
                <div className="border-b border-[rgba(255,255,255,0.07)] p-1">
                  <button
                    onClick={handleResendVerification}
                    disabled={resending || resent}
                    className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-xs font-mono text-amber-400 hover:bg-[rgba(255,255,255,0.04)] transition-colors disabled:opacity-50"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    {resent ? "Email sent!" : resending ? "Sending..." : "Resend verification"}
                  </button>
                </div>
              )}
              <div className="border-b border-[rgba(255,255,255,0.07)] p-1">
                <Link
                  to="/settings/sessions"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-xs font-mono text-[rgba(255,255,255,0.45)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[#e0e0e0] transition-colors"
                >
                  <Laptop className="h-3.5 w-3.5" />
                  Manage sessions
                </Link>
              </div>
              <div className="p-1">
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-xs font-mono text-red-400 hover:bg-[rgba(239,68,68,0.06)] transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
