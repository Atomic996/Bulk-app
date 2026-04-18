// src/lib/orderExecutor.ts
import { BULK_API_URL, ORIGIN_URL } from './bulkClient';

let _wasm: typeof import('bulk-keychain-wasm') | null = null;
let _encode: ((b: Uint8Array) => string) | null = null;
async function wasm() { if (!_wasm) _wasm = await import('bulk-keychain-wasm'); return _wasm; }
async function bs58enc() { if (!_encode) { const m = await import('bs58'); _encode = m.default.encode; } return _encode!; }

export interface SigningWallet { publicKey: string; signMessage(msg: Uint8Array): Promise<Uint8Array>; }
export interface OrderParams { symbol: string; isBuy: boolean; price: number; size: number; orderType: 'limit'|'market'; tif?: 'GTC'|'IOC'|'ALO'; }
export interface BracketParams { entry: OrderParams; stopPrice?: number; takeProfitPrice?: number; }
export interface OrderResult { success: boolean; orderId?: string; error?: string; }

async function signAndPost(payload: object|object[], wallet: SigningWallet, grouped = false): Promise<OrderResult> {
  try {
    const w = await wasm(); const encode = await bs58enc();
    const account = wallet.publicKey; const nonce = Date.now();
    const prepared = grouped ? w.prepareGroup(payload as object[], { account, nonce }) : w.prepareOrder(payload, { account, nonce });
    const sigBytes = await wallet.signMessage(prepared.messageBytes);
    const signed = prepared.finalize(encode(sigBytes));
    const res = await fetch(`${BULK_API_URL}/api/v1/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN_URL },
      body: JSON.stringify({ actions: JSON.parse(signed.actions as string), nonce: signed.nonce, account: signed.account, signer: signed.signer, signature: signed.signature }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})) as Record<string,unknown>; return { success: false, error: String(e.message ?? `HTTP ${res.status}`) }; }
    const data = await res.json() as Record<string,unknown>;
    return { success: true, orderId: String(data.orderId ?? prepared.orderId ?? '') };
  } catch (e) { return { success: false, error: (e as Error).message }; }
}

export async function placeOrder(p: OrderParams, wallet: SigningWallet|null, mode: 'live'|'paper'): Promise<OrderResult> {
  if (mode === 'paper') return { success: true, orderId: `PAPER-${Math.random().toString(36).slice(2,10).toUpperCase()}` };
  if (!wallet) return { success: false, error: 'No wallet' };
  const payload = p.orderType === 'market'
    ? { type:'order', symbol:p.symbol, isBuy:p.isBuy, price:0, size:p.size, orderType:{ type:'market', isMarket:true, triggerPx:0 } }
    : { type:'order', symbol:p.symbol, isBuy:p.isBuy, price:p.price, size:p.size, orderType:{ type:'limit', tif:p.tif??'GTC' } };
  return signAndPost(payload, wallet, false);
}

export async function placeBracket(p: BracketParams, wallet: SigningWallet|null, mode: 'live'|'paper'): Promise<OrderResult> {
  if (mode === 'paper') return { success: true, orderId: `PAPER-BKT-${Math.random().toString(36).slice(2,10).toUpperCase()}` };
  if (!wallet) return { success: false, error: 'No wallet' };
  const { entry, stopPrice, takeProfitPrice } = p;
  const actions: object[] = [{ type:'order', symbol:entry.symbol, isBuy:entry.isBuy, price:entry.price, size:entry.size, orderType:{ type:'limit', tif:'GTC' } }];
  if (stopPrice)       actions.push({ type:'stop',       symbol:entry.symbol, isBuy:!entry.isBuy, size:entry.size, triggerPrice:stopPrice });
  if (takeProfitPrice) actions.push({ type:'takeProfit', symbol:entry.symbol, isBuy:!entry.isBuy, size:entry.size, triggerPrice:takeProfitPrice });
  return signAndPost(actions, wallet, true);
}

export async function cancelOrder(orderId: string, symbol: string, wallet: SigningWallet|null, mode: 'live'|'paper'): Promise<OrderResult> {
  if (mode === 'paper') return { success: true };
  if (!wallet) return { success: false, error: 'No wallet' };
  return signAndPost({ type:'cancel', symbol, orderId }, wallet, false);
}

export async function cancelAll(symbol: string, wallet: SigningWallet|null, mode: 'live'|'paper'): Promise<OrderResult> {
  if (mode === 'paper') return { success: true };
  if (!wallet) return { success: false, error: 'No wallet' };
  return signAndPost({ type:'cancelAll', symbols:[symbol] }, wallet, false);
}

export function makePrivyWallet(address: string, signFn: (msg: Uint8Array) => Promise<Uint8Array>): SigningWallet {
  return { publicKey: address, signMessage: signFn };
}

export interface PhantomProvider { publicKey: { toString(): string }; signMessage(msg: Uint8Array): Promise<{ signature: Uint8Array }>; connect(): Promise<void>; isConnected: boolean; }

export function makePhantomWallet(p: PhantomProvider): SigningWallet {
  return { publicKey: p.publicKey.toString(), signMessage: async (msg) => { const { signature } = await p.signMessage(msg); return signature; } };
}

export async function connectPhantom(): Promise<PhantomProvider> {
  const w = (window as unknown as Record<string,unknown>);
  const ph = (w.solana ?? (w.phantom as { solana?: PhantomProvider } | undefined)?.solana) as PhantomProvider | undefined;
  if (!ph) throw new Error('Phantom not installed');
  await ph.connect();
  return ph;
}
