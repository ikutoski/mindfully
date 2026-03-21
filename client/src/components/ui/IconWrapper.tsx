import { HTMLAttributes, forwardRef } from "react";

interface IconWrapperProps extends HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
}

export const IconWrapper = forwardRef<HTMLDivElement, IconWrapperProps>(
  ({ className = "", size = "md", children, ...props }, ref) => {
    const sizeStyles = {
      sm: "h-8 w-8",
      md: "h-10 w-10",
      lg: "h-12 w-12",
    };

    return (
      <div
        ref={ref}
        className={`inline-flex items-center justify-center rounded-sm border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

IconWrapper.displayName = "IconWrapper";
