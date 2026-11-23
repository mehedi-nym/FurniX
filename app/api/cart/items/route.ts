import { NextResponse } from "next/server";
import { checkoutItemSchema } from "@/lib/checkout/schemas";
import { getGuestCart } from "@/lib/cart/server";
import { estimateProductPrice, PricingError } from "@/lib/catalog/pricing";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid cart item." }, { status: 400 });
  }

  const parsed = checkoutItemSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Check your product choices." }, { status: 400 });

  try {
    await estimateProductPrice({
      productId: parsed.data.productId,
      variantId: parsed.data.variantId,
      quantity: parsed.data.quantity,
      customization: {
        dimensions: parsed.data.customization.dimensions,
        options: parsed.data.customization.optionIds,
        features: parsed.data.customization.features,
      },
    });
    const cart = await getGuestCart(true);
    if (!cart) throw new Error("Guest cart unavailable");

    const { count, error: countError } = await cart.admin.from("cart_items")
      .select("id", { count: "exact", head: true })
      .eq("cart_id", cart.cartId);
    if (countError) throw countError;
    if ((count ?? 0) >= 30) {
      return NextResponse.json({ error: "A cart can contain up to 30 different items." }, { status: 422 });
    }

    const { error } = await cart.admin.from("cart_items").insert({
      cart_id: cart.cartId,
      product_id: parsed.data.productId,
      variant_id: parsed.data.variantId ?? null,
      quantity: parsed.data.quantity,
      customization: {
        dimensions: parsed.data.customization.dimensions,
        options: parsed.data.customization.optionIds,
        features: parsed.data.customization.features,
      },
    });
    if (error) throw error;
    return NextResponse.json({ added: true }, { status: 201 });
  } catch (error) {
    if (error instanceof PricingError) {
      return NextResponse.json({ error: error.message, quoteRequired: error.kind === "quote" }, { status: 422 });
    }
    return NextResponse.json({ error: "Could not add this item to your cart." }, { status: 503 });
  }
}
