import { HTMLAttributes, forwardRef } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "interactive";
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className = "", variant = "default", children, ...props }, ref) => {
    const variantStyles = {
      default: "border-[rgba(255,255,255,0.07)] bg-[#0e0e0e]",
      interactive: "border-[rgba(255,255,255,0.07)] bg-[#0e0e0e] hover:border-[rgba(255,255,255,0.12)] cursor-pointer",
    };

    return (
      <div
        ref={ref}
        className={`relative overflow-hidden rounded-sm border transition-all duration-200 ${variantStyles[variant]} ${className}`}
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
