import { NextResponse } from "next/server";
import { getGuestCart } from "@/lib/cart/server";
import { estimateProductPrice, PricingError } from "@/lib/catalog/pricing";

export async function GET() {
  try {
    const cart = await getGuestCart(false);
    if (!cart) return NextResponse.json({ items: [], subtotal: 0, currency: "BDT" });

    const { data: rows, error } = await cart.admin
      .from("cart_items")
      .select("id,product_id,variant_id,quantity,customization,created_at")
      .eq("cart_id", cart.cartId)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const productIds = [...new Set((rows ?? []).map((row) => row.product_id as string))];
    const [{ data: products }, { data: mediaRows }] = await Promise.all([
      productIds.length
        ? cart.admin.from("products").select("id,slug,name,sku,is_published").in("id", productIds)
        : Promise.resolve({ data: [] }),
      productIds.length
        ? cart.admin.from("product_media").select("product_id,storage_path,alt_text,sort_order").in("product_id", productIds).eq("media_type", "image").order("sort_order")
        : Promise.resolve({ data: [] }),
    ]);
    const productMap = new Map((products ?? []).map((product) => [product.id, product]));
    const mediaMap = new Map<string, string>();
    for (const media of mediaRows ?? []) {
      if (!mediaMap.has(media.product_id)) {
        mediaMap.set(media.product_id, cart.admin.storage.from("product-media").getPublicUrl(media.storage_path).data.publicUrl);
      }
    }

    const items = await Promise.all((rows ?? []).map(async (row) => {
      const product = productMap.get(row.product_id);
      if (!product?.is_published) return null;
      const customization = (row.customization ?? {}) as { dimensions?: Record<string, number>; options?: string[]; features?: Record<string, boolean>; customSize?: boolean };
      let price: Awaited<ReturnType<typeof estimateProductPrice>> | null = null;
      let quoteRequired = false;
      try {
        price = await estimateProductPrice({
          productId: row.product_id,
          variantId: row.variant_id,
          quantity: row.quantity,
          customization: {
            dimensions: customization.dimensions ?? {},
            options: customization.options ?? [],
            features: customization.features ?? {},
            customSize: customization.customSize ?? false,
          },
        });
      } catch (error) {
        if (error instanceof PricingError) quoteRequired = error.kind === "quote";
      }
      return {
        id: row.id,
        productId: row.product_id,
        productSlug: product.slug,
        productName: product.name,
        sku: product.sku,
        imageUrl: mediaMap.get(row.product_id) ?? null,
        variantId: row.variant_id,
        quantity: row.quantity,
        customization,
        price,
        quoteRequired,
      };
    }));

    const visibleItems = items.filter(Boolean);
    const currency = visibleItems.find((item) => item?.price)?.price?.currency ?? "BDT";
    const subtotal = visibleItems.reduce((sum, item) => sum + (item?.price?.lineTotal ?? 0), 0);
    return NextResponse.json({ items: visibleItems, subtotal, currency });
  } catch {
    return NextResponse.json({ error: "Could not load your cart." }, { status: 503 });
  }
}
