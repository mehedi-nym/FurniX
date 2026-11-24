import "server-only";

import { createClient } from "@/lib/supabase/server";

type AdminClient = ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>;
export type QuoteContact = { fullName: string; email: string; phone: string };

export async function getVerifiedLinkedCustomerId(admin: AdminClient) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email_confirmed_at || user.is_anonymous) return null;
    const { data } = await admin.from("customer_auth_links")
      .select("customer_id")
      .eq("user_id", user.id)
      .not("verified_at", "is", null)
      .maybeSingle();
    return data ? String(data.customer_id) : null;
  } catch {
    return null;
  }
}

export async function createQuoteCustomer(admin: AdminClient, contact: QuoteContact) {
  const linkedCustomerId = await getVerifiedLinkedCustomerId(admin);
  if (linkedCustomerId) return { customerId: linkedCustomerId, created: false };

  const { data, error } = await admin.from("customers").insert({
    full_name: contact.fullName,
    email: contact.email.trim().toLowerCase(),
    phone: contact.phone,
  }).select("id").single();
  if (error || !data) throw new Error("Could not create a customer profile for the quotation.");
  return { customerId: String(data.id), created: true };
}
