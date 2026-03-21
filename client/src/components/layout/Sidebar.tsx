import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Bot,
  Settings,
  Users,
  Activity,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  isMobile?: boolean;
  onCloseMobile?: () => void;
  onHoverChange?: (hovered: boolean) => void;
}

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/" },
  { icon: Bot, label: "Agents", href: "/agents" },
  { icon: Activity, label: "Activity", href: "/activity" },
  { icon: Users, label: "Team", href: "/team" },
  { icon: Settings, label: "Settings", href: "/settings" },
];

export function Sidebar({
  collapsed,
  onToggle,
  isMobile,
  onCloseMobile,
  onHoverChange,
}: SidebarProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [hoverDisabled, setHoverDisabled] = useState(false);
  const location = useLocation();

  const isCollapsed = isMobile ? false : collapsed;
  const shouldShowExpanded = hoverDisabled ? !collapsed : (isCollapsed ? isHovered : false);

  const handleMouseEnter = () => {
    if (isCollapsed && !hoverDisabled) {
      setIsHovered(true);
      onHoverChange?.(true);
    }
  };

  const handleMouseLeave = () => {
    if (!hoverDisabled) {
      setIsHovered(false);
      onHoverChange?.(false);
    }
  };

  const handleToggle = () => {
    if (collapsed) {
      setHoverDisabled(true);
    } else {
      setHoverDisabled(false);
    }
    setIsHovered(false);
    onHoverChange?.(false);
    onToggle();
  };

  const isActive = (href: string) => {
    if (href === "/") return location.pathname === "/";
    return location.pathname.startsWith(href);
  };

  return (
    <aside
      className={`sidebar relative h-screen transition-[width] duration-300 ${
        isCollapsed && !shouldShowExpanded ? "w-16" : "w-64"
      } ${isMobile ? "w-64" : ""}`}
    >
      <div className="flex h-14 items-center justify-between border-b border-[rgba(255,255,255,0.07)] px-3 md:h-16 md:px-4">
        {isMobile && onCloseMobile && (
          <button
            onClick={onCloseMobile}
            aria-label="Close navigation menu"
            className="flex h-8 w-8 items-center justify-center rounded-sm border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b5ff18] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]"
          >
            <X className="h-4 w-4 text-[rgba(255,255,255,0.6)]" aria-hidden="true" />
          </button>
        )}

        {!isMobile && (
          <>
            {isCollapsed && !shouldShowExpanded ? (
              <span className="mx-auto font-mono font-bold text-[#e0e0e0] tracking-tight" aria-label="Mindful">
                M
              </span>
            ) : (
              <span className="font-mono font-bold text-[#e0e0e0] tracking-tight truncate">
                Mindful
              </span>
            )}
          </>
        )}

        {isMobile && (
          <span className="font-mono font-bold text-[#e0e0e0] tracking-tight truncate">
            Mindful
          </span>
        )}
      </div>

      <nav
        aria-label="Main navigation"
        className="space-y-0.5 p-2 md:p-3"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {navItems.map((item, index) => (
          <Link
            key={item.href}
            to={item.href}
            onClick={isMobile ? onCloseMobile : undefined}
            aria-label={isCollapsed && !shouldShowExpanded ? item.label : undefined}
            aria-current={isActive(item.href) ? "page" : undefined}
            className={`group relative flex items-center gap-3 px-3 py-2.5 text-xs font-mono uppercase tracking-wider transition-[background-color,border-color,color] duration-200 rounded-sm sidebar-nav-item focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b5ff18] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a] ${
              isActive(item.href)
                ? "bg-[rgba(181,255,24,0.08)] text-[#b5ff18] border border-[rgba(181,255,24,0.2)]"
                : "text-[rgba(255,255,255,0.45)] hover:text-[#e0e0e0] hover:bg-[rgba(255,255,255,0.04)] border border-transparent"
            }`}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <item.icon
              aria-hidden="true"
              className={`h-4 w-4 shrink-0 transition-colors duration-200 ${
                isActive(item.href)
                  ? "text-[#b5ff18]"
                  : "group-hover:text-[#e0e0e0]"
              }`}
            />
            {(!isCollapsed || shouldShowExpanded) && (
              <span className="truncate">{item.label}</span>
            )}
          </Link>
        ))}
      </nav>

      {!isMobile && (
        <button
          onClick={handleToggle}
          aria-label={isCollapsed && !shouldShowExpanded ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!(isCollapsed && !shouldShowExpanded)}
          className={`sidebar-toggle absolute bottom-4 flex h-8 w-8 items-center justify-center rounded-sm border transition-[background-color,border-color] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b5ff18] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a] ${
            isCollapsed && !shouldShowExpanded ? "right-4" : "right-3"
          }`}
        >
          {isCollapsed && !shouldShowExpanded ? (
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      )}
    </aside>
  );
}
