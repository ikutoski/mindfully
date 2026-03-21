import { HTMLAttributes, forwardRef } from "react";
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  Zap,
  Circle
} from "lucide-react";

type StatusType = "running" | "idle" | "error" | "starting" | "stopped";

interface StatusBadgeProps extends HTMLAttributes<HTMLDivElement> {
  status: StatusType;
  showIcon?: boolean;
  showLabel?: boolean;
  size?: "sm" | "md";
}

const statusConfig: Record<StatusType, {
  color: string;
  bg: string;
  border: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = {
  running: {
    color: "text-[#b5ff18]",
    bg: "bg-[rgba(181,255,24,0.06)]",
    border: "border-[rgba(181,255,24,0.2)]",
    label: "Running",
    Icon: Loader2,
  },
  idle: {
    color: "text-[rgba(255,255,255,0.45)]",
    bg: "bg-[rgba(255,255,255,0.03)]",
    border: "border-[rgba(255,255,255,0.07)]",
    label: "Idle",
    Icon: Circle,
  },
  error: {
    color: "text-red-400",
    bg: "bg-[rgba(239,68,68,0.06)]",
    border: "border-[rgba(239,68,68,0.2)]",
    label: "Error",
    Icon: AlertCircle,
  },
  starting: {
    color: "text-amber-400",
    bg: "bg-[rgba(251,191,36,0.06)]",
    border: "border-[rgba(251,191,36,0.2)]",
    label: "Starting",
    Icon: Zap,
  },
  stopped: {
    color: "text-[rgba(255,255,255,0.35)]",
    bg: "bg-[rgba(255,255,255,0.02)]",
    border: "border-[rgba(255,255,255,0.06)]",
    label: "Stopped",
    Icon: CheckCircle2,
  },
};

export const StatusBadge = forwardRef<HTMLDivElement, StatusBadgeProps>(
  ({
    className = "",
    status,
    showIcon = true,
    showLabel = true,
    size = "md",
    ...props
  }, ref) => {
    const config = statusConfig[status];
    const sizeStyles = {
      sm: "px-2 py-1 text-[8px]",
      md: "px-2.5 py-1 text-[10px]",
    };
    const iconSizes = {
      sm: "h-3 w-3",
      md: "h-3.5 w-3.5",
    };

    const StatusIcon = config.Icon;

    return (
      <div
        ref={ref}
        className={`inline-flex items-center gap-1.5 rounded-sm border ${config.border} ${config.bg} ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {showIcon && (
          <StatusIcon className={`${config.color} ${status === "running" ? "animate-spin" : ""} ${iconSizes[size]}`} />
        )}
        {showLabel && (
          <span className={`font-mono uppercase tracking-wider ${config.color}`}>
            {config.label}
          </span>
        )}
        {status === "running" && (
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#b5ff18] opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#b5ff18]" />
          </span>
        )}
      </div>
    );
  }
);

StatusBadge.displayName = "StatusBadge";

export { statusConfig };
