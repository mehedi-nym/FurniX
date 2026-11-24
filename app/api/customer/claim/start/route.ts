import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { readBoundedJson, RequestBodyError } from "@/lib/http/request-body";

const requestSchema = z.object({
  email: z.string().trim().email().max(254),
  captchaToken: z.string().min(1).max(4096).optional(),
}).strict();

const genericResponse = {
  message: "If the address can be verified, Supabase Auth will send a confirmation link.",
};

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await readBoundedJson(request, 8 * 1024);
  } catch (error) {
    if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user && !user.is_anonymous) {
      if (!user.email_confirmed_at) {
        return NextResponse.json({ error: "Verify your account email before claiming orders." }, { status: 401 });
      }

      const { error } = await supabase.rpc("claim_customer_records");
      if (error) return NextResponse.json({ error: "Could not securely link customer records." }, { status: 409 });
      return NextResponse.json({ linked: true });
    }

    if (!user) {
      const { error } = await supabase.auth.signInAnonymously({
        options: parsed.data.captchaToken ? { captchaToken: parsed.data.captchaToken } : undefined,
      });
      if (error) return NextResponse.json(genericResponse, { status: 202 });
    }

    const callbackUrl = new URL("/auth/callback?next=/account/claim", request.url).toString();
    const { error: linkError } = await supabase.auth.updateUser(
      { email: parsed.data.email },
      { emailRedirectTo: callbackUrl },
    );

    if (linkError) {
      // Existing Auth accounts can receive OTPs, but unknown emails must not
      // create unverified Auth users.
      await supabase.auth.signInWithOtp({
        email: parsed.data.email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: callbackUrl,
          ...(parsed.data.captchaToken ? { captchaToken: parsed.data.captchaToken } : {}),
        },
      });
    }

    return NextResponse.json(genericResponse, { status: 202 });
  } catch {
    return NextResponse.json(genericResponse, { status: 202 });
  }
}
