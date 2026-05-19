import { type ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className = "", variant = "primary", size = "md", disabled, ...props },
    ref,
  ) => {
    const base =
      "inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-40 disabled:pointer-events-none cursor-pointer";

    const variants = {
      primary:
        "bg-accent text-accent-foreground hover:brightness-110 active:brightness-95 shadow-sm shadow-accent/25",
      secondary:
        "border border-border bg-surface text-foreground hover:bg-muted active:bg-border",
      danger:
        "bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-sm shadow-red-600/25",
      ghost:
        "text-muted-foreground hover:text-foreground hover:bg-muted active:bg-border",
    };

    const sizes = {
      sm: "h-8 px-3 text-xs gap-1.5",
      md: "h-10 px-4 text-sm gap-2",
      lg: "h-12 px-6 text-sm gap-2",
    };

    return (
      <button
        ref={ref}
        className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
        disabled={disabled}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";
