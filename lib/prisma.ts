// Client Prisma singleton (pattern global recommandé en dev pour éviter
// l'épuisement des connexions au hot-reload de Next.js).
// La connexion passe par le pooler Supabase en transaction mode (DATABASE_URL,
// port 6543) ; les migrations/introspection utilisent DIRECT_URL (5432).
//
// SÉCURITÉ : ce client CONTOURNE la RLS Postgres. Toute requête applicative
// DOIT filtrer explicitement par utilisateur (where: { userId: session.user.id })
// et n'être exécutée qu'après vérification de la session côté serveur.

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
