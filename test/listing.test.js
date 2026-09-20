// Frani Listing Card — unit tests for card creation, signing, and expiry.

import assert from 'node:assert/strict';
import { createKeyPair, signMessage, getPublicKey, randomHex } from '@unicitylabs/sphere-sdk';
import { createCard, verifyCard, isExpired, renderCard, INTENT_TYPES } from '../src/listing.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('ok -', name);
  } catch (err) {
    console.error('FAIL -', name);
    console.error(err);
    process.exitCode = 1;
  }
}

const kp = createKeyPair(randomHex(32));
const priv = kp.privateKey;
const pub = kp.publicKey || getPublicKey(priv);
const sign = (m) => signMessage(priv, m);

function make(overrides = {}) {
  return createCard({
    intentType: 'sell',
    title: 'Vintage synth',
    price: 42,
    currency: 'UCT',
    contactHandle: '@seller',
    expiresInDays: 7,
    network: 'testnet2',
    sign,
    signerPubkey: pub,
    ...overrides,
  });
}

test('created card verifies', () => {
  const card = make();
  assert.equal(verifyCard(card).ok, true);
  assert.match(card.id, /^LST-[0-9A-F]{6}$/);
  assert.equal(card.price, 42);
});

test('tampered price fails verification', () => {
  const card = make();
  card.price = 1;
  assert.equal(verifyCard(card).ok, false);
});

test('tampered title fails verification', () => {
  const card = make();
  card.title = 'Free synth';
  assert.equal(verifyCard(card).ok, false);
});

test('invalid intent type is rejected', () => {
  assert.throws(() => make({ intentType: 'giveaway' }));
});

test('missing title is rejected', () => {
  assert.throws(() => make({ title: '' }));
});

test('price null renders as enquire', () => {
  const card = make({ price: null });
  assert.ok(renderCard(card).includes('enquire'));
  assert.equal(verifyCard(card).ok, true);
});

test('expiry is computed and detected', () => {
  const card = make({ expiresInDays: 1 });
  assert.equal(isExpired(card), false);
  card.expiresAt = Date.now() - 1000;
  assert.equal(isExpired(card), true);
});

test('all intent types are accepted', () => {
  for (const t of INTENT_TYPES) {
    const card = make({ intentType: t });
    assert.equal(card.intentType, t);
    assert.equal(verifyCard(card).ok, true);
  }
});

console.log(`\n${passed} checks passed.`);
