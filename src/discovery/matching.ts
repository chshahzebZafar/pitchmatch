// Deterministic weighted matching (spec §6.2). Max score = 100.
//   sector 30 · ticket↔funding 25 · stage 20 · geography 15 · keyword 10

const BRACKET_ORDER = [
  'B_5K_25K',
  'B_25K_100K',
  'B_100K_500K',
  'B_500K_2M',
  'B_2M_PLUS',
];

// Innovator product stage → the investor funding-stage labels it aligns with.
const STAGE_MAP: Record<string, string[]> = {
  IDEA: ['Idea'],
  PROTOTYPE: ['Pre-seed', 'Seed'],
  REVENUE_GENERATING: ['Seed', 'Series A'],
  SCALING: ['Series A', 'Growth'],
};

function asArr(v: unknown): string[] {
  return Array.isArray(v) ? (v as string[]) : [];
}

export interface InvestorLike {
  sectors: unknown;
  stages: unknown;
  ticketMin: string;
  geoFocus: unknown;
}

export interface InnovatorLike {
  sector: string;
  stage: string;
  fundingMin: string;
  geoMarket: unknown;
  oneLiner?: string | null;
  problem?: string | null;
  solution?: string | null;
}

export function scorePair(inv: InvestorLike, inn: InnovatorLike): number {
  let score = 0;
  const invSectors = asArr(inv.sectors);
  const invStages = asArr(inv.stages);
  const invGeo = asArr(inv.geoFocus);
  const innGeo = asArr(inn.geoMarket);

  // Sector overlap (30)
  if (invSectors.includes(inn.sector)) score += 30;

  // Ticket ↔ funding fit (25): same bracket = full, adjacent = half
  const invIdx = BRACKET_ORDER.indexOf(inv.ticketMin);
  const innIdx = BRACKET_ORDER.indexOf(inn.fundingMin);
  if (invIdx >= 0 && innIdx >= 0) {
    const dist = Math.abs(invIdx - innIdx);
    if (dist === 0) score += 25;
    else if (dist === 1) score += 12.5;
  }

  // Stage fit (20)
  const mapped = STAGE_MAP[inn.stage] ?? [];
  if (mapped.some((s) => invStages.includes(s))) score += 20;

  // Geography (15): "Global" always matches, else any overlap
  if (invGeo.includes('Global') || innGeo.includes('Global')) score += 15;
  else if (invGeo.some((g) => innGeo.includes(g))) score += 15;

  // Keyword (10): an investor sector appears in the innovator's text (MVP heuristic)
  const text = `${inn.oneLiner ?? ''} ${inn.problem ?? ''} ${inn.solution ?? ''}`.toLowerCase();
  if (invSectors.some((s) => text.includes(s.toLowerCase()))) score += 10;

  return score;
}
