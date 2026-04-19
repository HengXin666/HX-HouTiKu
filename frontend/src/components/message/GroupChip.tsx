import { getGroupEmoji } from "@/lib/utils";

interface GroupChipProps {
  group: string;
}

export function GroupChip({ group }: GroupChipProps) {
  return (
    <span className="group-chip">
      <span>{getGroupEmoji(group)}</span>
      <span>{group}</span>
    </span>
  );
}
