import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

const COOKIE_NAME = process.env.NODE_ENV === "production" ? "__Host-guest_checkout" : "guest_checkout";
const SESSION_LIFETIME_MS = 1000 * 60 * 60 * 24 * 14;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createGuestCheckoutSession() {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS).toISOString();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("guest_checkout_sessions")
    .insert({ token_hash: hashToken(token), expires_at: expiresAt })
    .select("id")
    .single();

  if (error || !data) throw new Error("Could not create a guest checkout session.");

  const { error: cartError } = await admin.from("carts").insert({
    guest_session_id: data.id,
    status: "active",
    expires_at: expiresAt,
  });
  if (cartError) {
    await admin.from("guest_checkout_sessions").delete().eq("id", data.id);
    throw new Error("Could not create a guest cart.");
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt),
  });

  return data.id as string;
}

export async function getGuestCheckoutSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token || token.length > 128) return null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("guest_checkout_sessions")
    .select("id, expires_at")
    .eq("token_hash", hashToken(token))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !data) return null;
  return { id: data.id as string, expiresAt: data.expires_at as string };
}

export async function clearGuestCheckoutSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
