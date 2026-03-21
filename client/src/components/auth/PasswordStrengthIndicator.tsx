import { Check, X } from "lucide-react";

interface PasswordStrengthIndicatorProps {
  password: string;
  show?: boolean;
}

const requirements = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "Contains uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Contains lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { label: "Contains number", test: (p: string) => /\d/.test(p) },
  { label: "Contains special character", test: (p: string) => /[!@#$%^&*(),.?":{}|<>]/.test(p) },
];

export function PasswordStrengthIndicator({ password, show = true }: PasswordStrengthIndicatorProps) {
  if (!show || !password) return null;

  const passedCount = requirements.filter(r => r.test(password)).length;
  const strength = passedCount === 0 ? 0 : passedCount / requirements.length;

  const getColor = () => {
    if (strength <= 0.2) return "bg-red-500";
    if (strength <= 0.4) return "bg-red-400";
    if (strength <= 0.6) return "bg-amber-400";
    if (strength <= 0.8) return "bg-[#b5ff18]";
    return "bg-[rgb(74,222,128)]";
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-0.5 flex-1 rounded-full transition-colors ${
              i < passedCount ? getColor() : "bg-[rgba(255,255,255,0.08)]"
            }`}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1 text-[10px] font-mono">
        {requirements.map((req, i) => {
          const passed = req.test(password);
          return (
            <div
              key={i}
              className={`flex items-center gap-1 ${passed ? "text-[rgb(74,222,128)]" : "text-[rgba(255,255,255,0.3)]"}`}
            >
              {passed ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
              <span className="truncate">{req.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function getPasswordStrength(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (password.length < 8) errors.push("Password must be at least 8 characters");
  if (!/[A-Z]/.test(password)) errors.push("Password must contain an uppercase letter");
  if (!/[a-z]/.test(password)) errors.push("Password must contain a lowercase letter");
  if (!/\d/.test(password)) errors.push("Password must contain a number");
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) errors.push("Password must contain a special character");
  return { valid: errors.length === 0, errors };
}
