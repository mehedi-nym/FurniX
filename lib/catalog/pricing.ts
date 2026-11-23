import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type PriceInput = {
  productId: string;
  variantId?: string | null;
  quantity: number;
  customization: {
    dimensions: Record<string, number>;
    options: string[];
    features: Record<string, boolean>;
  };
};

export class PricingError extends Error {
  constructor(message: string, readonly kind: "invalid" | "quote" | "unavailable" = "invalid") {
    super(message);
  }
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isCurrent(rule: { valid_from: string | null; valid_until: string | null }, now: number) {
  return (!rule.valid_from || Date.parse(rule.valid_from) <= now)
    && (!rule.valid_until || Date.parse(rule.valid_until) > now);
}

export async function estimateProductPrice(input: PriceInput) {
  const admin = createAdminClient();
  const { data: product, error: productError } = await admin
    .from("products")
    .select("id,name,sku,currency,base_price,discount_price,dimensions,availability_status,stock_quantity,is_published")
    .eq("id", input.productId)
    .maybeSingle();
  if (productError || !product || !product.is_published || product.availability_status === "unavailable") {
    throw new PricingError("This product is not available.", "unavailable");
  }

  let variant: { id: string; sku: string; price_override: number | null; price_delta: number; stock_quantity: number | null } | null = null;
  if (input.variantId) {
    const { data, error } = await admin.from("product_variants")
      .select("id,sku,price_override,price_delta,stock_quantity")
      .eq("id", input.variantId)
      .eq("product_id", input.productId)
      .eq("is_active", true)
      .maybeSingle();
    if (error || !data) throw new PricingError("That variation is no longer available.", "unavailable");
    variant = data;
  }

  const [{ data: groups }, { data: ruleRows }, { data: mappings }] = await Promise.all([
    admin.from("product_option_groups").select("id,selection_mode,is_required").eq("product_id", input.productId),
    admin.from("product_customization_rules")
      .select("id,name,target_type,target_key,charge_type,amount,per_unit_basis,percentage_base,minimum_value,maximum_value,manual_quote_only,valid_from,valid_until,priority")
      .eq("product_id", input.productId)
      .eq("is_active", true)
      .order("priority", { ascending: true }),
    variant
      ? admin.from("variant_option_values").select("group_id,option_id").eq("variant_id", variant.id)
      : Promise.resolve({ data: [] }),
  ]);

  const selectedIds = [...new Set(input.customization.options)];
  if (selectedIds.length !== input.customization.options.length) throw new PricingError("Remove duplicate options.");
  const selectedOptions: Array<{ id: string; group_id: string; label: string; value: string; price_delta: number }> = [];
  if (selectedIds.length) {
    const { data, error } = await admin.from("product_options")
      .select("id,group_id,label,value,price_delta")
      .in("id", selectedIds)
      .eq("is_active", true);
    if (error || !data || data.length !== selectedIds.length) throw new PricingError("One of the selected options is unavailable.", "unavailable");
    const { data: optionGroups } = await admin.from("product_option_groups")
      .select("id,product_id")
      .in("id", data.map((option) => option.group_id));
    const groupProductIds = new Map((optionGroups ?? []).map((group) => [group.id, group.product_id]));
    if (data.some((option) => groupProductIds.get(option.group_id) !== input.productId)) {
      throw new PricingError("One of the selected options is unavailable.", "unavailable");
    }
    selectedOptions.push(...data);
  }

  const groupRows = groups ?? [];
  const variantMappings = mappings ?? [];
  for (const group of groupRows) {
    const selectedForGroup = selectedOptions.filter((option) => option.group_id === group.id);
    const variantOption = variantMappings.find((mapping) => mapping.group_id === group.id);
    if (group.is_required && !variantOption && !selectedForGroup.length) {
      throw new PricingError("Choose the required product options.");
    }
    if (group.selection_mode === "single" && selectedForGroup.length > 1) {
      throw new PricingError("Choose one option for each group.");
    }
    if (group.selection_mode === "single" && variantOption && selectedForGroup.some((option) => option.id !== variantOption.option_id)) {
      throw new PricingError("The selected options do not match this variation.");
    }
  }

  if (groupRows.some((group) => group.is_required) && !variant && groupRows.some((group) => group.is_required && !selectedOptions.some((option) => option.group_id === group.id))) {
    throw new PricingError("Choose the required product options.");
  }
  const rules = (ruleRows ?? []).filter((rule) => isCurrent(rule, Date.now()));
  const dimensions = input.customization.dimensions;
  const features = input.customization.features;
  const baseDimensions = (product.dimensions ?? {}) as Record<string, unknown>;

  for (const [key, value] of Object.entries(dimensions)) {
    const baseline = Number(baseDimensions[key]);
    if (!Number.isFinite(baseline)) throw new PricingError("That dimension cannot be customized.", "quote");
    if (value !== baseline) {
      const matching = rules.filter((rule) => rule.target_type === "dimension" && rule.target_key === key);
      if (matching.some((rule) => rule.manual_quote_only)) throw new PricingError("This dimension needs a custom quotation.", "quote");
      if (!matching.length) throw new PricingError("This dimension needs a custom quotation.", "quote");
    }
  }

  for (const option of selectedOptions) {
    if (rules.some((rule) => rule.target_type === "option" && rule.target_key === option.id && rule.manual_quote_only)) {
      throw new PricingError("This option needs a custom quotation.", "quote");
    }
  }
  for (const [key, selected] of Object.entries(features)) {
    if (!selected) continue;
    const matching = rules.filter((rule) => rule.target_type === "feature" && rule.target_key === key);
    if (!matching.length || matching.some((rule) => rule.manual_quote_only)) {
      throw new PricingError("This feature needs a custom quotation.", "quote");
    }
  }

  const effectiveBase = Number(product.discount_price ?? product.base_price);
  const baseUnit = variant
    ? Number(variant.price_override ?? effectiveBase) + Number(variant.price_delta)
    : effectiveBase;
  let unitPrice = baseUnit;
  const mappedOptionIds = new Set(variantMappings.map((mapping) => mapping.option_id));
  for (const option of selectedOptions) {
    if (!mappedOptionIds.has(option.id)) unitPrice += Number(option.price_delta);
  }

  const breakdown: Array<{ name: string; amount: number }> = [];
  let ruleTotal = 0;
  for (const rule of rules.filter((candidate) => !candidate.manual_quote_only)) {
    let selected = false;
    let dimensionValue = 0;
    let baseline = 0;

    if (rule.target_type === "dimension" && Object.hasOwn(dimensions, rule.target_key)) {
      dimensionValue = dimensions[rule.target_key];
      baseline = Number(baseDimensions[rule.target_key]);
      selected = dimensionValue !== baseline;
      if (selected && ((rule.minimum_value !== null && dimensionValue < Number(rule.minimum_value))
        || (rule.maximum_value !== null && dimensionValue > Number(rule.maximum_value)))) {
        throw new PricingError("That dimension is outside the supported range.", "quote");
      }
    } else if (rule.target_type === "option") {
      selected = selectedIds.includes(rule.target_key);
    } else if (rule.target_type === "feature") {
      selected = features[rule.target_key] === true;
    }

    if (!selected || rule.amount === null || !rule.charge_type) continue;
    let charge = 0;
    const amount = Number(rule.amount);
    if (rule.charge_type === "fixed") charge = amount * input.quantity;
    if (rule.charge_type === "per_unit") {
      if (rule.per_unit_basis === "dimension_delta") {
        if (rule.target_type !== "dimension") throw new PricingError("Pricing rule needs review.", "unavailable");
        charge = amount * Math.max(dimensionValue - baseline, 0) * input.quantity;
      } else {
        charge = amount * input.quantity;
      }
    }
    if (rule.charge_type === "percentage") {
      const percentageBase = rule.percentage_base === "base_price" ? baseUnit : unitPrice;
      charge = percentageBase * amount / 100 * input.quantity;
    }
    charge = money(charge);
    ruleTotal = money(ruleTotal + charge);
    breakdown.push({ name: rule.name, amount: charge });
  }

  const extra = ruleTotal;
  const lineTotal = money(unitPrice * input.quantity + extra);
  const stock = variant ? variant.stock_quantity : product.stock_quantity;
  if (product.availability_status === "available" && stock !== null && Number(stock) < input.quantity) {
    throw new PricingError("There is not enough stock for this quantity.", "unavailable");
  }

  return {
    productName: product.name as string,
    currency: product.currency as string,
    quantity: input.quantity,
    unitPrice: money(lineTotal / input.quantity),
    lineTotal,
    breakdown,
    variantSku: variant?.sku ?? null,
  };
}
