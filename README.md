# Amazon MCP App

> [!WARNING]
> **Extremely experimental.** This is a demo/spike to exercise the MCP Apps
> (interactive widget) surface. APIs, tool shapes, and the widget itself will
> change without notice. Not affiliated with Amazon.

**Live endpoint:** `https://amazon-mcp-app.vercel.app/mcp` (streamable-HTTP)

Claude Desktop config:
```json
{
  "mcpServers": {
    "amazon-shopping": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://amazon-mcp-app.vercel.app/mcp", "--transport", "http-only"]
    }
  }
}
```

---

Demo MCP app that lets Claude **deep-research Amazon products** across many
keyword searches, then present a curated set in an **interactive,
Amazon-flavored carousel widget** the user can add-to-cart from — checkout
hands off to the real `amazon.com` cart.

Built on the official TypeScript MCP SDK + `@modelcontextprotocol/ext-apps`.
Headless aside from the one widget. Stateless streamable-HTTP transport, so it
drops straight onto Vercel / any Node host.

```
┌──────────┐  search_amazon ×N   ┌────────────────┐
│  Claude  │────────────────────>│ amazon-mcp-app │──> SerpApi (Amazon engine)
│   host   │<─────── JSON ───────│  (remote HTTP) │    (swap for PA-API later)
│          │                     │                │
│          │ present_amazon_…    │                │
│          │────────────────────>│                │
│ ┌──────┐ │<── widget ref ──────│  widgets/      │
│ │iframe│ │<── resources/read ──│  carousel.html │
│ │ 🛒   │ │                     └────────────────┘
│ └──┬───┘ │
└────┼─────┘
     └─ "Go to cart" → https://www.amazon.com/gp/aws/cart/add.html?ASIN.1=…
```

---

## Tools

| Tool | Kind | What it does |
|---|---|---|
| `search_amazon` | headless, read-only | Keyword search via SerpApi's Amazon engine. Returns `{ asin, title, price, rating, reviews, prime, thumbnail, url }[]`. Claude is instructed to call this **multiple times** with different phrasings to explore the option space. |
| `present_amazon_products` | MCP-app widget | Takes a curated `products[]` (from search results) and renders a sideways-scrolling carousel. Users toggle **Add to cart** per item; **Go to cart** opens `amazon.com/gp/aws/cart/add.html?ASIN.1=…&Quantity.1=…` in a new tab. Cart state is echoed back to Claude via `updateModelContext`. |

The widget handles both **same-category comparisons** ("5 quiet mechanical
keyboards") and **cross-category bundles** ("desk setup: keyboard + mat +
lamp") — it's just a flat list of ASINs, heading is free-form.

---

## Run locally

```bash
npm install
export SERPAPI_KEY=your_key_here   # https://serpapi.com/manage-api-key
npm run dev                        # → POST http://localhost:3000/mcp
```

Poke it with the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector
# → Streamable HTTP → http://localhost:3000/mcp → Connect
```

Or connect from Claude Code:

```bash
claude mcp add --transport http amazon http://localhost:3000/mcp
```

---

## Env

| Var | Required | Notes |
|---|---|---|
| `SERPAPI_KEY` | ✅ | SerpApi key. **Stand-in** for the real Amazon Product Advertising API — `src/serpapi.ts` is the only file that needs swapping. |
| `PORT` | – | Defaults to `3000`. |

---

## Layout

```
src/
  server.ts       MCP server: 2 tools + 1 UI resource, express /mcp endpoint
  serpapi.ts      Amazon search backend (SerpApi today, PA-API tomorrow)
widgets/
  amazon-carousel.html   iframe widget — vanilla JS, ext-apps App class,
                         Amazon-styled (orange/yellow, smile, star ratings,
                         prime badge, super-script price)
```

---

## Deploy (Vercel)

The server exports its Express app as `default` and the transport is
**stateless** (fresh `StreamableHTTPServerTransport` per request), so it maps
cleanly to serverless. Add a `vercel.json` that routes `POST /mcp` to the
build output and set `SERPAPI_KEY` in project env — details in the next step.

---

## Swapping SerpApi → real Amazon API

`src/serpapi.ts` exports a single `searchAmazon(query, opts) → AmazonProduct[]`
contract. Replace the fetch body with PA-API 5.0's `SearchItems` call and map
its response into the same `AmazonProduct` shape. Nothing else changes.
