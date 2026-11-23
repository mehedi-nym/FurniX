import { SiteFooter } from "@/components/storefront/site-footer";
import { SiteHeader } from "@/components/storefront/site-header";
import { CheckoutForm } from "@/components/storefront/checkout-form";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Guest checkout" };
export const instant = false;

export default async function CheckoutPage() {
  let methods: { id: string; name: string; charge: number }[] = [];
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("shipping_methods").select("id,name,charge").eq("is_active", true).order("name");
    methods = (data ?? []).map((item) => ({ ...item, charge: Number(item.charge) }));
  } catch { /* Empty state explains missing shipping configuration. */ }
  return <div className="storefront"><SiteHeader /><main className="commerce-page section-wrap"><p className="eyebrow"><span className="eyebrow-line" />Almost yours</p><h1 className="commerce-heading">Guest checkout</h1><CheckoutForm shippingMethods={methods} /></main><SiteFooter /></div>;
}
