import { FolderOpen } from "lucide-react";

interface GroupChipProps {
  group: string;
}

export function GroupChip({ group }: GroupChipProps) {
  return (
    <span className="group-chip">
      <FolderOpen style={{ width: 12, height: 12, flexShrink: 0 }} />
      <span>{group}</span>
    </span>
  );
}
