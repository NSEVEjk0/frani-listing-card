// Frani Listing Card — configuration.
// Made by CRYPTFRANI. Owner / creator: Itachi. Unicity testnet2 only.

import process from 'node:process';

export const NETWORK = process.env.LISTING_NETWORK || 'testnet2';

export const config = {
  network: NETWORK,
  dataDir: process.env.LISTING_DATA_DIR || './wallet-data',
  walletApiBaseUrl:
    process.env.LISTING_WALLET_API || 'https://wallet-api.unicity.network',
  oracleApiKey:
    process.env.LISTING_ORACLE_KEY || 'sk_ddc3cfcc001e4a28ac3fad7407f99590',
  deviceId: process.env.LISTING_DEVICE_ID || 'frani-listing-1',
  nametag: process.env.LISTING_NAMETAG || '',
  listingsDir: process.env.LISTING_DIR || './listings',
  decimals: Number(process.env.LISTING_DECIMALS || '8'),
  // Market API. Leave blank to use the SDK default. The market bulletin board
  // is optional: if it is unreachable, cards still work as signed, shareable
  // objects and the DM contact / paid-introduction flow is unaffected.
  marketApiUrl: process.env.LISTING_MARKET_API || '',
  marketTimeoutMs: Number(process.env.LISTING_MARKET_TIMEOUT_MS || '12000'),
  // Optional paid "introduction" fee in whole UCT. 0 disables it.
  introFeeUct: process.env.LISTING_INTRO_FEE_UCT || '0',
};

export function assertTestnet2() {
  if (config.network !== 'testnet2' && !process.env.LISTING_ALLOW_NONTESTNET2) {
    throw new Error(
      `Frani Listing Card is testnet2-only. Refusing to start on '${config.network}'. ` +
        `Set LISTING_ALLOW_NONTESTNET2=1 only if you truly mean it.`,
    );
  }
}
