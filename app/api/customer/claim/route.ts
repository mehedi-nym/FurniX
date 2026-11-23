import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user || !user.email_confirmed_at) {
    return NextResponse.json({ error: "A verified email account is required." }, { status: 401 });
  }

  const { error } = await supabase.rpc("claim_customer_records");
  if (error) {
    return NextResponse.json({ error: "Could not securely link customer records." }, { status: 409 });
  }

  return NextResponse.json({ linked: true });
}
