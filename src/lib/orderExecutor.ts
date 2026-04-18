// src/lib/orderExecutor.ts
// Signs orders via Phantom wallet using bulk-keychain signing scheme
// bulk-keychain-wasm is loaded dynamically from CDN if available, else uses direct REST

import { BULK_API_URL, ORIGIN_URL } from './bulkClient';

export interface SigningWallet {
  publicKey: string;
  signMessage(msg: Uint8Array): Promise<Uint8Array>;
}

export interface OrderParams {
  symbol: string;
  isBuy: boolean;
  price: number;
  size: number;
  orderType: 'limit' | 'market';
  tif?: 'GTC' | 'IOC' | 'ALO';
}

export interface BracketParams {
  entry: OrderParams;
  stopPrice?: number;
  takeProfitPrice?: number;
}

export interface OrderResult {
  success: boolean;
  orderId?: string;
  error?: string;
}

// ─── bs58 encoder (inline, no external dep needed) ───────────────────────────
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function bs58encode(buf: Uint8Array): string {
  const digits: number[] = [0];
  for (let i = 0; i < buf.length; i++) {
    let carry = buf[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) { digits.push(carry % 58); carry = (carry / 58) | 0; }
  }
  let result = '';
  for (let i = 0; i < buf.length && buf[i] === 0; i++) result += '1';
  for (let i = digits.length - 1; i >= 0; i--) result += BASE58_ALPHABET[digits[i]];
  return result;
}

// ─── Build & post a signed transaction ───────────────────────────────────────
async function signAndPost(
  actions: object[],
  wallet: SigningWallet
): Promise<OrderResult> {
  try {
    const nonce   = Date.now();
    const account = wallet.publicKey;

    // Encode the payload to sign: JSON(actions) + nonce + account
    const actionsJson  = JSON.stringify(actions);
    const nonceBytes   = new Uint8Array(8);
    const dv           = new DataView(nonceBytes.buffer);
    dv.setBigUint64(0, BigInt(nonce), true); // little-endian

    // Try to decode account from base58 to bytes
    let accountBytes: Uint8Array;
    try {
      const { default: bs58 } = await import('bs58');
      accountBytes = bs58.decode(account);
    } catch {
      // fallback: use UTF-8 encoding of address
      accountBytes = new TextEncoder().encode(account);
    }

    const actionsBytes = new TextEncoder().encode(actionsJson);
    const msgBytes     = new Uint8Array(actionsBytes.length + 8 + accountBytes.length);
    msgBytes.set(actionsBytes, 0);
    msgBytes.set(nonceBytes, actionsBytes.length);
    msgBytes.set(accountBytes, actionsBytes.length + 8);

    // Sign with wallet
    const sigBytes  = await wallet.signMessage(msgBytes);
    const signature = bs58encode(sigBytes);

    // POST to Bulk Exchange
    const res = await fetch(`${BULK_API_URL}/api/v1/order`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN_URL },
      body: JSON.stringify({ actions, nonce, account, signer: account, signature }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as Record<string, unknown>;
      return { success: false, error: String(err.message ?? err.error ?? `HTTP ${res.status}`) };
    }

    const data = await res.json() as Record<string, unknown>;
    return { success: true, orderId: String(data.orderId ?? data.id ?? nonce) };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function placeOrder(
  p: OrderParams,
  wallet: SigningWallet | null,
  mode: 'live' | 'paper'
): Promise<OrderResult> {
  if (mode === 'paper')
    return { success: true, orderId: `PAPER-${Math.random().toString(36).slice(2,10).toUpperCase()}` };
  if (!wallet) return { success: false, error: 'No wallet connected' };

  const action = p.orderType === 'market'
    ? { type: 'order', symbol: p.symbol, isBuy: p.isBuy, price: 0, size: p.size, orderType: { type: 'market', isMarket: true, triggerPx: 0 } }
    : { type: 'order', symbol: p.symbol, isBuy: p.isBuy, price: p.price, size: p.size, orderType: { type: 'limit', tif: p.tif ?? 'GTC' } };

  return signAndPost([action], wallet);
}

export async function placeBracket(
  p: BracketParams,
  wallet: SigningWallet | null,
  mode: 'live' | 'paper'
): Promise<OrderResult> {
  if (mode === 'paper')
    return { success: true, orderId: `PAPER-BKT-${Math.random().toString(36).slice(2,10).toUpperCase()}` };
  if (!wallet) return { success: false, error: 'No wallet connected' };

  const { entry, stopPrice, takeProfitPrice } = p;
  const actions: object[] = [
    { type: 'order', symbol: entry.symbol, isBuy: entry.isBuy, price: entry.price, size: entry.size, orderType: { type: 'limit', tif: 'GTC' } },
  ];
  if (stopPrice)        actions.push({ type: 'stop',       symbol: entry.symbol, isBuy: !entry.isBuy, size: entry.size, triggerPrice: stopPrice });
  if (takeProfitPrice)  actions.push({ type: 'takeProfit', symbol: entry.symbol, isBuy: !entry.isBuy, size: entry.size, triggerPrice: takeProfitPrice });

  return signAndPost(actions, wallet);
}

export async function cancelOrder(
  orderId: string, symbol: string,
  wallet: SigningWallet | null,
  mode: 'live' | 'paper'
): Promise<OrderResult> {
  if (mode === 'paper') return { success: true };
  if (!wallet)          return { success: false, error: 'No wallet' };
  return signAndPost([{ type: 'cancel', symbol, orderId }], wallet);
}

export async function cancelAll(
  symbol: string,
  wallet: SigningWallet | null,
  mode: 'live' | 'paper'
): Promise<OrderResult> {
  if (mode === 'paper') return { success: true };
  if (!wallet)          return { success: false, error: 'No wallet' };
  return signAndPost([{ type: 'cancelAll', symbols: [symbol] }], wallet);
}

// ─── Wallet adapters ──────────────────────────────────────────────────────────

export function makePrivyWallet(
  address: string,
  signFn: (msg: Uint8Array) => Promise<Uint8Array>
): SigningWallet {
  return { publicKey: address, signMessage: signFn };
}

export interface PhantomProvider {
  publicKey: { toString(): string };
  signMessage(msg: Uint8Array): Promise<{ signature: Uint8Array }>;
  connect(): Promise<void>;
  isConnected: boolean;
}

export function makePhantomWallet(p: PhantomProvider): SigningWallet {
  return {
    publicKey: p.publicKey.toString(),
    signMessage: async (msg) => {
      const { signature } = await p.signMessage(msg);
      return signature;
    },
  };
}

export async function connectPhantom(): Promise<PhantomProvider> {
  const w = window as unknown as Record<string, unknown>;
  const ph = (w['solana'] ?? (w['phantom'] as Record<string,unknown> | undefined)?.['solana']) as PhantomProvider | undefined;
  if (!ph) throw new Error('Phantom wallet not found. Please install it from phantom.app');
  await ph.connect();
  return ph;
}
