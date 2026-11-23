import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/storefront/site-footer";
import { SiteHeader } from "@/components/storefront/site-header";
import { ProductConfigurator } from "@/components/storefront/product-configurator";
import { getProductBySlug } from "@/lib/catalog/queries";

type PageProps = { params: Promise<{ slug: string }> };

export const instant = false;

function formatPrice(amount: number, currency: string) {
  return new Intl.NumberFormat("en-BD", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Furniture" };
  return {
    title: product.name,
    description: product.description ?? `${product.name} from Furni X.`,
  };
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();
  const displayPrice = product.discount_price ?? product.base_price;
  const dimensions = Object.fromEntries(
    Object.entries(product.dimensions ?? {}).filter(([, value]) => typeof value === "number"),
  ) as Record<string, number>;

  return (
    <div className="storefront">
      <SiteHeader />
      <main className="product-detail section-wrap">
        <div className="product-breadcrumb">
          <Link href="/products"><ArrowLeft size={14} aria-hidden="true" />Furniture</Link>
          <span>/</span>
          <span>{product.name}</span>
        </div>
        <div className="product-detail-grid">
          <div className="product-gallery" aria-label={`${product.name} images`}>
            {product.media.length ? product.media.map((image, index) => (
              <div className={index === 0 ? "product-gallery-image is-primary" : "product-gallery-image"} key={image.id}>
                <Image src={image.public_url} alt={image.alt_text || product.name} width={900} height={900} unoptimized priority={index === 0} />
              </div>
            )) : (
              <div className="product-gallery-placeholder"><span>{product.name.slice(0, 1)}</span><small>Product photography coming soon</small></div>
            )}
          </div>
          <div className="product-detail-info">
            <div className="product-category-tags">
              {product.categories.map((category) => <Link href={`/products?category=${category.slug}`} key={category.id}>{category.name}</Link>)}
            </div>
            <p className="eyebrow"><span className="eyebrow-line" />{product.sku}</p>
            <h1>{product.name}</h1>
            {product.description && <p className="product-detail-description">{product.description}</p>}
            <div className="product-detail-price">
              {product.discount_price !== null && <del>{formatPrice(product.base_price, product.currency)}</del>}
              <span>{formatPrice(displayPrice, product.currency)}</span>
              <small>Starting price · final price confirmed before order</small>
            </div>

            <ProductConfigurator
              productId={product.id}
              productName={product.name}
              currency={product.currency}
              baseDimensions={dimensions}
              dimensionsUnit={typeof product.dimensions?.unit === "string" ? product.dimensions.unit : ""}
              optionGroups={product.optionGroups}
              variants={product.variants}
              customizationRules={product.customizationRules}
            />

            {product.materials.length > 0 && (
              <div className="product-materials"><span>Materials</span><p>{product.materials.join(" · ")}</p></div>
            )}
            {Object.keys(product.specifications ?? {}).length > 0 && (
              <details className="product-specifications">
                <summary>Specifications <span>+</span></summary>
                <dl>{Object.entries(product.specifications).map(([key, value]) => (
                  <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{String(value)}</dd></div>
                ))}</dl>
              </details>
            )}
            <Link className="product-quote-link" href="/#custom">Have a different idea? Ask about a custom piece <ArrowUpRight size={14} aria-hidden="true" /></Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
