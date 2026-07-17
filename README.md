# Pattern Lab

Draw candlestick chart patterns by hand — the way you'd sketch them on paper, but with real OHLC values you can drag around. Add levels, trendlines, arrows and labels, import real price data to reshape, and export or share what you make. Everything runs in the browser; nothing is uploaded.

**Live:** https://davidsenack.github.io/pattern-lab/

## Run locally

```sh
python3 -m http.server 8642 --directory ./
```

Then open http://localhost:8642. No build step, no dependencies, no backend — just static files (`index.html`, `style.css`, `app.js`).

## Use

| Action | How |
|---|---|
| Add candle | `C` then click, double-click empty space, or use the Shapes menu |
| Shapes & Patterns menus | Top-bar dropdowns: classic candles (marubozu, dojis, hammer, star…) and multi-bar patterns (engulfing, morning/evening doji star, harami, soldiers/crows) — click an item to append after the last bar, or drag it onto the chart to drop at an exact bar and price. Appending pins the first open to the prior close; patterns land as one undo step |
| Reshape candle | Pull the round wick dots (high/low) or the body-edge pills (open/close) — drags are relative, so values never jump to the cursor |
| Move candle | Drag anywhere else on the candle — vertical moves price, horizontal moves bars (occupied slots swap) |
| Flip bull/bear | Double-click the candle, or "Flip direction" in the inspector |
| Exact values | Select a candle and type into the O/H/L/C inspector fields |
| Style anything | Select an object — the inspector gives per-candle colour; colour, weight and solid/dashed for levels, trendlines and arrows; colour and size for labels. "↺" resets a colour to the theme default |
| Axis | Axis menu — switch the bottom axis from bar numbers to clock time (1m…1W timeframe + start time), and set price-axis decimals (auto or fixed). Saved and shared with the pattern |
| Price level | `L` then click at a price; drag to move |
| Trendline / Arrow | `T` / `A`, then click the start point and click the end point (a live preview follows the cursor between clicks); endpoints stay draggable. Right-click or `Esc` returns to the pointer tool |
| Label | `X`, then click and type; double-click a label to edit it later |
| Zoom / pan | Scroll = price zoom · ⌘/ctrl-scroll = bar zoom · alt-drag or right-drag = pan · drag the axes to scale |
| Fit / undo / delete | `F` · `⌘Z` / `⇧⌘Z` · `⌫` on selection |
| Themes | Theme menu — Graphite, Midnight, Paper (light), Fjord. Remembered across visits |
| Save / load patterns | Library menu — name the canvas and Save; click a saved row to load it (undo restores the previous canvas); ✕ deletes. Stored in localStorage |
| Export data | Library → CSV (`bar,open,high,low,close`) or JSON (candles + levels + trendlines + arrows + labels) |
| Import price data | Library → Import… — paste or choose a file: CSV with an open/high/low/close header (extra columns ignored), bare 4-column `o,h,l,c` rows, or JSON from here. Long series keep their last 300 bars; wick/body inconsistencies are auto-repaired |
| Export image | PNG button (2× resolution) |
| Share | Link button copies a URL with the whole pattern encoded in the `#` fragment — no server involved |
| Help | `?` or the `?` button |

Body edges push wicks outward as you drag past them; wicks clamp at the body. Dragging a body edge through the other side flips the candle's direction naturally.

## Deploy

Any static host works. This copy is published with **GitHub Pages** from the `main` branch root — push changes and Pages redeploys automatically. For a custom domain or preview builds, Cloudflare Pages / Netlify point at the same files with zero config.

Pattern Lab is a drawing tool for studying chart shapes — not trading advice.
