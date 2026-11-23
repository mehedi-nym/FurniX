import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createGuestCheckoutSession, getGuestCheckoutSession } from "@/lib/checkout/guest-session";

export async function getGuestCart(createIfMissing = false) {
  let session = await getGuestCheckoutSession();
  if (!session && createIfMissing) {
    await createGuestCheckoutSession();
    session = await getGuestCheckoutSession();
  }
  if (!session) return null;

  const admin = createAdminClient();
  const { data: cart, error } = await admin
    .from("carts")
    .select("id")
    .eq("guest_session_id", session.id)
    .eq("status", "active")
    .maybeSingle();
  if (error || !cart) return null;

  return { admin, cartId: cart.id as string, sessionId: session.id };
}
