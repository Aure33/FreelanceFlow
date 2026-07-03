import type { Metadata } from "next";
import { PublicNav } from "@/components/public/public-nav";
import { PublicFooter } from "@/components/public/public-footer";
import { LegalDocs } from "@/components/public/legal-docs";

export const metadata: Metadata = {
  title: "Informations légales",
};

export default function LegalPage() {
  return (
    <>
      <PublicNav />
      <LegalDocs />
      <PublicFooter className="max-w-[1020px]" />
    </>
  );
}
