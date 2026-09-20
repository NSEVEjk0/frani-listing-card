// Frani Listing Card — model and rendering.
//
// A listing card is a compact, signed description of ONE buy/sell intent:
// title, price, expiry, and a contact handle. The signature binds the card to
// the seller's key so a shared card cannot be altered. The same intent is also
// posted to the Unicity market bulletin board (market.postIntent) when that
// backend is reachable; the card stands on its own regardless.

import { createHash, randomUUID } from 'node:crypto';
import { verifySignedMessage, recoverPubkeyFromSignature } from '@unicitylabs/sphere-sdk';

export const CARD_VERSION = 'frani-listing/1';
export const INTENT_TYPES = ['buy', 'sell', 'service', 'announcement', 'other'];

export function listingId() {
  return 'LST-' + randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
}

export function cardPayload({ version, network, id, intentType, title, price, currency, contactHandle, createdAt, expiresAt }) {
  return [
    version,
    network,
    id,
    intentType,
    title,
    price == null ? '' : String(price),
    currency || '',
    contactHandle || '',
    String(createdAt),
    String(expiresAt || ''),
  ].join('\n');
}

// Build and sign a listing card.
export function createCard({ intentType, title, price, currency, contactHandle, expiresInDays, network, sign, signerPubkey, signerNametag }) {
  if (!INTENT_TYPES.includes(intentType)) {
    throw new Error(`intentType must be one of: ${INTENT_TYPES.join(', ')}`);
  }
  if (!title || !String(title).trim()) throw new Error('title is required');

  const createdAt = Date.now();
  const expiresAt = expiresInDays ? createdAt + Number(expiresInDays) * 86400000 : null;
  const cur = currency || 'UCT';
  const contact = contactHandle || (signerNametag ? '@' + signerNametag : signerPubkey);
  const id = listingId();

  const payload = cardPayload({
    version: CARD_VERSION,
    network,
    id,
    intentType,
    title,
    price,
    currency: cur,
    contactHandle: contact,
    createdAt,
    expiresAt,
  });
  const signature = sign(payload);

  return {
    version: CARD_VERSION,
    network,
    id,
    intentType,
    title: String(title).trim(),
    price: price == null ? null : Number(price),
    currency: cur,
    contactHandle: contact,
    createdAt,
    createdAtIso: new Date(createdAt).toISOString(),
    expiresAt,
    expiresAtIso: expiresAt ? new Date(expiresAt).toISOString() : null,
    marketIntentId: null, // filled when posted to the market bulletin board
    signer: { pubkey: signerPubkey, nametag: signerNametag || undefined },
    signature,
    issuer: 'Frani Listing Card · CRYPTFRANI',
  };
}

export function verifyCard(card) {
  if (!card || typeof card !== 'object') return { ok: false, problems: ['not an object'] };
  const pubkey = card?.signer?.pubkey;
  if (!/^[0-9a-f]{66}$/i.test(String(pubkey || ''))) {
    return { ok: false, problems: ['signer pubkey is not 66-hex'] };
  }
  const payload = cardPayload({
    version: card.version,
    network: card.network,
    id: card.id,
    intentType: card.intentType,
    title: card.title,
    price: card.price,
    currency: card.currency,
    contactHandle: card.contactHandle,
    createdAt: card.createdAt,
    expiresAt: card.expiresAt,
  });
  try {
    const valid = verifySignedMessage(payload, card.signature, pubkey);
    const recovered = recoverPubkeyFromSignature(payload, card.signature);
    const ok = valid && recovered.toLowerCase() === pubkey.toLowerCase();
    return { ok, signatureValid: valid, recoveredPubkey: recovered };
  } catch (err) {
    return { ok: false, problems: [err.message] };
  }
}

export function isExpired(card, now = Date.now()) {
  return card.expiresAt != null && now >= card.expiresAt;
}

// Render the card as a clean, human-readable block.
export function renderCard(card) {
  const priceLine =
    card.price == null ? 'Price: enquire' : `Price: ${card.price} ${card.currency}`;
  const lines = [
    '┌─ Frani Listing Card ─────────────',
    `│ ${card.intentType.toUpperCase()}  ${card.id}`,
    `│ ${card.title}`,
    `│ ${priceLine}`,
    `│ Contact: ${card.contactHandle}`,
  ];
  if (card.expiresAtIso) lines.push(`│ Expires: ${card.expiresAtIso}`);
  if (card.marketIntentId) lines.push(`│ Market: ${card.marketIntentId}`);
  lines.push(`│ Signed by: ${card.signer.nametag ? '@' + card.signer.nametag : card.signer.pubkey.slice(0, 16) + '…'}`);
  lines.push('└──────────────────────────────────');
  return lines.join('\n');
}
