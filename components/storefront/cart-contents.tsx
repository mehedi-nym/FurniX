"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Minus, Plus, Trash2 } from "lucide-react";

type CartItem = {
  id: string;
  productSlug: string;
  productName: string;
  sku: string;
  imageUrl: string | null;
  quantity: number;
  customization: { dimensions?: Record<string, number>; options?: string[]; features?: Record<string, boolean> };
  price: { currency: string; lineTotal: number } | null;
  quoteRequired: boolean;
};

type CartResponse = { items: CartItem[]; subtotal: number; currency: string; error?: string };

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-BD", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

export function CartContents() {
  const [cart, setCart] = useState<CartResponse>({ items: [], subtotal: 0, currency: "BDT" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch("/api/cart", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load your cart.");
      setCart(data as CartResponse);
      setError("");
    } catch {
      setError("Your cart is temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function changeQuantity(item: CartItem, quantity: number) {
    setBusyId(item.id);
    try {
      const response = await fetch(`/api/cart/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update this item.");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update this item.");
    } finally {
      setBusyId(null);
    }
  }

  async function removeItem(itemId: string) {
    setBusyId(itemId);
    try {
      const response = await fetch(`/api/cart/items/${itemId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not remove this item.");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove this item.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="cart-layout">
      <div className="cart-items-panel">
        {loading ? <p className="cart-loading">Loading your cart…</p> : null}
        {!loading && !cart.items.length && (
          <div className="cart-empty">
            <span className="empty-mark">F—X</span>
            <h2>Your cart is ready for something good.</h2>
            <p>Explore the furniture catalogue and add a piece that feels right.</p>
            <Link className="button button-dark" href="/products">Explore furniture <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
        )}
        {cart.items.map((item) => (
          <article className="cart-item" key={item.id}>
            <Link className="cart-item-image" href={`/products/${item.productSlug}`}>
              {item.imageUrl ? <Image src={item.imageUrl} alt={item.productName} width={240} height={240} unoptimized /> : <span aria-hidden="true">F—X</span>}
            </Link>
            <div className="cart-item-details">
              <p className="product-card-sku">{item.sku}</p>
              <Link className="cart-item-name" href={`/products/${item.productSlug}`}>{item.productName}</Link>
              {item.customization.dimensions && Object.keys(item.customization.dimensions).length > 0 && (
                <p className="cart-item-customization">{Object.entries(item.customization.dimensions).map(([key, value]) => `${key}: ${value}`).join(" · ")}</p>
              )}
              {item.quoteRequired ? <p className="cart-item-quote">This selection needs a custom quotation.</p> : null}
              <div className="cart-item-controls">
                <div className="quantity-control">
                  <button type="button" disabled={busyId === item.id || item.quantity <= 1} onClick={() => void changeQuantity(item, item.quantity - 1)} aria-label={`Decrease ${item.productName} quantity`}><Minus size={13} /></button>
                  <span>{item.quantity}</span>
                  <button type="button" disabled={busyId === item.id || item.quantity >= 20} onClick={() => void changeQuantity(item, item.quantity + 1)} aria-label={`Increase ${item.productName} quantity`}><Plus size={13} /></button>
                </div>
                <button className="remove-item" type="button" disabled={busyId === item.id} onClick={() => void removeItem(item.id)}><Trash2 size={14} aria-hidden="true" /> Remove</button>
              </div>
            </div>
            <p className="cart-item-price">{item.price ? money(item.price.lineTotal, item.price.currency) : "Price to be confirmed"}</p>
          </article>
        ))}
        {error && <p className="cart-error" role="alert">{error}</p>}
      </div>

      {!!cart.items.length && (
        <aside className="cart-summary">
          <p className="eyebrow"><span className="eyebrow-line" />Order summary</p>
          <div><span>Subtotal</span><strong>{money(cart.subtotal, cart.currency)}</strong></div>
          <p>Delivery is calculated at checkout.</p>
          <Link className="button button-dark" href="/checkout">Continue to checkout <ArrowRight size={16} aria-hidden="true" /></Link>
          <small>No account needed. Your final total is checked securely at checkout.</small>
        </aside>
      )}
    </div>
  );
}
