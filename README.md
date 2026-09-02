# MY NFT Landing

Static landing page for an NFT collection — same visual style and structure as a typical "sold-out" mint page (hero, progress, mint card, wallet/review modals).

## Files
- `index.html` — markup
- `styles.css` — styles
- `app.js` — interactivity (modals, count-up, qty controls)
- `config.js` — **edit your data here** (brand, links, contract, chain)
- `img/` — placeholder logo (`logo.svg`) and preview (`preview.svg`)

## Configure
Open `config.js` and set:
- `brand.name`, `brand.tagline`, `brand.logo`
- `links.opensea`, `links.x`, `links.explorer`
- `contract.address`, `contract.shortAddress`, `contract.explorerUrl`
- `chain.name`, `chain.chainId`, `chain.explorer`
- `mint.totalSupply`, `mint.minted`, `mint.priceEth`, `mint.maxPerWallet`
- `mint.soldOut: true` keeps CTA as "Buy on OpenSea"; `false` enables real mint

Replace `img/preview.svg` with your collection artwork (1200×1200 recommended).

## Add gallery images
Put images into the `img/` folder, then list them in `config.js` under `gallery`:

```js
gallery: [
  "img/1.png",
  "img/2.png",
  "img/3.png",
  // add as many as you want — order = display order
]
```

The hero will turn into a carousel with:
- auto-rotation every 4s (pauses on hover, when tab is hidden)
- left/right arrows
- clickable dots
- keyboard arrows when the carousel is focused
- swipe on touch devices
- "1 / N" counter in the top-right

Supported formats: `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.svg`. First image loads eagerly, the rest lazy.

## Local preview
Open `index.html` directly in a browser, or:
```bash
npx serve .
```

## Deploy to Vercel
1. Push this folder to a GitHub repo.
2. Go to https://vercel.com/new → "Import Project" → pick the repo.
3. Framework preset: **Other** (no build). Output dir: `.`.
4. Click **Deploy**. You'll get a `https://<project>.vercel.app` URL.

To use a custom domain: Vercel project → Settings → Domains → add your domain and follow the DNS instructions.

## Optional: real Web3 mint
The site ships with a wallet modal but **does not connect to a real wallet by default**. To enable:
1. Add `<script src="https://cdn.jsdelivr.net/npm/ethers@6/dist/ethers.umd.min.js"></script>` to `index.html`.
2. In `app.js`, replace the demo `wallet-btn` handler with `new ethers.BrowserProvider(window.ethereum).send("eth_requestAccounts", [])`.
3. Replace the mint button handler with a `contract.mint(qty, { value: ethers.parseEther(price * qty) })` call. You'll need your contract ABI and address from `config.js`.
4. Set `mint.soldOut: false` in `config.js` when your sale is live.

## ⚠️ Disclaimer
Use only with contracts you trust. This template does not perform any transactions until you wire up real Web3 code. If someone DMs you a "mint" link for this site, it's a scam.