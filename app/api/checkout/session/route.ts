import { NextResponse } from "next/server";
import { createGuestCheckoutSession } from "@/lib/checkout/guest-session";

export async function POST() {
  try {
    await createGuestCheckoutSession();
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Guest checkout is temporarily unavailable." },
      { status: 503 },
    );
  }
}
