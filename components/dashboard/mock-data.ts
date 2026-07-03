// Mock — à remplacer par Prisma (issue #4+)
// Données du tableau de bord, centralisées ici. Valeurs reprises telles quelles
// de la maquette design_ref/design_handoff_freelance_flow/Tableau de bord.html.

export type Tone = "a" | "w" | "d" | "g";
export type TagTone = "ok" | "warn" | "danger" | "neutral" | "accent";

/* —— En-tête de page —— */
export const GREETING = {
  name: "Camille",
  date: "Lundi 8 juin 2026 · Voici l'état de votre activité",
} as const;

/* —— KPI (4 cartes) —— */
export type KpiIcon = "revenue" | "clock" | "alert" | "quote";

type KpiFoot =
  | { type: "delta"; direction: "up" | "down"; delta: string; text: string }
  | { type: "detail"; strong: string; strongTone: "ink-2" | "danger"; text: string };

export type Kpi = {
  tone: Tone;
  icon: KpiIcon;
  label: string;
  value: string;
  unit: string;
  foot: KpiFoot;
};

export const KPIS: Kpi[] = [
  {
    tone: "a",
    icon: "revenue",
    label: "Chiffre d'affaires encaissé",
    value: "8 420",
    unit: "€",
    foot: { type: "delta", direction: "up", delta: "+18 %", text: "vs mois dernier" },
  },
  {
    tone: "w",
    icon: "clock",
    label: "Factures en attente",
    value: "3 150",
    unit: "€",
    foot: { type: "detail", strong: "4 factures", strongTone: "ink-2", text: "· à encaisser" },
  },
  {
    tone: "d",
    icon: "alert",
    label: "En retard de paiement",
    value: "1 080",
    unit: "€",
    foot: { type: "detail", strong: "2 factures", strongTone: "danger", text: "· à relancer" },
  },
  {
    tone: "g",
    icon: "quote",
    label: "Devis à relancer",
    value: "3",
    unit: "en attente",
    foot: { type: "detail", strong: "5 200 €", strongTone: "ink-2", text: "· potentiel" },
  },
];

/* —— Graphe CA : encaissé + en attente, 8 derniers mois (Nov → Juin) —— */
export type RevenuePoint = { m: string; paid: number; pending: number };

export const REVENUE_DATA: RevenuePoint[] = [
  { m: "Nov", paid: 5200, pending: 0 },
  { m: "Déc", paid: 6100, pending: 0 },
  { m: "Jan", paid: 4800, pending: 0 },
  { m: "Fév", paid: 5600, pending: 0 },
  { m: "Mar", paid: 7200, pending: 0 },
  { m: "Avr", paid: 6400, pending: 0 },
  { m: "Mai", paid: 7100, pending: 800 },
  { m: "Juin", paid: 8420, pending: 3150 },
];

/* —— Panneau « À traiter en priorité » —— */
export type PriorityItem = {
  initials: string;
  danger: boolean; // pastille d'initiales en rouge si facture en retard
  name: string;
  meta: string;
  amount: string;
  tag: { tone: TagTone; label: string };
};

export const PRIORITY_ITEMS: PriorityItem[] = [
  {
    initials: "SD",
    danger: true,
    name: "Studio Delmas",
    meta: "FAC-2026-031 · échéance dépassée de 12 j",
    amount: "680 €",
    tag: { tone: "danger", label: "En retard" },
  },
  {
    initials: "MR",
    danger: true,
    name: "Maison Roux",
    meta: "FAC-2026-028 · échéance dépassée de 5 j",
    amount: "400 €",
    tag: { tone: "danger", label: "En retard" },
  },
  {
    initials: "AL",
    danger: false,
    name: "Atelier Lumen",
    meta: "DEV-2026-014 · envoyé il y a 9 jours",
    amount: "2 400 €",
    tag: { tone: "warn", label: "À relancer" },
  },
  {
    initials: "NW",
    danger: false,
    name: "Nord Web",
    meta: "DEV-2026-016 · envoyé il y a 6 jours",
    amount: "1 800 €",
    tag: { tone: "warn", label: "À relancer" },
  },
];

/* —— Factures récentes —— */
export type RecentInvoice = {
  ref: string;
  client: string;
  due: string;
  status: { tone: TagTone; label: string };
  amount: string;
};

export const RECENT_INVOICES: RecentInvoice[] = [
  { ref: "FAC-2026-034", client: "Camille & Co", due: "15 juin", status: { tone: "ok", label: "Payée" }, amount: "1 440 €" },
  { ref: "FAC-2026-033", client: "Atelier Lumen", due: "22 juin", status: { tone: "warn", label: "En attente" }, amount: "2 280 €" },
  { ref: "FAC-2026-031", client: "Studio Delmas", due: "27 mai", status: { tone: "danger", label: "En retard" }, amount: "680 €" },
  { ref: "FAC-2026-030", client: "Nord Web", due: "10 juin", status: { tone: "ok", label: "Payée" }, amount: "3 600 €" },
  { ref: "FAC-2026-029", client: "Le Comptoir Vert", due: "2 juin", status: { tone: "ok", label: "Payée" }, amount: "960 €" },
];

/* —— Top clients · ce trimestre —— */
export type TopClient = { name: string; width: number; pct: string; muted?: boolean };

export const TOP_CLIENTS: TopClient[] = [
  { name: "Nord Web", width: 100, pct: "31 %" },
  { name: "Atelier Lumen", width: 74, pct: "23 %" },
  { name: "Camille & Co", width: 58, pct: "18 %" },
  { name: "Studio Delmas", width: 42, pct: "13 %" },
  { name: "Autres", width: 48, pct: "15 %", muted: true },
];
