"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Minus, Plus } from "lucide-react";
import type { CustomizationRule, ProductOptionGroup, ProductVariant } from "@/lib/catalog/queries";

type Estimate = { currency: string; lineTotal: number; unitPrice: number; breakdown: Array<{ name: string; amount: number }> };
type Props = {
  productId: string;
  productName: string;
  currency: string;
  baseDimensions: Record<string, number>;
  dimensionsUnit: string;
  optionGroups: ProductOptionGroup[];
  variants: ProductVariant[];
  customizationRules: CustomizationRule[];
};

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-BD", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

export function ProductConfigurator(props: Props) {
  const { productId, currency, baseDimensions, dimensionsUnit, optionGroups, variants, customizationRules } = props;
  const [optionIds, setOptionIds] = useState<string[]>([]);
  const [dimensions, setDimensions] = useState<Record<string, number>>(baseDimensions);
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [quantity, setQuantity] = useState(1);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [quoteRequired, setQuoteRequired] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const selectedVariant = useMemo(() => {
    if (!variants.length) return null;
    return variants.find((variant) => variant.option_ids.every((id) => optionIds.includes(id))
      && optionGroups.filter((group) => group.selection_mode === "single" && group.is_required)
        .every((group) => {
          const selected = optionIds.filter((id) => group.options.some((option) => option.id === id));
          const mapped = variant.option_ids.find((id) => group.options.some((option) => option.id === id));
          return mapped ? selected.every((id) => id === mapped) : selected.length === 0;
        }));
  }, [variants, optionGroups, optionIds]);

  const selectedOptionsComplete = optionGroups
    .filter((group) => group.is_required)
    .every((group) => selectedVariant?.option_ids.some((id) => group.options.some((option) => option.id === id))
      || optionIds.some((id) => group.options.some((option) => option.id === id)));

  const featureKeys = [...new Set(customizationRules
    .filter((rule) => rule.target_type === "feature" && !rule.manual_quote_only)
    .map((rule) => rule.target_key))];

  useEffect(() => {
    if (!selectedOptionsComplete || (variants.length > 0 && !selectedVariant)) {
      setEstimate(null);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setMessage("");
      setQuoteRequired(false);
      try {
        const response = await fetch("/api/pricing/estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId,
            variantId: selectedVariant?.id ?? null,
            quantity,
            customization: { dimensions, optionIds, features },
          }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) {
          setEstimate(null);
          setQuoteRequired(Boolean(data.quoteRequired));
          setMessage(data.error ?? "Price is unavailable for this selection.");
          return;
        }
        setEstimate(data as Estimate);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setMessage("Price estimate is temporarily unavailable.");
        }
      } finally {
        setLoading(false);
      }
    }, 220);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [productId, quantity, dimensions, optionIds, features, selectedVariant, selectedOptionsComplete, variants.length]);

  function toggleOption(group: ProductOptionGroup, optionId: string) {
    setOptionIds((current) => {
      if (group.selection_mode === "single") {
        return [...current.filter((id) => !group.options.some((option) => option.id === id)), optionId];
      }
      return current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId];
    });
  }

  async function addToCart() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/cart/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          variantId: selectedVariant?.id ?? null,
          quantity,
          customization: { dimensions, optionIds, features },
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setQuoteRequired(Boolean(data.quoteRequired));
        setMessage(data.error ?? "Could not add this item to the cart.");
      } else {
        setMessage("Added to your cart.");
      }
    } catch {
      setMessage("Could not add this item to the cart.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="product-configurator">
      {optionGroups.map((group) => (
        <fieldset className="config-group" key={group.id}>
          <legend>{group.name}{group.is_required && <span> · Required</span>}</legend>
          <div className="config-options">
            {group.options.map((option) => {
              const selected = optionIds.includes(option.id) || Boolean(selectedVariant?.option_ids.includes(option.id));
              return (
                <label className={selected ? "config-option is-selected" : "config-option"} key={option.id}>
                  <input
                    type={group.selection_mode === "single" ? "radio" : "checkbox"}
                    name={`option-${group.id}`}
                    checked={selected}
                    onChange={() => toggleOption(group, option.id)}
                    aria-label={`${group.name}: ${option.label}`}
                  />
                  <span>{option.label}</span>
                  {option.price_delta > 0 && <small>+ {money(option.price_delta, currency)}</small>}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}

      {Object.keys(baseDimensions).length > 0 && (
        <fieldset className="config-group dimension-group">
          <legend>Dimensions {dimensionsUnit && <span>· {dimensionsUnit}</span>}</legend>
          {Object.entries(baseDimensions).map(([key, baseline]) => {
            const rule = customizationRules.find((item) => item.target_type === "dimension" && item.target_key === key && !item.manual_quote_only);
            return (
              <label className="dimension-input" key={key}>
                <span>{key.replaceAll("_", " ")}</span>
                <input
                  type="number"
                  min={rule?.minimum_value ?? baseline}
                  max={rule?.maximum_value ?? baseline}
                  step="0.1"
                  value={dimensions[key] ?? baseline}
                  onChange={(event) => setDimensions((current) => ({ ...current, [key]: Number(event.target.value) }))}
                  aria-label={`${key} in ${dimensionsUnit || "the selected unit"}`}
                />
              </label>
            );
          })}
        </fieldset>
      )}

      {featureKeys.length > 0 && (
        <fieldset className="config-group">
          <legend>Additional features</legend>
          <div className="config-features">
            {featureKeys.map((key) => (
              <label key={key}>
                <input type="checkbox" checked={features[key] ?? false} onChange={(event) => setFeatures((current) => ({ ...current, [key]: event.target.checked }))} />
                <span>{key.replaceAll("_", " ")}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="config-quantity-row">
        <span>Quantity</span>
        <div className="quantity-control">
          <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} aria-label="Decrease quantity"><Minus size={14} /></button>
          <span aria-live="polite">{quantity}</span>
          <button type="button" onClick={() => setQuantity((value) => Math.min(20, value + 1))} aria-label="Increase quantity"><Plus size={14} /></button>
        </div>
      </div>

      <div className="config-price" aria-live="polite">
        <div><span>{loading ? "Updating price…" : "Estimated total"}</span><strong>{estimate ? money(estimate.lineTotal, estimate.currency) : "—"}</strong></div>
        {estimate?.breakdown.map((item, index) => <small key={`${item.name}-${index}`}>{item.name}: + {money(item.amount, estimate.currency)}</small>)}
      </div>

      {message && <p className={quoteRequired ? "config-message is-quote" : "config-message"} role="status">{message}</p>}
      {quoteRequired ? (
        <Link className="button button-dark config-submit" href="/#custom">Request a custom quote <ArrowRight size={16} aria-hidden="true" /></Link>
      ) : (
        <button className="button button-dark config-submit" type="button" onClick={addToCart} disabled={loading || !estimate || !selectedOptionsComplete || (variants.length > 0 && !selectedVariant)}>
          Add to cart <ArrowRight size={16} aria-hidden="true" />
        </button>
      )}
      <p className="config-assurance">Your final price is recalculated on the server before an order is placed.</p>
    </div>
  );
}
