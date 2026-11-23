import { NextResponse } from "next/server";
import { checkoutRequestSchema } from "@/lib/checkout/schemas";
import { clearGuestCheckoutSession, getGuestCheckoutSession } from "@/lib/checkout/guest-session";
import { getGuestCart } from "@/lib/cart/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  let guestSession: Awaited<ReturnType<typeof getGuestCheckoutSession>>;
  try {
    guestSession = await getGuestCheckoutSession();
  } catch {
    return NextResponse.json({ error: "Checkout is temporarily unavailable." }, { status: 503 });
  }
  if (!guestSession) {
    return NextResponse.json({ error: "Start a new checkout session and try again." }, { status: 401 });
  }
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "Invalid request content type." }, { status: 415 });
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > 64 * 1024) {
    return NextResponse.json({ error: "Checkout request is too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = checkoutRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please check your checkout details." }, { status: 400 });
  }

  try {
    const cart = await getGuestCart(false);
    if (!cart) return NextResponse.json({ error: "Your cart is empty or unavailable." }, { status: 422 });
    const { data: cartItems, error: cartError } = await cart.admin
      .from("cart_items")
      .select("product_id,variant_id,quantity,customization")
      .eq("cart_id", cart.cartId);
    if (cartError || !cartItems?.length) {
      return NextResponse.json({ error: "Your cart is empty or unavailable." }, { status: 422 });
    }

    let authenticatedUserId: string | null = null;
    try {
      const authClient = await createClient();
      const { data: { user }, error: authError } = await authClient.auth.getUser();
      if (!authError && user && !user.is_anonymous && user.email_confirmed_at) {
        authenticatedUserId = user.id;
      }
    } catch {
      // Auth is optional for checkout; an Auth outage must not force guest login.
    }

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("create_guest_order", {
      p_session_id: guestSession.id,
      p_customer: {
        full_name: parsed.data.customer.fullName,
        email: parsed.data.customer.email,
        phone: parsed.data.customer.phone,
      },
      p_delivery: {
        address_line1: parsed.data.delivery.addressLine1,
        address_line2: parsed.data.delivery.addressLine2,
        locality: parsed.data.delivery.locality,
        district: parsed.data.delivery.district,
        postal_code: parsed.data.delivery.postalCode,
        delivery_notes: parsed.data.delivery.deliveryNotes,
        installation_notes: parsed.data.delivery.installationNotes,
      },
      p_shipping_method_id: parsed.data.shippingMethodId,
      p_items: cartItems.map((item) => ({
        product_id: item.product_id,
        variant_id: item.variant_id,
        quantity: item.quantity,
        customization: item.customization,
      })),
      p_auth_user_id: authenticatedUserId,
    });

    if (error) {
      const status = error.code === "22023" ? 422 : 503;
      const message = status === 422
        ? "Some items or delivery details are no longer available."
        : "Checkout is temporarily unavailable.";
      return NextResponse.json({ error: message }, { status });
    }
    if (!data) return NextResponse.json({ error: "Checkout is temporarily unavailable." }, { status: 503 });

    await clearGuestCheckoutSession();
    return NextResponse.json({ orderReference: data.public_reference }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Checkout is temporarily unavailable." }, { status: 503 });
  }
}
