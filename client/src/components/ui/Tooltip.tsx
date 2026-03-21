import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";

interface TooltipProps {
  content: string;
  children: React.ReactElement<React.HTMLAttributes<HTMLElement>>;
  side?: "top" | "bottom" | "left" | "right";
  open?: boolean;
  fullWidth?: boolean;
}

export function Tooltip({ content, children, side = "top", open, fullWidth }: TooltipProps) {
  const [hovered, setHovered] = useState(false);
  const visible = open !== undefined ? open : hovered;

  const positionClasses = {
    top:    "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left:   "right-full top-1/2 -translate-y-1/2 mr-2",
    right:  "left-full top-1/2 -translate-y-1/2 ml-2",
  }[side];

  const motionOffset = {
    top:    { y: 4 },
    bottom: { y: -4 },
    left:   { x: 4 },
    right:  { x: -4 },
  }[side];

  const child = children as React.ReactElement<React.HTMLAttributes<HTMLElement>>;

  return (
    <span
      className={`relative inline-flex${fullWidth ? " w-full" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      {child}
      <AnimatePresence>
        {visible && content && (
          <motion.span
            role="tooltip"
            initial={{ opacity: 0, ...motionOffset }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className={`pointer-events-none absolute z-50 ${positionClasses}`}
          >
            <span
              className="flex items-center gap-1.5 bg-[#0e0e0e] px-2.5 py-1.5 border border-[rgba(255,255,255,0.07)] shadow-xl shadow-black/50"
              style={{ minWidth: "max-content", borderRadius: 2 }}
            >
              <span className="font-mono text-xs text-[#b5ff18] select-none leading-none">$</span>
              <span className="font-mono text-xs text-[#e0e0e0] whitespace-nowrap leading-none">{content}</span>
              <span className="inline-block h-[10px] w-[5px] bg-[#b5ff18] opacity-50 animate-pulse" />
            </span>
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
