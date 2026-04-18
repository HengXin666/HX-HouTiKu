import { getGroupEmoji, cn } from "@/lib/utils";

interface GroupChipProps {
  group: string;
  className?: string;
}

export function GroupChip({ group, className }: GroupChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground",
        className
      )}
    >
      <span>{getGroupEmoji(group)}</span>
      <span>{group}</span>
    </span>
  );
}
