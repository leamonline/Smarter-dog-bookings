import { BRAND } from "../../constants/index.ts";

const S = 18;
const SW = 2;

interface IconProps {
  size?: number;
  colour?: string;
}

export function IconTick({ size = S, colour = BRAND.blue }: IconProps) {
  return (<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={colour} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5l3.5 3.5 6.5-8" /></svg>);
}

export function IconBlock({ size = S, colour = BRAND.coral }: IconProps) {
  return (<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={colour} strokeWidth={SW} strokeLinecap="round"><circle cx="8" cy="8" r="6" /><line x1="3.5" y1="3.5" x2="12.5" y2="12.5" /></svg>);
}

export function IconReopen({ size = S, colour = BRAND.teal }: IconProps) {
  return (<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={colour} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="12" height="11" rx="1.5" /><line x1="2" y1="6.5" x2="14" y2="6.5" /><line x1="5.5" y1="3" x2="5.5" y2="5" /><line x1="10.5" y1="3" x2="10.5" y2="5" /><path d="M6 10l1.5 1.5L10.5 9" /></svg>);
}

export function IconEdit({ size = S, colour = BRAND.blue }: IconProps) {
  return (<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={colour} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 3.5l3 3L5 14H2v-3z" /><path d="M9.5 3.5l1.5-1.5 3 3-1.5 1.5" /></svg>);
}

export function IconMessage({ size = S, colour = BRAND.teal }: IconProps) {
  return (<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={colour} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h12v8H5l-3 3z" /></svg>);
}

export function IconPlus({ size = S, colour = BRAND.blue }: IconProps) {
  return (<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={colour} strokeWidth={SW} strokeLinecap="round"><line x1="8" y1="3" x2="8" y2="13" /><line x1="3" y1="8" x2="13" y2="8" /></svg>);
}

export function IconSearch({ size = S, colour = BRAND.textLight }: IconProps) {
  return (<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={colour} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round"><circle cx="7" cy="7" r="5" /><line x1="10.5" y1="10.5" x2="14" y2="14" /></svg>);
}
