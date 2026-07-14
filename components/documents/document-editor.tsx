"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  CheckCircle2,
  Download,
  Eye,
  FolderPlus,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatSiret } from "@/components/clients/format";
import {
  saveDraft,
  emitDocument,
  type ProjectPickerOption,
} from "@/app/(app)/documents/actions";
import {
  computeTotals,
  computeDueDate,
  formatEuros,
  legalMentions,
  lineHtCents,
  ALLOWED_TVA_RATES,
  PAYMENT_TERM_LABELS,
  type DocType,
  type PaymentTerm,
  type TvaRegime,
} from "@/lib/invoicing";

// Champs de saisie (reproduit `.input` / `.select` de la maquette).
const INPUT =
  "h-[42px] w-full rounded-md border border-line bg-surface px-[13px] text-sm text-ink transition-colors placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent-soft";
const FIELD_LABEL = "mb-1.5 block text-[13px] font-semibold text-ink-2";

// Ligne de prestation côté UI : montants SAISIS (euros / texte), convertis en
// centimes entiers pour les calculs et les actions serveur.
type EditorLine = {
  id: number;
  label: string;
  quantity: string; // ex. « 1 » ou « 1,5 »
  unitPriceEuros: string; // ex. « 1 200 » ou « 1 200,50 »
  tvaRate: number; // % parmi ALLOWED_TVA_RATES
};

// État d'enregistrement affiché dans la barre (indicateur autosave).
type SaveState = "idle" | "saving" | "saved";

// Nettoie une saisie numérique FR (espaces fines, virgule décimale).
function cleanNumeric(input: string): string {
  return input.replace(/[\s  ]/g, "").replace(",", ".");
}

