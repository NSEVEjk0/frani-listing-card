# Frani Listing Card

Turn one buy/sell intent into a clean, signed public listing card on Unicity testnet2. A card carries a title, price, expiry, and contact handle, signed with the seller's key so it cannot be altered in transit. The same intent is posted to the Unicity market bulletin board when that backend is reachable. Visitors can DM the seller for free, or request a paid introduction.

Made by **CRYPTFRANI**. Owner / creator: **Itachi**.

---

## Track

Payments and markets.

## Is it Agentic?

No. Frani Listing Card renders and signs a fixed card, forwards enquiries, and issues an introduction request. No autonomous behaviour, no model in the loop.

## Runs on AstridOS?

No.

## Live on-network

- Network: **testnet2**
- Wallet pubkey (from a live boot): `0220a481f084cb4f9996f0173c8b72dbb8091bad5b5b5a6aa1c9b22c383c7ce8e0`

Each deployment holds its own wallet and prints its address at startup.

## SDK features used

| Feature | Where |
| --- | --- |
| `sphere.market.postIntent()` | Publishes the intent to the market bulletin board |
| `sphere.market.search()` | Searches the bulletin board (`listing search`) |
| `sphere.signMessage()` | Signs each listing card |
| `verifySignedMessage()` / `recoverPubkeyFromSignature()` | Card verification |
| `sphere.communications` (DM) | `card` / `contact` / `intro` / `cards` |
| `sphere.payments.requests.create()` | Payment request for a paid introduction |
| `sphere.payments.send()` + safety guards | Refund of over/underpayment (only outbound path) |

## What makes it different

This is not a marketplace — it is a **single-intent card**. Each card is a self-contained, signed object: share the JSON anywhere and anyone can verify it came from the seller and has not been edited. The card is the product; the market bulletin board is an optional distribution channel layered on top via `market.postIntent`.

Because the card stands alone, the tool **degrades gracefully**: if the market backend is unreachable, `post` still creates and stores a valid, shareable, signed card and simply notes that publishing was skipped. Discovery (`search`) reports the backend status honestly rather than pretending. The free `contact` flow forwards a buyer's message straight to the seller's key; the optional paid `intro` connects both sides only after a real payment.

It is **earn-only**: the only outbound payment is a refund of over/underpayment on the introduction fee. There is no marketplace escrow and no custody.

> **Market backend note.** At the time this was built and tested, the public market backend (`market-api.unicity.network`) was unreachable from the build host — DNS resolved but port 443 did not accept connections, while wallet-api and the testnet2 gateway worked normally. This is an external service state, not a defect here: the card, signing, verification, DM contact, and paid-introduction flows were all tested live and pass. `postIntent`/`search` are wired to the real SDK market module and will work whenever the backend is up; set `LISTING_MARKET_API` to override the URL.

## Try it without a wallet

Card creation, signing, verification, and expiry logic run with no network:

```bash
npm install
npm test
```

## Commands

```
listing post --type <buy|sell|service|announcement|other> --title "..." [--price N]
             [--contact @h] [--expires-in-days D] [--no-market]
listing card <LST-id> [--json]     Show/verify a card
listing list                       All local cards
listing search <query>             Search the market bulletin board
listing about                      What this service is
listing help                       Command list
listing daemon                     Run the enquiry + introduction service
```

Over DM: `cards`, `card <LST-id>`, `contact <LST-id> <message>` (free), `intro <LST-id>` (paid, if enabled), `about`, `help`.

## Run it

```bash
# 1. install
npm install

# 2. copy config (defaults to testnet2)
cp .env.example .env

# 3. post a listing (also publishes to the market board if reachable)
node bin/listing.js post --type sell --title "Vintage synth" --price 42 --contact "@frani" --expires-in-days 7

# 4. run the daemon to field enquiries and introductions
node bin/listing.js daemon

# 5. share the card JSON from listings/<LST-id>.json — anyone can verify it
node bin/listing.js card LST-XXXXXX
```

### As a service

```bash
sudo cp systemd/frani-listing-card.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now frani-listing-card
journalctl -u frani-listing-card -f
```

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `LISTING_NETWORK` | `testnet2` | Network. testnet2 only; other values are refused. |
| `LISTING_DATA_DIR` | `./wallet-data` | Where the wallet keys/state live. |
| `LISTING_WALLET_API` | `https://wallet-api.unicity.network` | testnet2 wallet-api. |
| `LISTING_ORACLE_KEY` | public testnet2 key | Oracle key (not a secret on testnet2). |
| `LISTING_DEVICE_ID` | `frani-listing-1` | Stable per-machine session id. |
| `LISTING_NAMETAG` | _(empty)_ | Optional @nametag to register on first run. |
| `LISTING_DIR` | `./listings` | Where cards are stored. |
| `LISTING_MARKET_API` | _(SDK default)_ | Override the market API base URL. |
| `LISTING_MARKET_TIMEOUT_MS` | `12000` | Market request timeout. |
| `LISTING_INTRO_FEE_UCT` | `0` | Paid introduction fee in UCT. 0 disables it. |

## Card shape

```json
{
  "version": "frani-listing/1",
  "network": "testnet2",
  "id": "LST-2AC511",
  "intentType": "sell",
  "title": "Vintage synth",
  "price": 42,
  "currency": "UCT",
  "contactHandle": "@frani",
  "expiresAtIso": "2026-09-27T19:51:01.292Z",
  "marketIntentId": null,
  "signer": { "pubkey": "0220a4…e8e0" },
  "signature": "…",
  "issuer": "Frani Listing Card · CRYPTFRANI"
}
```

The signed string binds version, network, id, intent type, title, price, currency, contact, and timestamps. Verification recomputes it and checks the signature recovers to `signer.pubkey`.

## Structure

```
bin/listing.js        CLI + daemon entrypoint
src/config.js         env-driven config, testnet2 guard
src/wallet.js         Sphere SDK boundary (holds its own keys, market module)
src/amounts.js        BigInt UCT ↔ base-unit conversion
src/listing.js        card model + signing + rendering
src/market.js         best-effort market publish/search
src/refund.js         single-attempt, double-pay-safe refunds
src/store.js          JSON listing archive
src/service.js        DM command handler
test/listing.test.js  card sign/verify + expiry tests
systemd/              service unit
```

## Tests

```bash
npm test
```

Eight checks cover card creation, sign/verify, tamper detection (price and title), intent-type validation, enquire pricing, expiry, and all intent types.

## Keys and safety

Frani Listing Card holds its own wallet under `wallet-data/`. It never asks anyone for a seed or private key, runs on testnet2 only, and refuses to start on another network unless explicitly overridden. The only outbound payment is a refund. `.env`, `wallet-data/`, and `listings/` are gitignored.

---

MIT licensed. Not financial software; provided as-is.
