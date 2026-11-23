import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const acceptedEmailTypes = new Set<EmailOtpType>(["email_change", "magiclink", "email", "signup"]);

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const isClaimFlow = url.searchParams.get("next") === "/account/claim";
  const supabase = await createClient();
  let authError: unknown = null;

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    authError = error;
  } else if (tokenHash && type && acceptedEmailTypes.has(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    authError = error;
  } else {
    authError = new Error("Missing or invalid authentication callback parameters.");
  }

  if (authError) {
    return NextResponse.redirect(new URL("/?claim=verification-failed", request.url));
  }

  if (isClaimFlow) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.is_anonymous || !user.email_confirmed_at) {
      return NextResponse.redirect(new URL("/?claim=verification-failed", request.url));
    }

    const { error } = await supabase.rpc("claim_customer_records");
    if (error) {
      return NextResponse.redirect(new URL("/?claim=link-failed", request.url));
    }
    return NextResponse.redirect(new URL("/?claim=complete", request.url));
  }

  return NextResponse.redirect(new URL("/", request.url));
}
