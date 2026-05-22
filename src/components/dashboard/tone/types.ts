// Shared shape returned by every right-rail tone resolver. The
// container uses `tone` for sorting / collapse decisions and `urgency`
// as the within-tone tiebreak; the card wrapper consumes the rest to
// drive its visual treatment.

export type RightRailTone = "calm" | "active" | "attention";

export type ToneRecord = {
  tone: RightRailTone;
  pillLabel: string | null;
  primaryNumber: number | null;
  primaryLine: string | null;
  subtitle: string | null;
  ariaSummary: string;
  urgency: number;
  progress: { current: number; total: number } | null;
};
