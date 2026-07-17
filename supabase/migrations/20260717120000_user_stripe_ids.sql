-- ============================================================================
-- FreelanceFlow — users.stripe_customer_id / stripe_subscription_id (#82)
-- Paiement Premium réel en mode TEST Stripe (aucun argent réel, cartes 4242…).
--
-- stripe_customer_id : posé à la création de la 1ère session Checkout (un
--   client Stripe par utilisateur, réutilisé pour les sessions suivantes —
--   évite les doublons de client Stripe si l'utilisateur retente un paiement).
-- stripe_subscription_id : posé/effacé UNIQUEMENT par le webhook Stripe
--   (checkout.session.completed / customer.subscription.deleted), jamais par
--   l'application elle-même — reflète l'état RÉEL côté Stripe, pas une
--   intention côté app.
-- ============================================================================
alter table public.users
  add column stripe_customer_id text,
  add column stripe_subscription_id text;

create unique index users_stripe_customer_id_key
  on public.users(stripe_customer_id);

create unique index users_stripe_subscription_id_key
  on public.users(stripe_subscription_id);
