import "server-only";

import type { User } from "@supabase/supabase-js";
import { createClient } from "./server";

/** Returns a server-verified, non-anonymous user with a confirmed email. */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user || user.is_anonymous || !user.email_confirmed_at) return null;
  return user;
}
