"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

// Trois documents navigables par hash (#mentions, #cgu, #confidentialite).
const DOCS = ["mentions", "cgu", "confidentialite"] as const;
type Doc = (typeof DOCS)[number];

const TOC: { id: Doc; label: string }[] = [
  { id: "mentions", label: "Mentions légales" },
  { id: "cgu", label: "CGU & CGV" },
  { id: "confidentialite", label: "Politique de confidentialité" },
];

// Navigation entre les trois documents (par hash, partageable) — reproduit
// la logique du <script> de la maquette : un seul document visible, toc active,
// scroll en haut à chaque changement.
export function LegalDocs() {
  const [active, setActive] = useState<Doc>("mentions");

  useEffect(() => {
    function fromHash() {
      const name = (window.location.hash || "#mentions").slice(1);
      setActive(DOCS.includes(name as Doc) ? (name as Doc) : "mentions");
      document.documentElement.scrollTop = 0;
    }
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  return (
    <div className="mx-auto grid max-w-[1020px] grid-cols-[230px_1fr] items-start gap-11 px-7 pb-[60px] pt-[34px] max-[860px]:grid-cols-1 max-[860px]:gap-6">
      {/* —— Sommaire —— */}
      <nav
        className="sticky top-7 flex flex-col gap-0.5 max-[860px]:static max-[860px]:flex-row max-[860px]:flex-wrap"
        aria-label="Documents légaux"
      >
        <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3 max-[860px]:hidden">
          Informations légales
        </div>
        {TOC.map((doc) => {
          const isActive = active === doc.id;
          return (
            <a
              key={doc.id}
              href={`#${doc.id}`}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "rounded-sm px-3 py-[9px] text-sm font-[550] transition-colors",
                isActive
                  ? "bg-accent-soft font-[650] text-accent-ink"
                  : "text-ink-2 hover:bg-surface-2 hover:text-ink"
              )}
            >
              {doc.label}
            </a>
          );
        })}
        <Link
          href="/"
          className="mt-[18px] flex items-center gap-[7px] border-t border-line-soft pt-4 text-[13px] text-ink-3 transition-colors hover:text-ink max-[860px]:hidden"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          Retour à l&apos;accueil
        </Link>
      </nav>

      {/* —— Corps de texte —— */}
      <div className="max-w-[660px]">
        {/* ===== MENTIONS LÉGALES ===== */}
        <section className={cn(active !== "mentions" && "hidden")}>
          <h1 className="mb-1.5 text-[27px] font-extrabold tracking-[-0.03em]">
            Mentions légales
          </h1>
          <div className="mb-[30px] font-mono text-[13px] text-ink-3">
            Dernière mise à jour : 1ᵉʳ juin 2026
          </div>

          <h2 className="mb-2.5 mt-[30px] text-[16.5px] font-bold tracking-[-0.015em]">
            1. Éditeur du site
          </h2>
          <p className="mb-3 text-[14.5px] leading-[1.7] text-ink-2 [text-wrap:pretty]">
            Le site et l&apos;application <b className="font-[650] text-ink">Freelance Flow</b>{" "}
            sont édités par{" "}
            <b className="font-[650] text-ink">Freelance Flow SAS</b>, société par
            actions simplifiée au capital de 10 000 €, immatriculée au RCS de Lyon
            sous le numéro 914 728 305, dont le siège social est situé 18 rue des
            Capucins, 69001 Lyon, France.
          </p>
          <ul className="mb-3 ml-5 list-disc space-y-1.5">
            <li className="text-[14.5px] leading-[1.6] text-ink-2">
              <b className="font-[650] text-ink">N° TVA intracommunautaire :</b> FR 27
              914728305
            </li>
            <li className="text-[14.5px] leading-[1.6] text-ink-2">
              <b className="font-[650] text-ink">Directrice de la publication :</b>{" "}
              Camille Laurent
            </li>
            <li className="text-[14.5px] leading-[1.6] text-ink-2">
              <b className="font-[650] text-ink">Contact :</b>{" "}
              <a
                href="mailto:contact@freelanceflow.fr"
                className="font-[550] text-accent-ink hover:underline"
              >
                contact@freelanceflow.fr
              </a>
            </li>
          </ul>

          <h2 className="mb-2.5 mt-[30px] text-[16.5px] font-bold tracking-[-0.015em]">
            2. Hébergement
          </h2>
          <p className="mb-3 text-[14.5px] leading-[1.7] text-ink-2 [text-wrap:pretty]">
            L&apos;interface de l&apos;application est hébergée par{" "}
            <b className="font-[650] text-ink">Vercel Inc.</b>, 440 N Barranca Ave
            #4133, Covina, CA 91723, États-Unis (
            <a
              href="https://vercel.com"
              rel="noopener"
              className="font-[550] text-accent-ink hover:underline"
            >
              vercel.com
            </a>
            ).
          </p>
          <p className="mb-3 text-[14.5px] leading-[1.7] text-ink-2 [text-wrap:pretty]">
            Les données (base de données, authentification, fichiers) sont hébergées
            par <b className="font-[650] text-ink">Supabase</b>, sur une
            infrastructure localisée dans l&apos;Union européenne — région{" "}
            <b className="font-[650] text-ink">eu-central-1 (Francfort, Allemagne)</b>.
            Aucune donnée métier n&apos;est stockée hors de l&apos;Union européenne.
          </p>

          <h2 className="mb-2.5 mt-[30px] text-[16.5px] font-bold tracking-[-0.015em]">
            3. Propriété intellectuelle
          </h2>
          <p className="mb-3 text-[14.5px] leading-[1.7] text-ink-2 [text-wrap:pretty]">
            L&apos;ensemble des éléments composant le service (interface, textes,
            logos, charte graphique, code) est protégé par le droit de la propriété
            intellectuelle et demeure la propriété exclusive de Freelance Flow SAS.
            Toute reproduction, même partielle, est soumise à autorisation écrite
            préalable.
          </p>
          <p className="mb-3 text-[14.5px] leading-[1.7] text-ink-2 [text-wrap:pretty]">
            Les documents (devis, factures) générés par les utilisateurs et les
            données qu&apos;ils saisissent restent leur entière propriété.
          </p>

          <h2 className="mb-2.5 mt-[30px] text-[16.5px] font-bold tracking-[-0.015em]">
            4. Signalement
          </h2>
          <p className="mb-3 text-[14.5px] leading-[1.7] text-ink-2 [text-wrap:pretty]">
            Pour signaler un contenu ou un dysfonctionnement :{" "}
            <a
              href="mailto:contact@freelanceflow.fr"
              className="font-[550] text-accent-ink hover:underline"
            >
              contact@freelanceflow.fr
            </a>
            . Nous nous engageons à répondre sous 72 heures ouvrées.
          </p>
        </section>

        {/* ===== CGU / CGV ===== */}
        <section className={cn(active !== "cgu" && "hidden")}>
          <h1 className="mb-1.5 text-[27px] font-extrabold tracking-[-0.03em]">
            Conditions générales d&apos;utilisation et de vente
          </h1>
          <div className="mb-[30px] font-mono text-[13px] text-ink-3">
            Version 1.2 — en vigueur au 1ᵉʳ juin 2026
          </div>

          <h2 className="mb-2.5 mt-[30px] text-[16.5px] font-bold tracking-[-0.015em]">
            1. Objet
          </h2>
          <p className="mb-3 text-[14.5px] leading-[1.7] text-ink-2 [text-wrap:pretty]">
            Les présentes conditions encadrent l&apos;utilisation du service Freelance
            Flow, application de gestion d&apos;activité destinée aux travailleurs
            indépendants : gestion de clients, devis, factures, suivi des paiements et
            relances.
          </p>
          <p className="mb-3 text-[14.5px] leading-[1.7] text-ink-2 [text-wrap:pretty]">
            La création d&apos;un compte emporte acceptation pleine et entière des
            présentes conditions.
          </p>

          <h2 className="mb-2.5 mt-[30px] text-[16.5px] font-bold tracking-[-0.015em]">
            2. Compte et accès au service
          </h2>
          <p className="mb-3 text-[14.5px] leading-[1.7] text-ink-2 [text-wrap:pretty]">
            Le service est réservé aux{" "}
            <b className="font-[650] text-ink">professionnels</b> (B2B) au sens du Code
            de la consommation. L&apos;utilisateur garantit l&apos;exactitude des
            informations fournies, notamment son numéro SIRET et son régime de TVA, qui
            figurent sur les documents émis.
          </p>
          <p className="mb-3 text-[14.5px] leading-[1.7] text-ink-2 [text-wrap:pretty]">
            L&apos;utilisateur est responsable de la confidentialité de ses
            identifiants. Toute connexion effectuée depuis son compte est réputée
            effectuée par lui.
          </p>

          <h2 className="mb-2.5 mt-[30px] text-[16.5px] font-bold tracking-[-0.015em]">
            3. Offres et tarifs
          </h2>
          <ul className="mb-3 ml-5 list-disc space-y-1.5">
            <li className="text-[14.5px] leading-[1.6] text-ink-2">
              <b className="font-[650] text-ink">Forfait Gratuit :</b> 5 documents
              (devis ou factures) par mois, clients et projets illimités, export PDF
              avec filigrane.
            </li>
            <li className="text-[14.5px] leading-[1.6] text-ink-2">
              <b className="font-[650] text-ink">Forfait Premium :</b> 15 € HT/mois (ou
              144 € HT/an, soit deux mois offerts) — documents illimités, relances
              automatiques, personnalisation des documents, statistiques avancées.
            </li>
          </ul>
          <p className="mb-3 text-[14.5px] leading-[1.7] text-ink-2 [text-wrap:pretty]">
            Les prix s&apos;entendent hors taxes. L&apos;abonnement est{" "}
            <b className="font-[650] text-ink">sans engagement</b> : il se renouvelle
            tacitement à chaque échéance et peut être résilié à tout moment depuis la
            page Abonnement, avec effet à la fin de la période en cours.
          </p>

          <h2 className="mb-2.5 mt-[30px] text-[16.5px] font-bold tracking-[-0.015em]">
            4. Paiement
          </h2>
          <p className="mb-3 text-[14.5px] leading-[1.7] text-ink-2 [text-wrap:pretty]">
            Le paiement s&apos;effectue par carte bancaire via un prestataire de
            paiement sécurisé. En cas d&apos;échec de paiement, l&apos;accès aux
            fonctionnalités Premium est suspendu après un délai de grâce de 7 jours ;
            les données restent accessibles en lecture.
          </p>

          <h2 className="mb-2.5 mt-[30px] text-[16.5px] font-bold tracking-[-0.015em]">
            5. Droit de rétractation
          </h2>
          <p className="mb-3 text-[14.5px] leading-[1.7] text-ink-2 [text-wrap:pretty]">
            Le service s&apos;adressant exclusivement à des professionnels dans le
            cadre de leur activité, le droit de rétractation prévu pour les
            consommateurs ne s&apos;applique pas. Une période d&apos;essai gratuite de
            30 jours permet d&apos;évaluer le service sans engagement ni carte bancaire.
          </p>

          <h2 className="mb-2.5 mt-[30px] text-[16.5px] font-bold tracking-[-0.015em]">
            6. Disponibilité et responsabilité
          </h2>
          <p className="mb-3 text-[14.5px] leading-[1.7] text-ink-2 [text-wrap:pretty]">
            Freelance Flow s&apos;efforce d&apos;assurer une disponibilité du service
            de 99,5 % par mois, hors maintenances programmées annoncées 48 h à
            l&apos;avance. Le service est un{" "}
            <b className="font-[650] text-ink">outil d&apos;aide</b> à la gestion :
            l&apos;utilisateur demeure seul responsable de ses obligations comptables,
            fiscales et déclaratives.
          </p>

          <h2 className="mb-2.5 mt-[30px] text-[16.5px] font-bold tracking-[-0.015em]">
            7. Résiliation et restitution des données
          </h2>
          <p className="mb-3 text-[14.5px] leading-[1.7] text-ink-2 [text-wrap:pretty]">
            En cas de résiliation, l&apos;utilisateur peut exporter l&apos;ensemble de
            ses documents et données pendant{" "}
            <b className="font-[650] text-ink">12 mois</b>. Passé ce délai, les données
            sont supprimées définitivement, à l&apos;exception des éléments soumis à
            une obligation légale de conservation.
          </p>

          <h2 className="mb-2.5 mt-[30px] text-[16.5px] font-bold tracking-[-0.015em]">
            8. Droit applicable
          </h2>
          <p className="mb-3 text-[14.5px] leading-[1.7] text-ink-2 [text-wrap:pretty]">
            Les présentes conditions sont soumises au droit français. À défaut de
            résolution amiable, tout litige relève des tribunaux compétents de Lyon.
          </p>
        </section>

        {/* ===== CONFIDENTIALITÉ ===== */}
        <section className={cn(active !== "confidentialite" && "hidden")}>
          <h1 className="mb-1.5 text-[27px] font-extrabold tracking-[-0.03em]">
            Politique de confidentialité
          </h1>
          <div className="mb-[30px] font-mono text-[13px] text-ink-3">
            Dernière mise à jour : 1ᵉʳ juin 2026
          </div>

          <div className="my-[18px] rounded-md border border-line bg-surface px-[18px] py-[14px] text-[13.5px] leading-[1.6] text-ink-2">
            <b className="text-ink">En bref :</b> vos données sont hébergées dans
            l&apos;Union européenne, isolées des autres comptes au niveau de la base de
            données, jamais revendues, et supprimables à tout moment.
          </div>

          <h2 className="mb-2.5 mt-[30px] text-[16.5px] font-bold tracking-[-0.015em]">
            1. Responsable de traitement
          </h2>
          <p className="mb-3 text-[14.5px] leading-[1.7] text-ink-2 [text-wrap:pretty]">
            Freelance Flow SAS, 18 rue des Capucins, 69001 Lyon. Contact délégué à la
            protection des données :{" "}
            <a
              href="mailto:dpo@freelanceflow.fr"
              className="font-[550] text-accent-ink hover:underline"
            >
              dpo@freelanceflow.fr
            </a>
            .
          </p>

          <h2 className="mb-2.5 mt-[30px] text-[16.5px] font-bold tracking-[-0.015em]">
            2. Données collectées et finalités
          </h2>
          <ul className="mb-3 ml-5 list-disc space-y-1.5">
            <li className="text-[14.5px] leading-[1.6] text-ink-2">
              <b className="font-[650] text-ink">Données de compte</b> (nom, e-mail,
              SIRET, régime TVA) — exécution du contrat : création des documents
              conformes.
            </li>
            <li className="text-[14.5px] leading-[1.6] text-ink-2">
              <b className="font-[650] text-ink">Données métier</b> (clients, projets,
              devis, factures, IBAN) — exécution du contrat : fonctionnement du
              service.
            </li>
            <li className="text-[14.5px] leading-[1.6] text-ink-2">
              <b className="font-[650] text-ink">Données de connexion</b> (journaux
              techniques, adresse IP) — intérêt légitime : sécurité et prévention de la
              fraude.
            </li>
            <li className="text-[14.5px] leading-[1.6] text-ink-2">
              <b className="font-[650] text-ink">
                Données de facturation de l&apos;abonnement
              </b>{" "}
              — obligation légale : comptabilité.
            </li>
          </ul>
          <p className="mb-3 text-[14.5px] leading-[1.7] text-ink-2 [text-wrap:pretty]">
            Aucune donnée n&apos;est utilisée à des fins publicitaires ni transmise à
            des tiers à des fins commerciales.
          </p>

          <h2 className="mb-2.5 mt-[30px] text-[16.5px] font-bold tracking-[-0.015em]">
            3. Sécurité — privacy by design
          </h2>
          <ul className="mb-3 ml-5 list-disc space-y-1.5">
            <li className="text-[14.5px] leading-[1.6] text-ink-2">
              Isolation stricte des données entre comptes par{" "}
              <b className="font-[650] text-ink">Row Level Security</b> au niveau de la
              base de données PostgreSQL.
            </li>
            <li className="text-[14.5px] leading-[1.6] text-ink-2">
              Chiffrement <b className="font-[650] text-ink">TLS</b> de tous les
              échanges ; chiffrement au repos des sauvegardes.
            </li>
            <li className="text-[14.5px] leading-[1.6] text-ink-2">
              Authentification avec hachage des mots de passe (bcrypt) ; aucune
              conservation en clair.
            </li>
          </ul>

          <h2 className="mb-2.5 mt-[30px] text-[16.5px] font-bold tracking-[-0.015em]">
            4. Hébergement et sous-traitants
          </h2>
          <p className="mb-3 text-[14.5px] leading-[1.7] text-ink-2 [text-wrap:pretty]">
            Les données sont hébergées dans l&apos;Union européenne (Supabase — région
            Francfort, Allemagne). Le rendu de l&apos;interface transite par le CDN de
            Vercel.
            La liste complète des sous-traitants est disponible sur demande auprès du
            DPO.
          </p>

          <h2 className="mb-2.5 mt-[30px] text-[16.5px] font-bold tracking-[-0.015em]">
            5. Durées de conservation
          </h2>
          <ul className="mb-3 ml-5 list-disc space-y-1.5">
            <li className="text-[14.5px] leading-[1.6] text-ink-2">
              <b className="font-[650] text-ink">Compte actif :</b> pendant toute la
              durée d&apos;utilisation du service.
            </li>
            <li className="text-[14.5px] leading-[1.6] text-ink-2">
              <b className="font-[650] text-ink">Après résiliation :</b> 12 mois, pour
              permettre l&apos;export et la réactivation.
            </li>
            <li className="text-[14.5px] leading-[1.6] text-ink-2">
              <b className="font-[650] text-ink">Journaux techniques :</b> 12 mois
              maximum.
            </li>
          </ul>

          <h2 className="mb-2.5 mt-[30px] text-[16.5px] font-bold tracking-[-0.015em]">
            6. Vos droits
          </h2>
          <p className="mb-3 text-[14.5px] leading-[1.7] text-ink-2 [text-wrap:pretty]">
            Conformément au RGPD, vous disposez des droits d&apos;accès, de
            rectification, d&apos;effacement, de portabilité et d&apos;opposition.
            Exercez-les depuis votre page Profil ou par e-mail à{" "}
            <a
              href="mailto:dpo@freelanceflow.fr"
              className="font-[550] text-accent-ink hover:underline"
            >
              dpo@freelanceflow.fr
            </a>{" "}
            — réponse sous 30 jours. Vous pouvez introduire une réclamation auprès de
            la CNIL (
            <a
              href="https://www.cnil.fr"
              rel="noopener"
              className="font-[550] text-accent-ink hover:underline"
            >
              cnil.fr
            </a>
            ).
          </p>

          <h2 className="mb-2.5 mt-[30px] text-[16.5px] font-bold tracking-[-0.015em]">
            7. Cookies
          </h2>
          <p className="mb-3 text-[14.5px] leading-[1.7] text-ink-2 [text-wrap:pretty]">
            Freelance Flow n&apos;utilise que des cookies{" "}
            <b className="font-[650] text-ink">strictement nécessaires</b> (session
            d&apos;authentification, préférence de thème). Aucun cookie publicitaire ou
            de mesure d&apos;audience tierce n&apos;est déposé — c&apos;est pourquoi
            aucun bandeau de consentement n&apos;est requis.
          </p>
        </section>
      </div>
    </div>
  );
}
