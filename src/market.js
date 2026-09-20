// Frani Listing Card — market bulletin-board integration.
// Publishing to and searching the Unicity market is best-effort: the listing
// card is a complete, signed object on its own, so a market outage never blocks
// creating, sharing, or contacting. Every call reports a structured result.

// Post a card's intent to the market bulletin board.
export async function publishIntent(sphere, card) {
  if (!sphere.market) return { ok: false, reason: 'market module not enabled' };
  try {
    const res = await sphere.market.postIntent({
      description: card.title,
      intentType: card.intentType,
      price: card.price == null ? undefined : card.price,
      currency: card.currency,
      contactHandle: card.contactHandle,
      expiresInDays: card.expiresAt
        ? Math.max(1, Math.ceil((card.expiresAt - Date.now()) / 86400000))
        : undefined,
    });
    // The SDK returns an intent id on success.
    const intentId = res?.intentId || res?.id || null;
    return { ok: true, intentId, raw: res };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

// Search the market bulletin board.
export async function searchIntents(sphere, query, opts = {}) {
  if (!sphere.market) return { ok: false, reason: 'market module not enabled', intents: [] };
  try {
    const res = await sphere.market.search(query, opts);
    return { ok: true, count: res.count, intents: res.intents || [] };
  } catch (err) {
    return { ok: false, reason: err.message, intents: [] };
  }
}
