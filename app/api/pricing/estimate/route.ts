import { NextResponse } from "next/server";
import { checkoutItemSchema } from "@/lib/checkout/schemas";
import { estimateProductPrice, PricingError } from "@/lib/catalog/pricing";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid pricing request." }, { status: 400 });
  }

  const parsed = checkoutItemSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Check your product choices." }, { status: 400 });

  try {
    const price = await estimateProductPrice({
      productId: parsed.data.productId,
      variantId: parsed.data.variantId,
      quantity: parsed.data.quantity,
      customization: {
        dimensions: parsed.data.customization.dimensions,
        options: parsed.data.customization.optionIds,
        features: parsed.data.customization.features,
      },
    });
    return NextResponse.json(price);
  } catch (error) {
    if (error instanceof PricingError) {
      return NextResponse.json(
        { error: error.message, quoteRequired: error.kind === "quote" },
        { status: error.kind === "unavailable" ? 409 : 422 },
      );
    }
    return NextResponse.json({ error: "Could not calculate the price right now." }, { status: 503 });
  }
}
