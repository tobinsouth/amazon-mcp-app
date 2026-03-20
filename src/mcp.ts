import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerAppTool,
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { searchAmazon, type AmazonProduct } from "./serpapi.js";
import { CAROUSEL_HTML } from "./generated/carousel-html.js";

export const CAROUSEL_URI = "ui://widgets/amazon-carousel.html";

async function toDataUrl(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return undefined;
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get("content-type") ?? "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return undefined;
  }
}

export function buildServer() {
  const server = new McpServer(
    { name: "amazon-shopping", version: "0.1.0" },
    {
      instructions:
        "Shopping research assistant backed by live Amazon search. " +
        "Typical flow: (1) run `search_amazon` several times with different " +
        "keyword angles to map the option space, (2) curate the best " +
        "matches, (3) call `present_amazon_products` once to render an " +
        "interactive picker the user can add-to-cart from. Pass exactly one " +
        "product for a detail-page layout; two or more for a carousel. " +
        "Always use ASINs returned by search — never invent them. Include " +
        "a short `note` per product explaining why you picked it.",
    },
  );

  // ─── Tool 1: headless keyword search ────────────────────────────────────
  server.registerTool(
    "search_amazon",
    {
      description:
        "Keyword-search amazon.com and return structured product listings. " +
        "Each hit includes: asin, title, price, rating (0-5), review count, " +
        "prime eligibility, thumbnail URL, and product URL. Headless — call " +
        "this as many times as needed with different phrasings, narrowings, " +
        "or category angles before curating a final set to present.",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe("Keyword search, e.g. 'mechanical keyboard quiet'"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(40)
          .default(15)
          .describe("Max results to return"),
        page: z.number().int().min(1).default(1),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ query, limit, page }) => {
      const result = await searchAmazon(query, { limit, page });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  // ─── Tool 2: interactive carousel widget ────────────────────────────────
  const productInput = z.object({
    asin: z.string().describe("Amazon ASIN"),
    title: z.string(),
    price: z.string().optional().describe('Formatted, e.g. "$19.99"'),
    rating: z.number().min(0).max(5).optional(),
    reviews: z.number().int().optional(),
    thumbnail: z.string().url().optional(),
    prime: z.boolean().optional(),
    note: z
      .string()
      .optional()
      .describe(
        "One short sentence explaining why you picked this item for the " +
          "user (shown on the card). E.g. 'Quietest under $100' or " +
          "'Best-reviewed compact option'.",
      ),
  });

  registerAppTool(
    server,
    "present_amazon_products",
    {
      description:
        "Render an interactive Amazon-styled product picker in-chat. " +
        "Users click Add-to-cart on items they want, then 'Cart' opens " +
        "their Amazon basket in a new tab for real checkout. " +
        "Layout auto-adapts: 1 product → detail page (big image left, " +
        "title/price/rating/actions right, with a Buy-now shortcut); " +
        "2+ products → horizontal scroll carousel of search-result tiles. " +
        "Works for same-category comparisons, multi-item bundles, or a " +
        "single clear winner. Populate `note` on each product — it renders " +
        "as a callout on the card.",
      inputSchema: {
        heading: z
          .string()
          .default("Recommended for you")
          .describe("Carousel heading shown to the user"),
        products: z
          .array(productInput)
          .min(1)
          .max(24)
          .describe("Curated products to display"),
      },
      _meta: { ui: { resourceUri: CAROUSEL_URI } },
    },
    async ({ heading, products }) => {
      // Inline thumbnails as data: URLs — the iframe CSP blocks remote img-src.
      const inlined = await Promise.all(
        products.map(async (p) =>
          p.thumbnail
            ? { ...p, thumbnail: (await toDataUrl(p.thumbnail)) ?? p.thumbnail }
            : p,
        ),
      );
      const payload = {
        heading,
        products: inlined as AmazonProduct[],
        cartBaseUrl: "https://www.amazon.com/gp/aws/cart/add.html",
        associateTag: process.env.AMAZON_ASSOCIATE_TAG ?? "",
      };
      const summary =
        `Rendered carousel "${heading}" with ${products.length} product(s): ` +
        products.map((p) => `${p.title} (${p.asin})`).join(", ") +
        ". User can add items to cart in the widget.";
      return {
        content: [
          { type: "text", text: summary + "\n\n" + JSON.stringify(payload) },
        ],
      };
    },
  );

  registerAppResource(server, "Amazon Carousel", CAROUSEL_URI, {}, async () => ({
    contents: [
      { uri: CAROUSEL_URI, mimeType: RESOURCE_MIME_TYPE, text: CAROUSEL_HTML },
    ],
  }));

  return server;
}
