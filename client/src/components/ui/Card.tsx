import { HTMLAttributes, KeyboardEvent, forwardRef } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "interactive";
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className = "", variant = "default", children, onClick, ...props }, ref) => {
    const isInteractive = variant === "interactive" || !!onClick;

    const variantStyles = {
      default: "border-[rgba(255,255,255,0.07)] bg-[#0e0e0e]",
      interactive: "border-[rgba(255,255,255,0.07)] bg-[#0e0e0e] hover:border-[rgba(255,255,255,0.12)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b5ff18] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]",
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
      if (isInteractive && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        onClick?.(e as unknown as React.MouseEvent<HTMLDivElement>);
      }
    };

    return (
      <div
        ref={ref}
        className={`relative overflow-hidden rounded-sm border transition-[background-color,border-color,opacity,transform] duration-200 ${variantStyles[isInteractive ? "interactive" : "default"]} ${className}`}
        role={isInteractive ? "button" : undefined}
        tabIndex={isInteractive ? 0 : undefined}
        onClick={onClick}
        onKeyDown={isInteractive ? handleKeyDown : undefined}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";

export const CardGlow = () => null;

export const CardBorder = () => null;

export const CardContent = ({ className = "", children }: { className?: string; children: React.ReactNode }) => (
  <div className={`relative z-10 p-5 ${className}`}>
    {children}
  </div>
);
