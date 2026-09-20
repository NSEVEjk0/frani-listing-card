#!/usr/bin/env node
// Frani Listing Card — CLI + daemon entrypoint.
// Made by CRYPTFRANI. Owner / creator: Itachi. Unicity testnet2 only.

import process from 'node:process';
import { config } from '../src/config.js';
import { openWallet, closeWallet, uctCoinId } from '../src/wallet.js';
import { ListingStore } from '../src/store.js';
import { createCard, verifyCard, renderCard, isExpired, INTENT_TYPES } from '../src/listing.js';
import { publishIntent, searchIntents } from '../src/market.js';
import { toBaseUnits, fromBaseUnits } from '../src/amounts.js';
import { refundOnce } from '../src/refund.js';
import { handleMessage, HELP, aboutText } from '../src/service.js';

const log = (...a) => console.log(new Date().toISOString(), ...a);

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) out[a.slice(2, eq)] = a.slice(eq + 1);
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) out[a.slice(2)] = argv[++i];
      else out[a.slice(2)] = true;
    } else {
      out._.push(a);
    }
  }
  return out;
}

async function cmdHelp() {
  console.log(HELP);
}

async function cmdAbout() {
  try {
    const { sphere } = await openWallet();
    console.log(aboutText(sphere.identity, config.introFeeUct));
    await closeWallet(sphere);
  } catch {
    console.log(aboutText(null, config.introFeeUct));
  }
}

async function cmdPost(args) {
  // listing post --type sell --title "..." [--price 42] [--contact @me] [--expires-in-days 7] [--no-market]
  const intentType = args.type || 'sell';
  const title = args.title || args._.join(' ');
  if (!INTENT_TYPES.includes(intentType)) {
    console.error(`--type must be one of: ${INTENT_TYPES.join(', ')}`);
    process.exit(1);
  }
  if (!title) {
    console.error('Usage: listing post --type <buy|sell|service|announcement|other> --title "..." [--price N] [--contact @h] [--expires-in-days D] [--no-market]');
    process.exit(1);
  }

  const { sphere } = await openWallet({ market: !args['no-market'] });
  try {
    const store = new ListingStore(config.listingsDir);
    const card = createCard({
      intentType,
      title,
      price: args.price != null && args.price !== true ? Number(args.price) : null,
      currency: args.currency || 'UCT',
      contactHandle: args.contact,
      expiresInDays: args['expires-in-days'],
      network: config.network,
      sign: (m) => sphere.signMessage(m),
      signerPubkey: sphere.identity.chainPubkey,
      signerNametag: sphere.identity.nametag,
    });

    if (!args['no-market']) {
      const pub = await publishIntent(sphere, card);
      if (pub.ok) {
        card.marketIntentId = pub.intentId;
        log('posted to market bulletin board:', pub.intentId || '(no id returned)');
      } else {
        log('market publish skipped:', pub.reason, '(card still valid and shareable)');
      }
    }

    await store.save(card);
    console.log(renderCard(card));
    console.log('\nShareable card JSON stored at', store._file(card.id));
  } finally {
    await closeWallet(sphere);
  }
}

async function cmdCard(args) {
  const id = (args._[0] || '').toUpperCase();
  const store = new ListingStore(config.listingsDir);
  const card = await store.get(id);
  if (!card) {
    console.error(`No listing ${id}.`);
    process.exit(1);
  }
  if (args.json) {
    console.log(JSON.stringify(card, null, 2));
  } else {
    console.log(renderCard(card));
    const v = verifyCard(card);
    console.log('\nsignature:', v.ok ? 'VALID' : 'INVALID');
  }
}

async function cmdList() {
  const store = new ListingStore(config.listingsDir);
  const all = await store.list();
  if (all.length === 0) {
    console.log('No listings yet. Create one: listing post --type sell --title "..." --price 10');
    return;
  }
  for (const c of all) {
    const price = c.price == null ? 'enquire' : `${c.price} ${c.currency}`;
    console.log(`${c.id}  [${c.intentType}] ${c.title} — ${price}${isExpired(c) ? ' (expired)' : ''}`);
  }
}

async function cmdSearch(args) {
  const query = args._.join(' ');
  if (!query) {
    console.error('Usage: listing search <query>');
    process.exit(1);
  }
  const { sphere } = await openWallet({ market: true });
  try {
    const res = await searchIntents(sphere, query, {});
    if (!res.ok) {
      console.log('Market search unavailable:', res.reason);
      console.log('(The market bulletin board may be offline; local cards are unaffected.)');
      return;
    }
    console.log(`Market results for "${query}": ${res.count}`);
    for (const it of res.intents.slice(0, 20)) {
      const price = it.price == null ? 'enquire' : `${it.price} ${it.currency}`;
      console.log(`  [${it.intentType}] ${it.description} — ${price} · ${it.contactHandle || it.agentNametag || it.agentPublicKey?.slice(0, 12)}`);
    }
  } finally {
    await closeWallet(sphere);
  }
}

