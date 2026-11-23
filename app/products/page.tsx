import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Armchair, Search } from "lucide-react";
import { SiteFooter } from "@/components/storefront/site-footer";
import { SiteHeader } from "@/components/storefront/site-header";
import { getCatalogProducts, getCategories } from "@/lib/catalog/queries";

type PageProps = { searchParams: Promise<{ q?: string; category?: string }> };

export const instant = false;

function formatPrice(amount: number, currency: string) {
  return new Intl.NumberFormat("en-BD", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

export default async function ProductsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const categorySlug = params.category?.trim() ?? "";
  const [categories, products] = await Promise.all([
    getCategories(),
    getCatalogProducts({ query, categorySlug, limit: 48 }),
  ]);
  const selectedCategory = categories.find((category) => category.slug === categorySlug);

  return (
    <div className="storefront">
      <SiteHeader />
      <main className="catalog-page">
        <div className="catalog-heading section-wrap">
          <p className="eyebrow"><span className="eyebrow-line" />Furni X / Furniture</p>
          <h1>{selectedCategory?.name ?? "Furniture for living."}</h1>
          <p>Find a piece that feels right for your room, your routines, and the way you like to live.</p>
        </div>
        <section className="catalog-tools section-wrap" aria-label="Filter furniture">
          <nav className="category-chips" aria-label="Product categories">
            <Link className={!categorySlug ? "category-chip is-active" : "category-chip"} href="/products">All furniture</Link>
            {categories.map((category) => (
              <Link
                className={categorySlug === category.slug ? "category-chip is-active" : "category-chip"}
                href={`/products?category=${encodeURIComponent(category.slug)}`}
                key={category.id}
              >
                {category.name}
              </Link>
            ))}
          </nav>
          <form className="catalog-search" action="/products" role="search">
            {categorySlug && <input type="hidden" name="category" value={categorySlug} />}
            <label className="sr-only" htmlFor="catalog-query">Search furniture</label>
            <input id="catalog-query" name="q" type="search" placeholder="Search furniture" defaultValue={query} />
            <button type="submit" aria-label="Search"><Search size={17} aria-hidden="true" /></button>
          </form>
        </section>

        <section className="product-grid section-wrap" aria-label="Furniture catalogue">
          {products.length ? products.map((product) => {
            const image = product.media[0];
            const price = product.discount_price ?? product.base_price;
            return (
              <article className="product-card" key={product.id}>
                <Link className="product-card-image" href={`/products/${product.slug}`} aria-label={`View ${product.name}`}>
                  {image ? (
                    <Image src={image.public_url} alt={image.alt_text || product.name} width={720} height={760} unoptimized />
                  ) : (
                    <span className="product-image-placeholder" aria-hidden="true"><Armchair size={53} strokeWidth={1} /></span>
                  )}
                  {product.is_featured && <span className="product-ribbon">Featured</span>}
                </Link>
                <div className="product-card-info">
                  <div>
                    <Link className="product-card-name" href={`/products/${product.slug}`}>{product.name}</Link>
                    <p className="product-card-sku">{product.sku}</p>
                  </div>
                  <p className="product-card-price">
                    {product.discount_price !== null && <del>{formatPrice(product.base_price, product.currency)}</del>}
                    <span>{formatPrice(price, product.currency)}</span>
                  </p>
                </div>
              </article>
            );
          }) : (
            <div className="catalog-empty">
              <span className="empty-mark"><Armchair size={35} strokeWidth={1} aria-hidden="true" /></span>
              <h2>{query || selectedCategory ? "No furniture found" : "The catalogue is taking shape"}</h2>
              <p>{query || selectedCategory ? "Try another search or explore all furniture." : "Published furniture will appear here as the catalogue is prepared."}</p>
              {(query || selectedCategory) && <Link href="/products" className="text-link">Clear filters <ArrowRight size={15} aria-hidden="true" /></Link>}
            </div>
          )}
        </section>
        <div className="catalog-bottom section-wrap"><span>Showing {products.length} {products.length === 1 ? "piece" : "pieces"}</span></div>
      </main>
      <SiteFooter />
    </div>
  );
}
