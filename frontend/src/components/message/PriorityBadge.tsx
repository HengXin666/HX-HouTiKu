import { cn, PRIORITY_CONFIG, type PriorityLevel } from "@/lib/utils";

interface PriorityBadgeProps {
  priority: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function PriorityBadge({
  priority,
  size = "sm",
  className,
}: PriorityBadgeProps) {
  const config = PRIORITY_CONFIG[priority as PriorityLevel] ?? PRIORITY_CONFIG.default;

  const sizeClasses = {
    sm: "px-1.5 py-0.5 text-[10px]",
    md: "px-2 py-0.5 text-xs",
    lg: "px-3 py-1 text-sm",
  };

  const colorClasses: Record<string, string> = {
    urgent: "bg-priority-urgent/15 text-priority-urgent border-priority-urgent/30",
    high: "bg-priority-high/15 text-priority-high border-priority-high/30",
    default: "bg-priority-default/15 text-priority-default border-priority-default/30",
    low: "bg-priority-low/15 text-priority-low border-priority-low/30",
    debug: "bg-priority-debug/15 text-priority-debug border-priority-debug/30",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border font-medium uppercase tracking-wider",
        sizeClasses[size],
        colorClasses[priority] ?? colorClasses.default,
        className
      )}
    >
      <span>{config.emoji}</span>
      <span>{config.label}</span>
    </span>
  );
}
