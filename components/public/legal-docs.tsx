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
            Dernière mise à jour : 15 septembre 2026
          </div>

          <h2 className="mb-2.5 mt-[30px] text-[16.5px] font-bold tracking-[-0.015em]">
            1. Éditeur du site
          </h2>
          <p className="mb-3 text-[14.5px] leading-[1.7] text-ink-2 [text-wrap:pretty]">
            Le site et l&apos;application <b className="font-[650] text-ink">Freelance Flow</b> sont une{" "}
            <b className="font-[650] text-ink">application de démonstration</b> réalisée par Aurélien
            Jesson-Daniel dans le cadre de sa formation à Ynov, pour le titre RNCP
            39583 « Expert en développement logiciel ». Il s&apos;agit d&apos;un
            projet non commercial : aucune société n&apos;édite ce service et aucune
            prestation n&apos;est vendue.
          </p>
          <ul className="mb-3 ml-5 list-disc space-y-1.5">
            <li className="text-[14.5px] leading-[1.6] text-ink-2">
              <b className="font-[650] text-ink">Directeur de la publication :</b> Aurélien
              Jesson-Daniel
            </li>
            <li className="text-[14.5px] leading-[1.6] text-ink-2">
              <b className="font-[650] text-ink">Contact :</b>{" "}
              <a
                href="https://github.com/Aure33/FreelanceFlow/issues"
                rel="noopener"
                className="font-[550] text-accent-ink hover:underline"
              >
                dépôt GitHub du projet
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
            <b className="font-[650] text-ink">eu-west-1 (Dublin, Irlande)</b>.
          </p>
          <p className="mb-3 text-[14.5px] leading-[1.7] text-ink-2 [text-wrap:pretty]">
            Certaines fonctions reposent sur des prestataires tiers susceptibles de
            traiter des données hors de l&apos;Union européenne : Stripe (paiement,
            en environnement de test), Resend (envoi des e-mails) et Sentry
            (supervision des erreurs, sans corps de requête ni cookies).
          </p>

          <h2 className="mb-2.5 mt-[30px] text-[16.5px] font-bold tracking-[-0.015em]">
            3. Propriété intellectuelle
          </h2>
          <p className="mb-3 text-[14.5px] leading-[1.7] text-ink-2 [text-wrap:pretty]">
            L&apos;ensemble des éléments composant le service (interface, textes,
            logos, charte graphique, code) est protégé par le droit de la propriété
            intellectuelle et demeure la propriété de son auteur. Toute
            reproduction, même partielle, est soumise à autorisation préalable.
          </p>
          <p className="mb-3 text-[14.5px] leading-[1.7] text-ink-2 [text-wrap:pretty]">
            Les documents (devis, factures) générés par les utilisateurs et les
            données qu&apos;ils saisissent restent leur entière propriété.
          </p>

          <h2 className="mb-2.5 mt-[30px] text-[16.5px] font-bold tracking-[-0.015em]">
            4. Signalement
          </h2>
          <p className="mb-3 text-[14.5px] leading-[1.7] text-ink-2 [text-wrap:pretty]">
            Pour signaler un contenu ou un dysfonctionnement, ouvrez une issue sur
            le{" "}
            <a
              href="https://github.com/Aure33/FreelanceFlow/issues"
              rel="noopener"
              className="font-[550] text-accent-ink hover:underline"
            >
              dépôt GitHub du projet
            </a>
            .
          </p>
        </section>

        {/* ===== CGU / CGV ===== */}
        <section className={cn(active !== "cgu" && "hidden")}>
          <h1 className="mb-1.5 text-[27px] font-extrabold tracking-[-0.03em]">
            Conditions générales d&apos;utilisation et de vente
          </h1>
          <div className="mb-[30px] font-mono text-[13px] text-ink-3">
            Version 2.0 — en vigueur au 15 septembre 2026
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
            Freelance Flow est une <b className="font-[650] text-ink">application de
            démonstration</b> réalisée dans un cadre de formation : elle n&apos;est
            pas commercialisée et ne doit pas être utilisée pour une activité réelle.
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
              (devis ou factures) émis par mois, clients et projets illimités, export
              PDF.
            </li>
            <li className="text-[14.5px] leading-[1.6] text-ink-2">
              <b className="font-[650] text-ink">Forfait Premium :</b> 15 € HT/mois (ou
              144 € HT/an, soit deux mois offerts) — documents illimités, relances
              automatiques, logo sur les documents, statistiques avancées.
            </li>
          </ul>
          <p className="mb-3 text-[14.5px] leading-[1.7] text-ink-2 [text-wrap:pretty]">
            Les prix s&apos;entendent hors taxes et sont indicatifs : le service
            n&apos;étant pas commercialisé, aucun abonnement réel n&apos;est souscrit.
          </p>

          <h2 className="mb-2.5 mt-[30px] text-[16.5px] font-bold tracking-[-0.015em]">
            4. Paiement
          </h2>
          <p className="mb-3 text-[14.5px] leading-[1.7] text-ink-2 [text-wrap:pretty]">
            Le paiement passe par Stripe, en{" "}
            <b className="font-[650] text-ink">environnement de test</b> : seules les
            cartes de test sont acceptées et aucun prélèvement réel n&apos;est
            effectué. Aucune donnée bancaire n&apos;est conservée par Freelance Flow.
            En cas d&apos;échec de paiement ou de fin d&apos;abonnement, l&apos;accès
            aux fonctionnalités Premium est retiré ; les données restent accessibles.
          </p>

          <h2 className="mb-2.5 mt-[30px] text-[16.5px] font-bold tracking-[-0.015em]">
            5. Droit de rétractation
          </h2>
          <p className="mb-3 text-[14.5px] leading-[1.7] text-ink-2 [text-wrap:pretty]">
            Le service s&apos;adressant exclusivement à des professionnels dans le
            cadre de leur activité, le droit de rétractation prévu pour les
            consommateurs ne s&apos;applique pas. L&apos;offre gratuite, limitée à
            5 documents émis par mois, permet d&apos;évaluer le service sans engagement ni
            carte bancaire.
          </p>

          <h2 className="mb-2.5 mt-[30px] text-[16.5px] font-bold tracking-[-0.015em]">
            6. Disponibilité et responsabilité
          </h2>
          <p className="mb-3 text-[14.5px] leading-[1.7] text-ink-2 [text-wrap:pretty]">
            Projet de démonstration, le service est fourni sans engagement de
            disponibilité. C&apos;est un{" "}
            <b className="font-[650] text-ink">outil d&apos;aide</b> à la gestion :
            l&apos;utilisateur demeure seul responsable de ses obligations comptables,
            fiscales et déclaratives.
          </p>

          <h2 className="mb-2.5 mt-[30px] text-[16.5px] font-bold tracking-[-0.015em]">
            7. Résiliation et restitution des données
          </h2>
          <p className="mb-3 text-[14.5px] leading-[1.7] text-ink-2 [text-wrap:pretty]">
            À tout moment, depuis{" "}
            <b className="font-[650] text-ink">Paramètres → Compte</b>,
            l&apos;utilisateur peut télécharger l&apos;ensemble de ses données (profil,
            clients, projets, devis et factures) dans un fichier structuré, puis
            supprimer son compte : la suppression est immédiate et définitive.
          </p>

          <h2 className="mb-2.5 mt-[30px] text-[16.5px] font-bold tracking-[-0.015em]">
            8. Droit applicable
          </h2>
          <p className="mb-3 text-[14.5px] leading-[1.7] text-ink-2 [text-wrap:pretty]">
            Les présentes conditions sont soumises au droit français.
          </p>
        </section>

        {/* ===== CONFIDENTIALITÉ ===== */}
        <section className={cn(active !== "confidentialite" && "hidden")}>
          <h1 className="mb-1.5 text-[27px] font-extrabold tracking-[-0.03em]">
            Politique de confidentialité
          </h1>
          <div className="mb-[30px] font-mono text-[13px] text-ink-3">
            Dernière mise à jour : 15 septembre 2026
          </div>

          <div className="my-[18px] rounded-md border border-line bg-surface px-[18px] py-[14px] text-[13.5px] leading-[1.6] text-ink-2">
            <b className="text-ink">En bref :</b> vos données sont hébergées dans
            l&apos;Union européenne, isolées des autres comptes au niveau de la base de
            données, jamais revendues, exportables et supprimables à tout moment.
          </div>

          <h2 className="mb-2.5 mt-[30px] text-[16.5px] font-bold tracking-[-0.015em]">
            1. Responsable de traitement
          </h2>
          <p className="mb-3 text-[14.5px] leading-[1.7] text-ink-2 [text-wrap:pretty]">
            Aurélien Jesson-Daniel, auteur de ce projet de formation (aucun délégué
            à la protection des données n&apos;est désigné pour ce projet non
            commercial). Contact : le{" "}
            <a
              href="https://github.com/Aure33/FreelanceFlow/issues"
              rel="noopener"
              className="font-[550] text-accent-ink hover:underline"
            >
              dépôt GitHub du projet
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
              <b className="font-[650] text-ink">Données d&apos;abonnement</b>{" "}
              (identifiants client et abonnement Stripe, environnement de test) —
              exécution du contrat : gestion du forfait.
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
            La base de données, l&apos;authentification et les fichiers sont hébergés
            dans l&apos;Union européenne (Supabase — région Dublin, Irlande). Sous-traitants :
          </p>
          <ul className="mb-3 ml-5 list-disc space-y-1.5">
            <li className="text-[14.5px] leading-[1.6] text-ink-2">
              <b className="font-[650] text-ink">Supabase</b> — base de données, authentification, fichiers (UE).
            </li>
            <li className="text-[14.5px] leading-[1.6] text-ink-2">
              <b className="font-[650] text-ink">Vercel</b> — hébergement de l&apos;application (fonctions en région
              Dublin, diffusion mondiale des fichiers statiques).
            </li>
            <li className="text-[14.5px] leading-[1.6] text-ink-2">
              <b className="font-[650] text-ink">Stripe</b> — paiement de l&apos;abonnement, en environnement de test.
            </li>
            <li className="text-[14.5px] leading-[1.6] text-ink-2">
              <b className="font-[650] text-ink">Resend</b> — envoi des devis, factures et relances par e-mail.
            </li>
            <li className="text-[14.5px] leading-[1.6] text-ink-2">
              <b className="font-[650] text-ink">Sentry</b> — supervision des erreurs, sans corps de requête ni cookies.
            </li>
          </ul>

          <h2 className="mb-2.5 mt-[30px] text-[16.5px] font-bold tracking-[-0.015em]">
            5. Durées de conservation
          </h2>
          <ul className="mb-3 ml-5 list-disc space-y-1.5">
            <li className="text-[14.5px] leading-[1.6] text-ink-2">
              <b className="font-[650] text-ink">Compte actif :</b> pendant toute la
              durée d&apos;utilisation du service.
            </li>
            <li className="text-[14.5px] leading-[1.6] text-ink-2">
              <b className="font-[650] text-ink">Suppression du compte :</b> effacement
              immédiat et définitif du profil, des clients, projets, devis et factures.
            </li>
            <li className="text-[14.5px] leading-[1.6] text-ink-2">
              <b className="font-[650] text-ink">Journaux techniques :</b> selon les
              durées de conservation propres aux prestataires ci-dessus.
            </li>
          </ul>

          <h2 className="mb-2.5 mt-[30px] text-[16.5px] font-bold tracking-[-0.015em]">
            6. Vos droits
          </h2>
          <p className="mb-3 text-[14.5px] leading-[1.7] text-ink-2 [text-wrap:pretty]">
            Conformément au RGPD, vous disposez des droits d&apos;accès, de
            rectification, d&apos;effacement, de portabilité et d&apos;opposition.
            Exercez-les directement depuis <b className="font-[650] text-ink">Paramètres</b> : modification du
            profil, téléchargement de vos données et suppression du compte
            (Paramètres → Compte). Vous pouvez introduire une réclamation auprès de
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
            d&apos;authentification, masquage du guide d&apos;accueil, lecture des
            notifications) ; la préférence de thème est conservée dans le navigateur.
            Aucun cookie publicitaire ou
            de mesure d&apos;audience tierce n&apos;est déposé — c&apos;est pourquoi
            aucun bandeau de consentement n&apos;est requis.
          </p>
        </section>
      </div>
    </div>
  );
}
