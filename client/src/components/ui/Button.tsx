import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "default", size = "md", isLoading, children, disabled, ...props }, ref) => {
    const baseStyles = "inline-flex items-center justify-center font-mono uppercase tracking-wider transition-[background-color,border-color,color,opacity,transform] duration-200 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b5ff18] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]";

    const variantStyles = {
      default: "border border-[rgba(181,255,24,0.3)] bg-[rgba(181,255,24,0.06)] text-[#b5ff18] hover:border-[rgba(181,255,24,0.5)] hover:bg-[rgba(181,255,24,0.12)]",
      outline: "border border-[rgba(255,255,255,0.08)] bg-transparent text-[rgba(255,255,255,0.6)] hover:border-[rgba(255,255,255,0.16)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[#e0e0e0]",
      ghost: "bg-transparent text-[rgba(255,255,255,0.45)] hover:text-[#e0e0e0] hover:bg-[rgba(255,255,255,0.04)]",
    };

    const sizeStyles = {
      sm: "h-8 px-3 text-[10px] rounded-sm",
      md: "h-9 px-4 text-xs rounded-sm",
      lg: "h-10 px-5 text-xs rounded-sm",
    };

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <span className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : null}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
