import type { LucideIcon } from "lucide-react";

interface ChipItem {
  text: string;
  icon: LucideIcon;
}

interface SuggestionChipsProps {
  chips: readonly ChipItem[];
  onClick: (text: string) => void;
}

export function SuggestionChips({ chips, onClick }: SuggestionChipsProps) {
  return (
    <div className="flex flex-wrap justify-center gap-3">
      {chips.map((chip) => (
        <button
          key={chip.text}
          onClick={() => onClick(chip.text)}
          className="glass-card flex items-center gap-2 px-4 py-2.5 text-sm text-text-secondary transition-all duration-200 hover:scale-[1.03] hover:border-primary/30 hover:text-text-primary"
        >
          <chip.icon className="h-4 w-4 text-primary" />
          {chip.text}
        </button>
      ))}
    </div>
  );
}
