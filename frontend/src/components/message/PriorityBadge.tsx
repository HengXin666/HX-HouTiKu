import {
  Flame,
  AlertTriangle,
  Circle,
  ArrowDown,
  Bug,
} from "lucide-react";
import { cn, PRIORITY_CONFIG, type PriorityLevel } from "@/lib/utils";

import type { LucideIcon } from "lucide-react";

const PRIORITY_ICONS: Record<string, LucideIcon> = {
  urgent: Flame,
  high: AlertTriangle,
  default: Circle,
  low: ArrowDown,
  debug: Bug,
};

interface PriorityBadgeProps {
  priority: string;
  size?: "sm" | "md";
}

export function PriorityBadge({ priority, size = "sm" }: PriorityBadgeProps) {
  const config = PRIORITY_CONFIG[priority as PriorityLevel] ?? PRIORITY_CONFIG.default;
  const Icon = PRIORITY_ICONS[priority] ?? Circle;
  const iconSize = size === "md" ? 14 : 12;

  return (
    <span
      className={cn(
        "priority-badge",
        `priority-badge--${priority}`,
        size === "md" && "priority-badge--md"
      )}
    >
      <Icon style={{ width: iconSize, height: iconSize, flexShrink: 0 }} />
      <span>{config.label}</span>
    </span>
  );
}
