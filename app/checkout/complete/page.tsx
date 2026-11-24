import Link from "next/link";
import { SiteFooter } from "@/components/storefront/site-footer";
import { SiteHeader } from "@/components/storefront/site-header";

export const metadata = { title: "Order received" };
export const instant = false;

export default async function CheckoutCompletePage({ searchParams }: { searchParams: Promise<{ reference?: string }> }) {
  const { reference } = await searchParams;
  return <div className="storefront"><SiteHeader /><main className="commerce-page section-wrap checkout-complete"><p className="eyebrow"><span className="eyebrow-line" />Order received</p><h1 className="commerce-heading">Thank you. We have your order.</h1><p>Your order reference is <strong>{reference && /^[A-Za-z0-9-]{4,32}$/.test(reference) ? reference : "being prepared"}</strong>. Keep it for your records.</p><p>We’ll contact you using the details provided at checkout to confirm delivery and next steps.</p><Link className="button button-dark" href="/products">Continue browsing</Link></main><SiteFooter /></div>;
}