// Euros saisis → centimes entiers (jamais de flottant stocké).
function eurosToCents(input: string): number {
  const n = parseFloat(cleanNumeric(input));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

// Quantité saisie → nombre décimal positif (0 si vide/invalide).
function parseQty(input: string): number {
  const n = parseFloat(cleanNumeric(input));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

// Date d'un <input type="date"> (YYYY-MM-DD) → Date UTC minuit (cohérent avec
// computeDueDate et la coercition zod côté serveur).
function parseIssued(value: string): Date {
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

// Date locale du jour au format attendu par <input type="date">.
function todayInputValue(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// Date → « JJ/MM/AAAA » (parts UTC, la source étant à minuit UTC).
function formatFrDate(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getUTCFullYear()}`;
}

// Taux de TVA → « 20 % » / « 5,5 % ».
function formatRate(rate: number): string {
  return `${String(rate).replace(".", ",")} %`;
}

// Initiales d'un nom (deux premières lettres significatives).
function initialsOf(source: string): string {
  const parts = source.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.slice(0, 2) || "?").toUpperCase();
}

let lineSeq = 0;
function makeLine(): EditorLine {
  return { id: ++lineSeq, label: "", quantity: "1", unitPriceEuros: "", tvaRate: 20 };
}

// Centimes entiers → saisie euros FR (« 1200 » ou « 1200,50 »), inverse
// d'eurosToCents pour recharger un brouillon existant.
function centsToEurosInput(cents: number): string {
  const euros = cents / 100;
  return Number.isInteger(euros)
    ? String(euros)
    : euros.toFixed(2).replace(".", ",");
}

// Brouillon existant rechargé dans l'éditeur (reprise / conversion, #61).
export type EditorInitialDocument = {
  id: string;
  object: string | null;
  sourceQuoteNumber: string | null; // devis d'origine si issu d'une conversion
  lines: {
    label: string;
    quantity: number;
    unitPriceCents: number;
    tvaRate: number;
  }[];
};

export function DocumentEditor({
  projects,
  emitterName,
  regime,
  initialType = "facture",
  initialProjectId = "",
  initialDocument = null,
}: {
  projects: ProjectPickerOption[];
  emitterName: string;
  regime: TvaRegime;
  // Présélection depuis un point d'entrée (fiche projet) — validés côté page.
  initialType?: DocType;
  initialProjectId?: string;
  // Brouillon à reprendre (validé côté page : appartenance + statut brouillon).
  initialDocument?: EditorInitialDocument | null;
}) {
  const hasProjects = projects.length > 0;

  const [type, setType] = useState<DocType>(initialType);
  const [projectId, setProjectId] = useState(initialProjectId);
  const [issuedAt, setIssuedAt] = useState(todayInputValue());
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerm>("net30");
  const [object, setObject] = useState(initialDocument?.object ?? "");
  const [lines, setLines] = useState<EditorLine[]>(() =>
    initialDocument && initialDocument.lines.length > 0
      ? initialDocument.lines.map((l) => ({
          id: ++lineSeq,
          label: l.label,
          quantity: String(l.quantity).replace(".", ","),
          unitPriceEuros: centsToEurosInput(l.unitPriceCents),
          // Un taux hors liste (donnée ancienne) retombe sur 20 % — le serveur
          // revalide de toute façon à l'enregistrement/émission.
          tvaRate: (ALLOWED_TVA_RATES as readonly number[]).includes(l.tvaRate)
            ? l.tvaRate
            : 20,
        }))
      : [makeLine()],
  );

  const [docId, setDocId] = useState<string | null>(initialDocument?.id ?? null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emitted, setEmitted] = useState<{ number: string } | null>(null);

  // En franchise en base, la TVA est TOUJOURS 0 (art. 293 B) : le serveur
  // l'impose, l'aperçu le reflète pour rester fidèle au document émis.
  const franchise = regime === "franchise";
  const effRate = (rate: number) => (franchise ? 0 : rate);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projects, projectId],
  );

  // Totaux live — mêmes fonctions pures que le calcul autoritatif serveur.
  const totals = useMemo(
    () =>
      computeTotals(
        lines.map((l) => ({
          quantity: parseQty(l.quantity),
          unitPriceCents: eurosToCents(l.unitPriceEuros),
          tvaRate: effRate(l.tvaRate),
        })),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, franchise],
  );

  const issuedDate = useMemo(() => parseIssued(issuedAt), [issuedAt]);
  const dueDate = useMemo(
    () => computeDueDate(issuedDate, paymentTerms),
    [issuedDate, paymentTerms],
  );

  // Lignes réellement portées à l'aperçu / envoyées (désignation renseignée).
  const previewLines = lines.filter((l) => l.label.trim() !== "");
  const validLines = lines.filter(
    (l) => l.label.trim() !== "" && parseQty(l.quantity) > 0,
  );
  const canEmit = Boolean(projectId) && validLines.length > 0;

  const mentions = useMemo(
    () => legalMentions({ type, regime }),
    [type, regime],
  );

  // Annonce polie et débrouillée du total (évite de spammer le lecteur d'écran).
  const [liveMsg, setLiveMsg] = useState("");
  useEffect(() => {
    const t = setTimeout(
      () => setLiveMsg(`Total TTC : ${formatEuros(totals.totalTtcCents)}`),
      500,
    );
    return () => clearTimeout(t);
  }, [totals.totalTtcCents]);

  // Toute modification invalide l'état « enregistré » précédent.
  function markDirty() {
    setSaveState((s) => (s === "saved" ? "idle" : s));
    setError(null);
  }

  function updateLine(id: number, patch: Partial<EditorLine>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    markDirty();
  }
  function addLine() {
    setLines((prev) => [...prev, makeLine()]);
    markDirty();
  }
  function removeLine(id: number) {
    setLines((prev) =>
      prev.length > 1 ? prev.filter((l) => l.id !== id) : prev,
    );
    markDirty();
  }

  // Payload commun aux deux actions (lignes valides uniquement).
  function buildInput() {
    return {
      id: docId ?? undefined,
      type,
      projectId,
      object: object.trim() || undefined,
      issuedAt,
      paymentTerms,
      lines: validLines.map((l) => ({
        label: l.label.trim(),
        quantity: parseQty(l.quantity),
        unitPriceCents: eurosToCents(l.unitPriceEuros),
        tvaRate: effRate(l.tvaRate),
      })),
    };
  }

  async function handleSaveDraft() {
    if (!projectId) {
      setError("Sélectionnez un projet avant d'enregistrer.");
      return;
    }
    setBusy(true);
    setSaveState("saving");
    setError(null);
    const res = await saveDraft(buildInput());
    if ("error" in res) {
      setError(res.error);
      setSaveState("idle");
    } else {
      setDocId(res.id);
      setSaveState("saved");
    }
    setBusy(false);
  }

  async function handleEmit() {
    if (!canEmit) return;
    setBusy(true);
    setError(null);
    const res = await emitDocument(buildInput());
    if ("error" in res) {
      setError(res.error);
    } else {
      setDocId(res.id);
      setEmitted({ number: res.number });
    }
    setBusy(false);
  }

  // Réinitialise l'éditeur pour un nouveau document (après émission).
  function resetEditor() {
    setType("facture");
    setProjectId("");
    setIssuedAt(todayInputValue());
    setPaymentTerms("net30");
    setObject("");
    setLines([makeLine()]);
    setDocId(null);
    setSaveState("idle");
    setError(null);
    setEmitted(null);
  }

  const typeLabel = type === "facture" ? "facture" : "devis";
  const backHref = type === "facture" ? "/factures" : "/devis";

  // ---- Écran de confirmation après émission --------------------------------
  if (emitted) {
    const kindWord = type === "facture" ? "Facture" : "Devis";
    const emisAccord = type === "facture" ? "émise" : "émis";
    return (
      <div className="grid h-[calc(100vh-var(--topbar-h)-56px)] place-items-center overflow-hidden rounded-lg border border-line bg-surface shadow-sm max-[1180px]:h-auto max-[1180px]:py-16">
        <div className="flex max-w-[420px] flex-col items-center px-6 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-ok-soft text-ok-ink">
            <CheckCircle2 className="h-7 w-7" strokeWidth={2} aria-hidden />
          </div>
          <h2 className="mt-4 text-[19px] font-[750] tracking-[-0.02em]">
            {kindWord} <span className="num">{emitted.number}</span> {emisAccord}
          </h2>
          <p className="mt-2 text-[13.5px] leading-[1.55] text-ink-2">
            Le document a été numéroté et enregistré. Vous pourrez le télécharger
            en PDF prochainement.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
            <Button variant="primary" onClick={resetEditor}>
              <Plus strokeWidth={2} />
              Nouveau document
            </Button>
            <Button asChild variant="default">
              <Link href="/dashboard">Tableau de bord</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Éditeur -------------------------------------------------------------
  return (
    <div className="grid h-[calc(100vh-var(--topbar-h)-56px)] grid-cols-2 overflow-hidden rounded-lg border border-line bg-surface shadow-sm max-[1180px]:h-auto max-[1180px]:grid-cols-1">
      {/* ============ Colonne formulaire ============ */}
      <div className="flex min-w-0 flex-col bg-bg max-[1180px]:min-h-0">
        {/* Barre éditeur */}
        <div className="flex h-topbar flex-none items-center gap-[14px] border-b border-line bg-surface px-6">
          <Link
            href={backHref}
            title={`Retour aux ${typeLabel}s`}
            aria-label={`Retour aux ${typeLabel}s`}
            className="grid h-9 w-9 flex-none place-items-center rounded-[9px] border border-line bg-surface text-ink-2 transition-colors hover:bg-surface-2"
          >
            <ArrowLeft className="h-[17px] w-[17px]" strokeWidth={2} aria-hidden />
          </Link>
          <div className="min-w-0">
            <div className="truncate text-base font-bold tracking-[-0.01em]">
              {type === "facture" ? "Nouvelle facture" : "Nouveau devis"}
            </div>
            <small className="block truncate text-[12px] font-medium text-ink-3">
              {initialDocument?.sourceQuoteNumber ? (
                <>
                  Brouillon · créé depuis le devis{" "}
                  <span className="num">
                    {initialDocument.sourceQuoteNumber}
                  </span>
                </>
              ) : (
                "Brouillon"
              )}
            </small>
          </div>
          <div className="ml-auto flex items-center gap-2.5">
            {/* Indicateur d'enregistrement (autosave) */}
            <span
              className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-3"
              aria-live="polite"
            >
              <i
                className={cn(
                  "h-[7px] w-[7px] flex-none rounded-full",
                  saveState === "saved"
                    ? "bg-ok"
                    : saveState === "saving"
                      ? "bg-warn"
                      : "bg-line",
                )}
              />
              {saveState === "saved"
                ? "Enregistré"
                : saveState === "saving"
                  ? "Enregistrement…"
                  : "Non enregistré"}
            </span>
            {/* Segment Facture / Devis */}
            <div
              role="group"
              aria-label="Type de document"
              className="inline-flex rounded-md border border-line bg-surface-2 p-[3px]"
            >
              {(["facture", "devis"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={type === t}
                  onClick={() => {
                    setType(t);
                    markDirty();
                  }}
                  className={cn(
                    "rounded-[7px] px-[14px] py-1.5 text-[13px] font-semibold transition-colors",
                    type === t
                      ? "bg-surface text-ink shadow-sm"
                      : "text-ink-2 hover:text-ink",
                  )}
                >
                  {t === "facture" ? "Facture" : "Devis"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Formulaire défilant */}
        <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-[60px] pt-[26px]">
          {/* 1 · Projet */}
          <section className="mb-[30px]">
            <SectionTitle step={1}>Projet</SectionTitle>
            {hasProjects ? (
              <>
                <div className="mb-3">
                  <label htmlFor="fProject" className={FIELD_LABEL}>
                    Projet
                  </label>
                  <div className="relative">
                    <select
                      id="fProject"
                      className={cn(INPUT, "cursor-pointer appearance-none pr-[38px]")}
                      value={projectId}
                      onChange={(e) => {
                        setProjectId(e.target.value);
                        markDirty();
                      }}
                    >
                      <option value="" disabled>
                        Sélectionner un projet…
                      </option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — {p.clientName}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
                      strokeWidth={2}
                      aria-hidden
                    />
                  </div>
                </div>

                {selectedProject && (
                  <div className="flex items-center gap-[13px] rounded-md border border-line bg-surface px-[15px] py-[13px]">
                    <div className="grid h-10 w-10 flex-none place-items-center rounded-[10px] bg-accent-soft text-[13px] font-bold text-accent-ink">
                      {initialsOf(selectedProject.clientName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <b className="block text-[14.5px]">
                        {selectedProject.clientName}
                      </b>
                      <small className="num block text-[12.5px] text-ink-3">
                        {selectedProject.clientSiret
                          ? `SIRET ${formatSiret(selectedProject.clientSiret)}`
                          : "SIRET non renseigné"}{" "}
                        · {selectedProject.name}
                      </small>
                    </div>
                  </div>
                )}
              </>
            ) : (
              // Cas « aucun projet » : un document appartient à un projet.
              <div className="flex flex-col items-center gap-3 rounded-md border border-line-soft bg-surface-2 px-6 py-8 text-center">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-accent-soft text-accent-ink">
                  <FolderPlus className="h-5 w-5" strokeWidth={2} aria-hidden />
                </div>
                <div className="text-sm font-semibold text-ink">
                  Créez d&apos;abord un projet
                </div>
                <p className="max-w-[320px] text-[13px] leading-[1.5] text-ink-3">
                  Un document est toujours rattaché à un projet, qui porte le
                  client à facturer.
                </p>
                <Button asChild variant="primary" className="mt-1">
                  <Link href="/projets">
                    <FolderPlus strokeWidth={2} />
                    Aller aux projets
                  </Link>
                </Button>
              </div>
            )}
          </section>

          {/* 2 · Informations */}
          <section className="mb-[30px]">
            <SectionTitle step={2}>Informations</SectionTitle>
            <div className="mb-3 grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="fDate" className={FIELD_LABEL}>
                  Date d&apos;émission
                </label>
                <input
                  id="fDate"
                  type="date"
                  className={cn(INPUT, "num")}
                  value={issuedAt}
                  onChange={(e) => {
                    setIssuedAt(e.target.value);
                    markDirty();
                  }}
                />
              </div>
              <div>
                <label htmlFor="fTerms" className={FIELD_LABEL}>
                  Conditions de paiement
                </label>
                <div className="relative">
                  <select
                    id="fTerms"
                    className={cn(INPUT, "cursor-pointer appearance-none pr-[38px]")}
                    value={paymentTerms}
                    onChange={(e) => {
                      setPaymentTerms(e.target.value as PaymentTerm);
                      markDirty();
                    }}
                  >
                    {(
                      Object.keys(PAYMENT_TERM_LABELS) as PaymentTerm[]
                    ).map((term) => (
                      <option key={term} value={term}>
                        {PAYMENT_TERM_LABELS[term]}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
                    strokeWidth={2}
                    aria-hidden
                  />
                </div>
              </div>
            </div>
            <div>
              <label htmlFor="fObject" className={FIELD_LABEL}>
                Objet
              </label>
              <input
                id="fObject"
                type="text"
                placeholder="Ex. : Refonte du site vitrine"
                className={INPUT}
                value={object}
                onChange={(e) => {
                  setObject(e.target.value);
                  markDirty();
                }}
              />
            </div>
          </section>

          {/* 3 · Prestations */}
          <section className="mb-[30px]">
            <SectionTitle step={3}>Prestations</SectionTitle>

            {/* En-têtes de colonnes */}
            <div className="grid grid-cols-[1fr_64px_92px_84px_96px_32px] items-center gap-[9px] px-0.5 pb-2 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-ink-3">
              <span>Description</span>
              <span className="text-right">Qté</span>
              <span className="text-right">PU HT</span>
              <span>TVA</span>
              <span className="text-right">Total HT</span>
              <span />
            </div>

            {lines.map((l, i) => {
              const htCents = lineHtCents(
                parseQty(l.quantity),
                eurosToCents(l.unitPriceEuros),
              );
              return (
                <div
                  key={l.id}
                  className="mb-[9px] grid grid-cols-[1fr_64px_92px_84px_96px_32px] items-center gap-[9px]"
                >
                  <input
                    type="text"
                    aria-label={`Description de la ligne ${i + 1}`}
                    placeholder="Prestation…"
                    className={cn(INPUT, "h-10 text-[13.5px]")}
                    value={l.label}
                    onChange={(e) => updateLine(l.id, { label: e.target.value })}
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    aria-label={`Quantité de la ligne ${i + 1}`}
                    className={cn(INPUT, "h-10 num text-right text-[13px]")}
                    value={l.quantity}
                    onChange={(e) =>
                      updateLine(l.id, { quantity: e.target.value })
                    }
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    aria-label={`Prix unitaire HT de la ligne ${i + 1}`}
                    placeholder="0"
                    className={cn(INPUT, "h-10 num text-right text-[13px]")}
                    value={l.unitPriceEuros}
                    onChange={(e) =>
                      updateLine(l.id, { unitPriceEuros: e.target.value })
                    }
                  />
                  <div className="relative">
                    <select
                      aria-label={`Taux de TVA de la ligne ${i + 1}`}
                      disabled={franchise}
                      className={cn(
                        INPUT,
                        "h-10 num cursor-pointer appearance-none pr-[30px] text-[13px] disabled:cursor-not-allowed disabled:opacity-60",
                      )}
                      value={franchise ? 0 : l.tvaRate}
                      onChange={(e) =>
                        updateLine(l.id, { tvaRate: Number(e.target.value) })
                      }
                    >
                      {ALLOWED_TVA_RATES.map((rate) => (
                        <option key={rate} value={rate}>
                          {formatRate(rate)}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
                      strokeWidth={2}
                      aria-hidden
                    />
                  </div>
                  <div className="num whitespace-nowrap pr-0.5 text-right text-[13.5px] font-semibold">
                    {formatEuros(htCents)}
                  </div>
                  <button
                    type="button"
                    aria-label={`Supprimer la ligne ${i + 1}`}
                    disabled={lines.length <= 1}
                    onClick={() => removeLine(l.id)}
                    className="grid h-[30px] w-[30px] place-items-center rounded-[7px] text-ink-3 transition-colors hover:bg-danger-soft hover:text-danger-ink disabled:pointer-events-none disabled:opacity-40"
                  >
                    <Trash2 className="h-[15px] w-[15px]" strokeWidth={2} aria-hidden />
                  </button>
                </div>
              );
            })}

            <button
              type="button"
              onClick={addLine}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-line px-4 py-2.5 text-[13.5px] font-semibold text-accent-ink transition-colors hover:border-accent hover:bg-accent-soft"
            >
              <Plus className="h-4 w-4" strokeWidth={2.2} aria-hidden />
              Ajouter une ligne
            </button>

            {/* Totaux */}
            <div className="ml-auto mt-[18px] w-[300px]">
              <div className="flex justify-between px-0.5 py-[7px] text-sm">
                <span className="text-ink-2">Total HT</span>
                <span className="num font-[550]">
                  {formatEuros(totals.totalHtCents)}
                </span>
              </div>
              <div className="flex justify-between px-0.5 py-[7px] text-sm">
                <span className="text-ink-2">TVA</span>
                <span className="num font-[550]">
                  {formatEuros(totals.totalTvaCents)}
                </span>
              </div>
              <div className="mt-[7px] flex justify-between border-t-2 border-ink px-0.5 pt-3">
                <span className="text-[15px] font-bold text-ink">Total TTC</span>
                <span className="num text-[19px] font-bold text-accent-ink">
                  {formatEuros(totals.totalTtcCents)}
                </span>
              </div>
            </div>
          </section>

          {/* 4 · Mentions légales */}
          <section>
            <SectionTitle step={4}>Mentions légales</SectionTitle>
            <div className="flex items-start gap-[11px] rounded-md bg-accent-soft px-[15px] py-[13px] text-[13px] leading-[1.5] text-accent-ink">
              <ShieldCheck
                className="mt-px h-[17px] w-[17px] flex-none"
                strokeWidth={2}
                aria-hidden
              />
              <div>
                Les mentions obligatoires (pénalités de retard, indemnité
                forfaitaire de 40 €, escompte) sont{" "}
                <b>ajoutées automatiquement</b> au document, conformément au Code
                de commerce.
              </div>
            </div>
          </section>

          {error && (
            <div
              role="alert"
              className="mt-5 rounded-md bg-danger-soft px-3.5 py-2.5 text-[13px] font-medium text-danger-ink"
            >
              {error}
            </div>
          )}
        </div>
      </div>

      {/* ============ Colonne aperçu ============ */}
      <div className="flex min-w-0 flex-col border-l border-line bg-surface-2 max-[1180px]:border-l-0 max-[1180px]:border-t">
        {/* Barre aperçu */}
        <div className="flex h-topbar flex-none items-center gap-3 border-b border-line px-6">
          <span className="flex items-center gap-[9px] text-[14px] font-[650] text-ink-2">
            <Eye className="h-4 w-4" strokeWidth={2} aria-hidden />
            Aperçu du document
          </span>
          <div className="ml-auto flex items-center gap-2.5">
            <Button
              variant="default"
              size="sm"
              disabled={!projectId || busy}
              onClick={handleSaveDraft}
            >
              {saveState === "saved" ? "Brouillon enregistré" : "Enregistrer en brouillon"}
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled
              title="Bientôt disponible (#9)"
            >
              <Download strokeWidth={2} />
              PDF
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!canEmit || busy}
              onClick={handleEmit}
            >
              <Send strokeWidth={2} />
              Émettre
            </Button>
          </div>
        </div>

        {/* Papier A4 — fond blanc fixe dans les deux thèmes (exception assumée) */}
        <div
          className="min-h-0 flex-1 overflow-y-auto p-[30px]"
          role="region"
          aria-label="Aperçu du document en temps réel"
        >
          <span className="sr-only" aria-live="polite">
            {liveMsg}
          </span>
          <div className="mx-auto flex justify-center">
            <div className="flex h-fit w-[595px] min-h-[842px] flex-none flex-col rounded-[4px] bg-white p-[48px_52px] text-[11.5px] leading-[1.5] text-[oklch(0.25_0.01_75)] shadow-lg">
              {/* En-tête : émetteur + badge */}
              <div className="mb-[38px] flex items-start justify-between">
                <div className="text-[oklch(0.42_0.012_75)]">
                  <b className="mb-[3px] block text-[14px]">{emitterName}</b>
                  {/* Coordonnées émetteur non renseignables tant que #12 n'est pas fait */}
                  <span className="italic">Adresse à compléter dans Paramètres</span>
                  <br />
                  <span className="font-mono text-[10px]">
                    SIRET à compléter · TVA à compléter
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-[21px] font-extrabold tracking-[-0.02em] text-[oklch(0.40_0.15_264)]">
                    {type === "facture" ? "FACTURE" : "DEVIS"}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-[oklch(0.45_0.012_75)]">
                    {/* Dans l'éditeur, le document est toujours un brouillon ;
                        une fois émis, on affiche l'écran de confirmation. */}
                    Brouillon
                  </div>
                </div>
              </div>

              {/* Méta */}
              <div className="mb-[30px] flex gap-9">
                <div>
                  <DocLabel>Date d&apos;émission</DocLabel>
                  <div className="font-mono font-semibold">
                    {formatFrDate(issuedDate)}
                  </div>
                </div>
                <div>
                  <DocLabel>Échéance</DocLabel>
                  <div className="font-mono font-semibold">
                    {formatFrDate(dueDate)}
                  </div>
                </div>
                <div>
                  <DocLabel>Objet</DocLabel>
                  <div className="font-semibold">{object.trim() || "—"}</div>
                </div>
              </div>

              {/* Facturé à */}
              <div className="mb-[30px] rounded-[8px] bg-[oklch(0.975_0.005_95)] px-4 py-[13px]">
                <DocLabel>Facturé à</DocLabel>
                {selectedProject ? (
                  <>
                    <b className="text-[13px]">{selectedProject.clientName}</b>
                    <br />
                    <span className="font-mono text-[10px]">
                      {selectedProject.clientSiret
                        ? `SIRET ${formatSiret(selectedProject.clientSiret)}`
                        : "SIRET non renseigné"}
                    </span>
                  </>
                ) : (
                  <b className="text-[13px]">—</b>
                )}
              </div>

              {/* Table des prestations */}
              <table className="mb-[22px] w-full border-collapse">
                <thead>
                  <tr>
                    <th className="border-b-[1.5px] border-[oklch(0.25_0.01_75)] px-2 pb-[7px] text-left text-[9px] font-bold uppercase tracking-[0.08em] text-[oklch(0.5_0.01_75)]">
                      Description
                    </th>
                    <th className="border-b-[1.5px] border-[oklch(0.25_0.01_75)] px-2 pb-[7px] text-right text-[9px] font-bold uppercase tracking-[0.08em] text-[oklch(0.5_0.01_75)]">
                      Qté
                    </th>
                    <th className="border-b-[1.5px] border-[oklch(0.25_0.01_75)] px-2 pb-[7px] text-right text-[9px] font-bold uppercase tracking-[0.08em] text-[oklch(0.5_0.01_75)]">
                      PU HT
                    </th>
                    <th className="border-b-[1.5px] border-[oklch(0.25_0.01_75)] px-2 pb-[7px] text-right text-[9px] font-bold uppercase tracking-[0.08em] text-[oklch(0.5_0.01_75)]">
                      TVA
                    </th>
                    <th className="border-b-[1.5px] border-[oklch(0.25_0.01_75)] px-2 pb-[7px] text-right text-[9px] font-bold uppercase tracking-[0.08em] text-[oklch(0.5_0.01_75)]">
                      Total HT
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {previewLines.length > 0 ? (
                    previewLines.map((l) => {
                      const q = parseQty(l.quantity);
                      const pu = eurosToCents(l.unitPriceEuros);
                      return (
                        <tr key={l.id}>
                          <td className="border-b border-[oklch(0.92_0.005_95)] px-2 py-[9px] align-top font-[550]">
                            {l.label}
                          </td>
                          <td className="border-b border-[oklch(0.92_0.005_95)] px-2 py-[9px] text-right align-top font-mono text-[10.5px]">
                            {String(q).replace(".", ",")}
                          </td>
                          <td className="whitespace-nowrap border-b border-[oklch(0.92_0.005_95)] px-2 py-[9px] text-right align-top font-mono text-[10.5px]">
                            {formatEuros(pu)}
                          </td>
                          <td className="border-b border-[oklch(0.92_0.005_95)] px-2 py-[9px] text-right align-top font-mono text-[10.5px]">
                            {formatRate(effRate(l.tvaRate))}
                          </td>
                          <td className="whitespace-nowrap border-b border-[oklch(0.92_0.005_95)] px-2 py-[9px] text-right align-top font-mono text-[10.5px]">
                            {formatEuros(lineHtCents(q, pu))}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td
                        colSpan={5}
                        className="border-b border-[oklch(0.92_0.005_95)] px-2 py-[9px] italic text-[oklch(0.6_0.01_75)]"
                      >
                        Ajoutez une prestation pour la voir apparaître ici.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Totaux document */}
              <div className="ml-auto w-[230px]">
                <div className="flex justify-between px-2 py-1">
                  <span>Total HT</span>
                  <span className="font-mono text-[10.5px]">
                    {formatEuros(totals.totalHtCents)}
                  </span>
                </div>
                <div className="flex justify-between px-2 py-1">
                  <span>TVA</span>
                  <span className="font-mono text-[10.5px]">
                    {formatEuros(totals.totalTvaCents)}
                  </span>
                </div>
                <div className="mt-1.5 flex justify-between rounded-[6px] bg-[oklch(0.95_0.035_264)] px-2.5 py-[9px]">
                  <span className="font-bold">Total TTC</span>
                  <span className="font-mono text-[13px] font-bold text-[oklch(0.40_0.15_264)]">
                    {formatEuros(totals.totalTtcCents)}
                  </span>
                </div>
              </div>

              {/* Pied : règlement + mentions légales */}
              <div className="mt-auto pt-[28px]">
                <div className="flex gap-[30px] border-t border-[oklch(0.92_0.005_95)] py-[13px]">
                  <div>
                    <DocLabel>Règlement par virement</DocLabel>
                    <span className="font-mono text-[10px]">
                      IBAN à compléter dans Paramètres
                    </span>
                  </div>
                </div>
                <div className="border-t border-[oklch(0.92_0.005_95)] pt-2.5 text-[8.5px] leading-[1.6] text-[oklch(0.55_0.01_75)]">
                  {mentions.join(" ")}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Titre de section avec pastille d'étape (reproduit `.fsection > h3`).
function SectionTitle({
  step,
  children,
}: {
  step: number;
  children: React.ReactNode;
}) {
  return (
    <h3 className="mb-[13px] flex items-center gap-[9px] text-[12px] font-semibold uppercase tracking-[0.07em] text-ink-3">
      <span className="num grid h-[21px] w-[21px] place-items-center rounded-full bg-accent-soft text-[11px] text-accent-ink">
        {step}
      </span>
      {children}
    </h3>
  );
}

// Petit label du document A4 (reproduit `.doc-meta label` / `.doc-client label`).
function DocLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-0.5 block text-[9px] font-bold uppercase tracking-[0.09em] text-[oklch(0.55_0.01_75)]">
      {children}
    </label>
  );
}
