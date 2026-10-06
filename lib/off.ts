import { cacheLife } from "next/cache";

/** Network/timeout failure reaching Open Food Facts — not a missing product. */
export class OffUnreachableError extends Error {
  constructor(cause?: unknown) {
    super("Couldn't reach Open Food Facts — check your connection and try again.");
    this.name = "OffUnreachableError";
    this.cause = cause;
  }
}

export type OffProduct = {
  barcode: string;
  name: string | null;
  brands: string | null;
  categories: string[];
  quantity: string | null;
  stores: string | null;
  expirationDate: string | null;
};

const FIELDS = [
  "product_name",
  "brands",
  "categories",
  "categories_tags",
  "quantity",
  "stores",
  "expiration_date",
].join(",");

/**
 * Looks a barcode up in Open Food Facts (ODbL). Cached for a day so repeat
 * scans of the same product don't hit the API. Returns null when unknown.
 */
export async function lookupOffProduct(
  barcode: string,
): Promise<OffProduct | null> {
  "use cache";
  cacheLife("days");

  if (!/^\d{6,14}$/.test(barcode)) return null;

  const url = `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=${FIELDS}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "User-Agent": "ParsleyPantry/1.0 (personal pantry app)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    throw new OffUnreachableError(error);
  }

  if (!response.ok) return null;

  let body: {
    status?: number;
    product?: {
      product_name?: string;
      brands?: string;
      categories?: string;
      categories_tags?: string[];
      quantity?: string;
      stores?: string;
      expiration_date?: string;
    };
  };
  try {
    body = (await response.json()) as typeof body;
  } catch (error) {
    throw new OffUnreachableError(error);
  }

  if (body.status !== 1 || !body.product) return null;

  const product = body.product;
  const categories = (product.categories ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return {
    barcode,
    name: product.product_name?.trim() || null,
    brands: product.brands?.trim() || null,
    categories: [
      ...new Set([...categories, ...(product.categories_tags ?? [])]),
    ],
    quantity: product.quantity?.trim() || null,
    stores: product.stores?.trim() || null,
    expirationDate: product.expiration_date?.trim() || null,
  };
}
