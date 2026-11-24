import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-main section-wrap">
        <div className="footer-brand-block">
          <Link className="brand brand-footer" href="/" aria-label="Furni X home">
            <span className="brand-symbol" aria-hidden="true"><span /></span>
            <span className="brand-wordmark">Furni<span>X</span></span>
          </Link>
          <p>Furniture and interior ideas<br />for the way you live.</p>
        </div>
        <div className="footer-links">
          <p className="footer-label">Explore</p>
          <Link href="/products">Furniture</Link>
          <Link href="/interior-design">Interior design</Link>
          <Link href="/custom-furniture">Custom ideas</Link>
        </div>
        <div className="footer-links">
          <p className="footer-label">Discover</p>
          <Link href="/#approach">Our approach</Link>
          <Link href="/#main-content">Back to top <ArrowUpRight size={13} aria-hidden="true" /></Link>
        </div>
        <div className="footer-note">
          <span className="footer-note-mark" aria-hidden="true">F—X</span>
          <p>Make room for living.</p>
        </div>
      </div>
      <div className="footer-bottom section-wrap">
        <span>© Furni X</span>
        <span>Designed with room to make it yours.</span>
        <Link href="#main-content">Back to top ↑</Link>
      </div>
    </footer>
  );
}
