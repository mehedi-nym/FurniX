import Link from "next/link";
import { ArrowUpRight, Menu, ShoppingBag } from "lucide-react";

const navigation = [
  { href: "/products", label: "Furniture" },
  { href: "/#interiors", label: "Interior design" },
  { href: "/custom-furniture", label: "Custom ideas" },
  { href: "/#approach", label: "Our approach" },
];

function Brand() {
  return (
    <Link className="brand" href="/" aria-label="Furni X home">
      <span className="brand-symbol" aria-hidden="true"><span /></span>
      <span className="brand-wordmark">Furni<span>X</span></span>
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Brand />
        <nav className="desktop-nav" aria-label="Main navigation">
          {navigation.map((item) => <a href={item.href} key={item.href}>{item.label}</a>)}
        </nav>
        <div className="header-actions">
          <Link className="header-cart" href="/cart" aria-label="Shopping cart"><ShoppingBag size={17} aria-hidden="true" /><span>Cart</span></Link>
          <Link className="header-cta" href="/custom-furniture">Let’s talk <ArrowUpRight size={15} aria-hidden="true" /></Link>
        </div>
        <details className="mobile-nav">
          <summary aria-label="Open navigation"><Menu size={22} aria-hidden="true" /></summary>
          <nav aria-label="Mobile navigation">
            <Brand />
            {navigation.map((item) => <a href={item.href} key={item.href}>{item.label}</a>)}
            <Link href="/cart">Shopping cart</Link>
            <Link className="mobile-nav-cta" href="/custom-furniture">Let’s talk <ArrowUpRight size={15} aria-hidden="true" /></Link>
          </nav>
        </details>
      </div>
    </header>
  );
}
