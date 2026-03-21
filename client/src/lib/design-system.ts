export const colors = {
  primary: {
    DEFAULT: "#b5ff18",
    10: "rgba(181,255,24,0.1)",
    15: "rgba(181,255,24,0.15)",
    20: "rgba(181,255,24,0.2)",
    30: "rgba(181,255,24,0.3)",
    40: "rgba(181,255,24,0.4)",
    50: "rgba(181,255,24,0.5)",
    70: "#c8ff50",
  },
  success: {
    DEFAULT: "rgb(74,222,128)",
    75: "rgba(74,222,128,0.75)",
  },
  warning: {
    DEFAULT: "rgb(251,191,36)",
    75: "rgba(251,191,36,0.75)",
  },
  danger: {
    DEFAULT: "rgb(239,68,68)",
    75: "rgba(239,68,68,0.75)",
  },
  background: {
    DEFAULT: "#0a0a0a",
    card: "#0e0e0e",
    elevated: "#0d0d0d",
  },
  border: {
    DEFAULT: "rgba(255,255,255,0.07)",
    hover: "rgba(255,255,255,0.14)",
  },
} as const;

export const cn = (...classes: (string | boolean | undefined)[]) =>
  classes.filter(Boolean).join(" ");

export const styles = {
  card: {
    base: "relative overflow-hidden rounded-sm border transition-all duration-200",
    cyber: `border-[rgba(255,255,255,0.07)] bg-[#0e0e0e] hover:border-[rgba(255,255,255,0.12)]`,
  },
  button: {
    base: "flex items-center justify-center rounded-sm border transition-all duration-200",
    cyber: `border-[rgba(181,255,24,0.3)] bg-[rgba(181,255,24,0.06)] hover:border-[rgba(181,255,24,0.5)] hover:bg-[rgba(181,255,24,0.12)]`,
  },
  text: {
    gradient: "text-[#b5ff18]",
    mono: "font-mono text-xs uppercase tracking-wider",
  },
} as const;