async function cmdDaemon() {
  const { sphere, created, generatedMnemonic } = await openWallet({ market: true });
  const store = new ListingStore(config.listingsDir);
  await store.init();

  if (created && generatedMnemonic) {
    log('A NEW wallet was created. Back up', config.dataDir, '— the mnemonic is not shown again.');
  }

  const identity = sphere.identity;
  const coinId = await uctCoinId();
  log('Frani Listing Card is live on', config.network);
  log('wallet pubkey:', identity?.chainPubkey);
  if (identity?.directAddress) log('direct address:', identity.directAddress);
  if (identity?.nametag) log('nametag: @' + identity.nametag);
  if (Number(config.introFeeUct) > 0) log('paid introductions enabled at', config.introFeeUct, 'UCT');

  const pendingIntros = new Map(); // requestId -> { cardId, buyer }

  const deps = {
    identity,
    introFeeUct: config.introFeeUct,
    getCard: (id) => store.get(id),
    recentCards: async () => (await store.list()).slice(0, 15),
    forwardToSeller: async (card, from, message) => {
      // The seller is the card's signer. Forward the buyer's note and pubkey.
      try {
        await sphere.communications.sendDM(
          card.signer.pubkey,
          [
            `New enquiry about your listing ${card.id} — ${card.title}:`,
            `From: ${from}`,
            `Message: ${message}`,
            'Reply to them directly at the pubkey above.',
          ].join('\n'),
        );
        return true;
      } catch (err) {
        log('forward failed:', err.message);
        return false;
      }
    },
    requestIntro: async (card, buyer) => {
      const amountBase = toBaseUnits(config.introFeeUct, config.decimals);
      const res = await sphere.payments.requests.create(buyer, {
        coinId,
        amount: amountBase,
        memo: `Introduction for listing ${card.id}`,
      });
      if (res.success && res.requestId) pendingIntros.set(res.requestId, { cardId: card.id, buyer });
      return res;
    },
  };

  sphere.on('message:dm', async (msg) => {
    const sender = msg.senderPubkey;
    const label = msg.senderNametag ? '@' + msg.senderNametag : sender?.slice(0, 12);
    log('dm from', label, '::', String(msg.content || '').slice(0, 80));
    try {
      const { reply } = await handleMessage(msg.content, sender, deps);
      if (reply) {
        await sphere.communications.sendDM(sender, reply);
        log('reply sent to', label);
      }
    } catch (err) {
      log('handler error:', err.message);
    }
  });

  // Paid introduction: on confirmed payment, introduce buyer and seller, refund
  // any overpayment.
  sphere.on('transfer:incoming', async (transfer) => {
    let sum = 0n;
    for (const t of transfer.tokens || []) {
      if (t.coinId === coinId && t.amount != null) {
        try {
          sum += BigInt(t.amount);
        } catch {
          /* ignore */
        }
      }
    }
    if (sum <= 0n) return;
    const buyer = transfer.senderPubkey;
    const arrived = sum.toString();
    log('incoming', fromBaseUnits(arrived), 'UCT from', buyer?.slice(0, 12));

    if (!(Number(config.introFeeUct) > 0)) {
      // No paid product; return unexpected funds.
      await refundOnce(sphere, { recipient: buyer, amountBase: arrived, coinId, memo: 'Frani Listing Card: unsolicited payment' });
      return;
    }

    const fee = BigInt(toBaseUnits(config.introFeeUct, config.decimals));
    if (sum < fee) {
      await refundOnce(sphere, { recipient: buyer, amountBase: arrived, coinId, memo: 'Refund (underpayment)' });
      await sphere.communications.sendDM(buyer, `Received ${fromBaseUnits(arrived)} but the introduction fee is ${config.introFeeUct} UCT. Refunded.`).catch(() => {});
      return;
    }

    // Find the most recent pending intro for this buyer.
    let match = null;
    for (const [requestId, info] of pendingIntros) {
      if (info.buyer === buyer) {
        match = { requestId, ...info };
        break;
      }
    }
    if (match) {
      const card = await store.get(match.cardId);
      if (card) {
        await sphere.communications.sendDM(card.signer.pubkey, `Paid introduction: a buyer is interested in ${card.id} — ${card.title}. Their pubkey: ${buyer}`).catch(() => {});
        await sphere.communications.sendDM(buyer, `Introduction made for ${card.id}. The seller (${card.contactHandle}) has your pubkey and can reach you.`).catch(() => {});
        pendingIntros.delete(match.requestId);
        log('introduction completed for', card.id);
      }
    }

    const over = (sum - fee).toString();
    if (BigInt(over) > 0n) {
      const r = await refundOnce(sphere, { recipient: buyer, amountBase: over, coinId, memo: 'Overpayment refund' });
      await sphere.communications.sendDM(buyer, `Refunded ${fromBaseUnits(over)} UCT overpayment (${r.status}).`).catch(() => {});
    }
  });

  const shutdown = async () => {
    log('shutting down...');
    await closeWallet(sphere);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  log('listening for listing enquiries and DMs. Ctrl-C to stop.');
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  const args = parseArgs(rest);
  switch (cmd) {
    case 'daemon':
      return cmdDaemon();
    case 'post':
      return cmdPost(args);
    case 'card':
      return cmdCard(args);
    case 'list':
      return cmdList();
    case 'search':
      return cmdSearch(args);
    case 'about':
      return cmdAbout();
    case 'help':
    case undefined:
    case '--help':
    case '-h':
      return cmdHelp();
    default:
      console.error(`Unknown command "${cmd}". Try "listing help".`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('fatal:', err.message);
  process.exit(1);
});
