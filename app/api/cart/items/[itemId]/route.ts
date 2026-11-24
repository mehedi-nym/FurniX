import { NextResponse } from "next/server";
import { z } from "zod";
import { getGuestCart } from "@/lib/cart/server";
import { estimateProductPrice, PricingError } from "@/lib/catalog/pricing";
import { readBoundedJson, RequestBodyError } from "@/lib/http/request-body";

const quantitySchema = z.object({ quantity: z.number().int().min(1).max(20) }).strict();

type RouteContext = { params: Promise<{ itemId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { itemId } = await context.params;
  const parsedId = z.uuid().safeParse(itemId);
  if (!parsedId.success) return NextResponse.json({ error: "Cart item not found." }, { status: 404 });

  let body: unknown;
  try {
    body = await readBoundedJson(request, 8 * 1024);
  } catch (error) {
    if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Invalid quantity." }, { status: 400 });
  }
  const parsed = quantitySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Quantity must be between 1 and 20." }, { status: 400 });

  try {
    const cart = await getGuestCart(false);
    if (!cart) return NextResponse.json({ error: "Cart item not found." }, { status: 404 });
    const { data: item } = await cart.admin.from("cart_items")
      .select("id,product_id,variant_id,customization")
      .eq("id", itemId)
      .eq("cart_id", cart.cartId)
      .maybeSingle();
    if (!item) return NextResponse.json({ error: "Cart item not found." }, { status: 404 });

    const customization = (item.customization ?? {}) as { dimensions?: Record<string, number>; options?: string[]; features?: Record<string, boolean> };
    await estimateProductPrice({
      productId: item.product_id,
      variantId: item.variant_id,
      quantity: parsed.data.quantity,
      customization: {
        dimensions: customization.dimensions ?? {},
        options: customization.options ?? [],
        features: customization.features ?? {},
      },
    });

    const { error } = await cart.admin.from("cart_items")
      .update({ quantity: parsed.data.quantity, updated_at: new Date().toISOString() })
      .eq("id", itemId)
      .eq("cart_id", cart.cartId);
    if (error) throw error;
    return NextResponse.json({ updated: true });
  } catch (error) {
    if (error instanceof PricingError) return NextResponse.json({ error: error.message, quoteRequired: error.kind === "quote" }, { status: 422 });
    return NextResponse.json({ error: "Could not update your cart." }, { status: 503 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { itemId } = await context.params;
  if (!z.uuid().safeParse(itemId).success) return NextResponse.json({ error: "Cart item not found." }, { status: 404 });
  try {
    const cart = await getGuestCart(false);
    if (!cart) return NextResponse.json({ error: "Cart item not found." }, { status: 404 });
    const { data, error } = await cart.admin.from("cart_items")
      .delete()
      .eq("id", itemId)
      .eq("cart_id", cart.cartId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Cart item not found." }, { status: 404 });
    return NextResponse.json({ removed: true });
  } catch {
    return NextResponse.json({ error: "Could not remove this item." }, { status: 503 });
  }
}
