import { cn, PRIORITY_CONFIG, type PriorityLevel } from "@/lib/utils";

interface PriorityBadgeProps {
  priority: string;
  size?: "sm" | "md";
}

export function PriorityBadge({ priority, size = "sm" }: PriorityBadgeProps) {
  const config = PRIORITY_CONFIG[priority as PriorityLevel] ?? PRIORITY_CONFIG.default;

  return (
    <span
      className={cn(
        "priority-badge",
        `priority-badge--${priority}`,
        size === "md" && "priority-badge--md"
      )}
    >
      <span>{config.emoji}</span>
      <span>{config.label}</span>
    </span>
  );
}
