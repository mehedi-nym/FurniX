import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Play } from "lucide-react";
import { SiteFooter } from "@/components/storefront/site-footer";
import { SiteHeader } from "@/components/storefront/site-header";
import { getInteriorReferenceCategories, getInteriorReferences } from "@/lib/interiors/queries";

export const metadata = { title: "Interior design inspiration" };
export const instant = false;

type PageProps = { searchParams: Promise<{ category?: string }> };

export default async function InteriorDesignPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const categorySlug = params.category?.trim() ?? "";
  const [categories, references] = await Promise.all([
    getInteriorReferenceCategories(),
    getInteriorReferences(categorySlug),
  ]);
  const selectedCategory = categories.find((category) => category.slug === categorySlug);

  return (
    <div className="storefront">
      <SiteHeader />
      <main className="interior-gallery-page">
        <section className="interior-gallery-hero section-wrap">
          <p className="eyebrow"><span className="eyebrow-line" />Furni X / Interior design</p>
          <div className="interior-gallery-hero-row"><div><h1>Rooms with a<br /><em>point of view.</em></h1><p>Explore materials, light, and room ideas. Save references that speak to you, then tell us what you’d like to create.</p></div><Link className="button button-dark" href="/interior-design/quote">Request an interior quote <ArrowRight size={16} aria-hidden="true" /></Link></div>
        </section>

        <section className="interior-gallery-tools section-wrap" aria-label="Filter interior references">
          <nav className="category-chips" aria-label="Design categories">
            <Link className={!categorySlug ? "category-chip is-active" : "category-chip"} href="/interior-design">All ideas</Link>
            {categories.map((category) => <Link className={categorySlug === category.slug ? "category-chip is-active" : "category-chip"} href={`/interior-design?category=${encodeURIComponent(category.slug)}`} key={category.id}>{category.name}</Link>)}
          </nav>
          <span>{selectedCategory?.name ?? "Interior references"}</span>
        </section>

        <section className="interior-reference-grid section-wrap" aria-label="Interior design reference gallery">
          {references.length ? references.map((reference, index) => {
            const media = reference.media[0];
            return (
              <article className={`interior-reference-card reference-card-${index % 3}`} key={reference.id}>
                <div className="interior-reference-visual">
                  {media?.media_type === "video" ? <video src={media.public_url} aria-label={media.alt_text || reference.project_name} controls playsInline preload="metadata" /> : media ? <Image src={media.public_url} alt={media.alt_text || reference.project_name} width={900} height={1000} unoptimized /> : <div className="reference-image-placeholder" aria-hidden="true"><span>F—X</span></div>}
                  {media?.media_type === "video" && <span className="reference-video-mark" aria-hidden="true"><Play size={13} fill="currentColor" /></span>}
                </div>
                <div className="interior-reference-info">
                  <div><p className="product-card-sku">{reference.category?.name ?? reference.room_type ?? "Interior idea"}</p><h2>{reference.project_name}</h2></div>
                  <Link className="reference-link" href={`/interior-design/quote?referenceId=${encodeURIComponent(reference.id)}`} aria-label={`Use ${reference.project_name} as a reference`}>Use as reference <ArrowUpRight size={14} aria-hidden="true" /></Link>
                  {reference.description && <p className="interior-reference-description">{reference.description}</p>}
                  {reference.materials.length > 0 && <p className="interior-reference-materials">{reference.materials.join(" · ")}</p>}
                </div>
              </article>
            );
          }) : <div className="interior-gallery-empty"><span className="empty-mark">F—X</span><h2>{selectedCategory ? "No references in this category yet" : "Interior ideas are being prepared"}</h2><p>Our reference gallery is being prepared. You can still share your room, requirements, and style preferences with us.</p><Link className="button button-dark" href="/interior-design/quote">Tell us about your space <ArrowRight size={16} aria-hidden="true" /></Link><Link className="text-link" href="/products"><span>Browse furniture</span><ArrowUpRight size={14} aria-hidden="true" /></Link></div>}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
