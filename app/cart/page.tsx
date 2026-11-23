import { SiteFooter } from "@/components/storefront/site-footer";
import { SiteHeader } from "@/components/storefront/site-header";
import { CartContents } from "@/components/storefront/cart-contents";

export const metadata = { title: "Your cart" };

export default function CartPage() {
  return (
    <div className="storefront">
      <SiteHeader />
      <main className="commerce-page section-wrap">
        <p className="eyebrow"><span className="eyebrow-line" />Your selections</p>
        <h1 className="commerce-heading">Shopping cart</h1>
        <CartContents />
      </main>
      <SiteFooter />
    </div>
  );
}
