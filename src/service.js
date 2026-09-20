// Frani Listing Card — DM command handler.
// A visitor DMs `card <LST-id>` to see a listing, `contact <LST-id> <message>`
// to reach the seller, or `intro <LST-id>` to request a paid introduction.
// Pure and testable; wallet-backed capability is injected via `deps`.

import { fromBaseUnits } from './amounts.js';
import { renderCard, isExpired } from './listing.js';

const HELP = [
  'Frani Listing Card — buy/sell listing cards on Unicity testnet2.',
  '',
  'Commands (DM me):',
  '  cards                     → recent listing cards',
  '  card <LST-id>             → show one listing card',
  '  contact <LST-id> <msg>    → forward a message to the seller',
  '  intro <LST-id>            → request a paid introduction (if enabled)',
  '  about                     → what this is',
  '  help                      → this message',
].join('\n');

function aboutText(identity, introFeeUct) {
  const lines = [
    'Frani Listing Card',
    'Turns one buy/sell intent into a clean, signed public card — title, price,',
    'expiry, contact. Visitors can reach the seller by DM or request an intro.',
    '',
    `Wallet pubkey: ${identity?.chainPubkey || '(unknown)'}`,
  ];
  if (identity?.directAddress) lines.push(`Direct address: ${identity.directAddress}`);
  if (identity?.nametag) lines.push(`Nametag: @${identity.nametag}`);
  if (Number(introFeeUct) > 0) lines.push('', `Paid introduction: ${introFeeUct} UCT (earn-only; overpayment refunded).`);
  lines.push('', 'Made by CRYPTFRANI · Owner/creator: Itachi · testnet2 only.');
  return lines.join('\n');
}

function parse(body) {
  const trimmed = String(body || '').trim();
  if (!trimmed) return { command: 'help', rest: '' };
  const space = trimmed.indexOf(' ');
  if (space === -1) return { command: trimmed.toLowerCase(), rest: '' };
  return { command: trimmed.slice(0, space).toLowerCase(), rest: trimmed.slice(space + 1).trim() };
}

// deps:
//   identity, introFeeUct
//   getCard(id)                         -> card | null
//   recentCards()                       -> card[]
//   forwardToSeller(card, from, msg)    -> bool
//   requestIntro(card, sender)          -> { success, requestId?, error? }
export async function handleMessage(body, sender, deps) {
  const { command, rest } = parse(body);

  switch (command) {
    case 'help':
    case '?':
      return { reply: HELP };

    case 'about':
      return { reply: aboutText(deps.identity, deps.introFeeUct) };

    case 'cards': {
      const cards = await deps.recentCards();
      if (cards.length === 0) return { reply: 'No listings yet.' };
      const lines = cards.map((c) => {
        const price = c.price == null ? 'enquire' : `${c.price} ${c.currency}`;
        return `  ${c.id}  [${c.intentType}] ${c.title} — ${price}${isExpired(c) ? ' (expired)' : ''}`;
      });
      return { reply: ['Recent listings:', ...lines].join('\n') };
    }

    case 'card': {
      const id = (rest.split(/\s+/)[0] || '').toUpperCase();
      if (!id) return { reply: 'Usage: card <LST-id>' };
      const card = await deps.getCard(id);
      if (!card) return { reply: `No listing ${id} here.` };
      return { reply: renderCard(card) + (isExpired(card) ? '\n(note: this listing has expired)' : '') };
    }

    case 'contact': {
      const parts = rest.split(/\s+/);
      const id = (parts[0] || '').toUpperCase();
      const message = parts.slice(1).join(' ');
      if (!id || !message) return { reply: 'Usage: contact <LST-id> <your message>' };
      const card = await deps.getCard(id);
      if (!card) return { reply: `No listing ${id} here.` };
      const ok = await deps.forwardToSeller(card, sender, message);
      return {
        reply: ok
          ? `Your message about ${card.id} was forwarded to the seller. They can reply to you directly.`
          : `Could not reach the seller for ${card.id} right now.`,
      };
    }

    case 'intro': {
      const id = (rest.split(/\s+/)[0] || '').toUpperCase();
      if (!id) return { reply: 'Usage: intro <LST-id>' };
      if (!(Number(deps.introFeeUct) > 0)) {
        return { reply: 'Paid introductions are not enabled here. Use "contact <LST-id> <message>" instead — it is free.' };
      }
      const card = await deps.getCard(id);
      if (!card) return { reply: `No listing ${id} here.` };
      const res = await deps.requestIntro(card, sender);
      if (!res || !res.success) {
        return { reply: `Could not create the introduction request${res?.error ? ': ' + res.error : ''}.` };
      }
      return {
        reply: [
          `Introduction to the seller of ${card.id} — ${card.title}.`,
          `Fee: ${deps.introFeeUct} UCT. Pay the request and I will introduce you both.`,
          'Overpayment is refunded automatically.',
          `Request id: ${res.requestId}`,
        ].join('\n'),
      };
    }

    default:
      return { reply: `Unknown command "${command}". Send "help".` };
  }
}

export { HELP, aboutText, parse };
