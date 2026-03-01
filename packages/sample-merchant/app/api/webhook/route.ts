import { prisma } from '@/app/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';

const GATEWAY_BASE = (process.env.GATEWAY_API_URL || 'http://localhost:3001').replace(/\/$/, '');
const GATEWAY_API_URL = `${GATEWAY_BASE}/api/v1`;
const API_KEY = process.env.SOLO_PAY_API_KEY || '';

/** Convert human-readable token amount to wei string (e.g. 25 → "25000000000000000000") */
function toWei(amount: number, decimals: number): string {
  const [intPart, decPart = ''] = amount.toString().split('.');
  const paddedDec = decPart.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(intPart + paddedDec).toString();
}

interface GatewayPaymentResponse {
  paymentId: string;
  orderId?: string;
  status: string;
  amount: string; // wei
  tokenSymbol: string;
  tokenDecimals: number;
  txHash?: string;
  confirmedAt?: string;
  currencyCode?: string;
  fiatAmount?: string;
}

/**
 * Verify payment by calling gateway API directly
 */
async function verifyPaymentWithGateway(orderId: string): Promise<GatewayPaymentResponse | null> {
  try {
    const response = await fetch(
      `${GATEWAY_API_URL}/merchant/payments?orderId=${encodeURIComponent(orderId)}`,
      {
        method: 'GET',
        headers: {
          'x-api-key': API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) return null;

    return (await response.json()) as GatewayPaymentResponse;
  } catch (error) {
    console.error('[webhook] Gateway request failed:', error);
    return null;
  }
}

/**
 * Verify that the gateway payment amount matches the product price.
 * Returns true if the amount is valid.
 */
function verifyAmount(
  gatewayPayment: GatewayPaymentResponse,
  productPrice: number
): { valid: boolean; reason?: string } {
  if (gatewayPayment.currencyCode && gatewayPayment.fiatAmount) {
    const fiatAmount = parseFloat(gatewayPayment.fiatAmount);
    if (Math.abs(fiatAmount - productPrice) > 1e-6) {
      return {
        valid: false,
        reason: `Fiat amount mismatch: product price=${productPrice} ${gatewayPayment.currencyCode}, gateway fiatAmount=${fiatAmount}`,
      };
    }
  } else {
    const expectedWei = toWei(productPrice, gatewayPayment.tokenDecimals);
    if (expectedWei !== gatewayPayment.amount) {
      return {
        valid: false,
        reason: `Wei amount mismatch: product price=${productPrice}, expected=${expectedWei}, gateway=${gatewayPayment.amount}`,
      };
    }
  }
  return { valid: true };
}

/**
 * Call gateway finalize API for an escrowed payment.
 */
async function callGatewayFinalize(paymentId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`${GATEWAY_API_URL}/payments/${paymentId}/finalize`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      return { ok: false, error: `HTTP ${response.status}: ${text}` };
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/**
 * Call gateway cancel API for an escrowed payment.
 */
async function callGatewayCancel(paymentId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`${GATEWAY_API_URL}/payments/${paymentId}/cancel`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      return { ok: false, error: `HTTP ${response.status}: ${text}` };
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

// Receive payment status updates from gateway webhook-manager
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderId, status } = body;

    if (!orderId || !status) {
      return NextResponse.json({ error: 'orderId and status are required' }, { status: 400 });
    }

    // orderId must be a valid integer (maps to local Payment.id)
    const localPaymentId = Number(orderId);
    if (!Number.isSafeInteger(localPaymentId) || localPaymentId <= 0) {
      console.warn(`[webhook] Invalid orderId=${orderId}, skipping`);
      return NextResponse.json({ success: true, ignored: true });
    }

    // 1. Find local payment record
    const localPayment = await prisma.payment.findUnique({
      where: { id: localPaymentId },
    });

    if (!localPayment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    // 2. Verify with gateway API (source of truth)
    const gatewayPayment = await verifyPaymentWithGateway(orderId);

    if (!gatewayPayment) {
      console.error(`[webhook] Gateway verification failed for orderId=${orderId}`);
      return NextResponse.json({ error: 'Gateway verification failed' }, { status: 502 });
    }

    // 3. Handle based on webhook status
    switch (status) {
      case 'ESCROWED':
        return handleEscrowed(orderId, localPayment, gatewayPayment);

      case 'FINALIZED':
        return handleConfirmed(orderId, localPayment, gatewayPayment);

      case 'FINALIZED':
        return handleFinalized(orderId, gatewayPayment);

      case 'CANCELLED':
        return handleCancelled(orderId, gatewayPayment);

      default:
        console.log(`[webhook] Ignoring unhandled status: ${status} for orderId=${orderId}`);
        return NextResponse.json({ success: true, ignored: true });
    }
  } catch (error) {
    console.error('[webhook] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Handle ESCROWED webhook: verify payment validity, then call finalize or cancel.
 */
async function handleEscrowed(
  orderId: string,
  localPayment: { product_id: number },
  gatewayPayment: GatewayPaymentResponse
) {
  // Verify gateway status is actually ESCROWED
  if (gatewayPayment.status !== 'ESCROWED') {
    console.error(
      `[webhook] Gateway status mismatch: expected ESCROWED, got ${gatewayPayment.status}`
    );
    return NextResponse.json({ error: 'Payment not escrowed on gateway' }, { status: 400 });
  }

  // Verify amount matches product price
  const product = await prisma.product.findUnique({
    where: { id: localPayment.product_id },
  });

  if (!product) {
    // Product not found — cancel the escrow
    console.error(`[webhook] Product not found for orderId=${orderId}, cancelling escrow`);
    const cancelResult = await callGatewayCancel(gatewayPayment.paymentId);
    if (!cancelResult.ok) {
      console.error(`[webhook] Cancel failed: ${cancelResult.error}`);
      return NextResponse.json({ error: 'Cancel request failed' }, { status: 502 });
    }
    await prisma.payment.update({
      where: { id: Number(orderId) },
      data: { status: 'CANCEL_SUBMITTED' },
    });
    return NextResponse.json({ success: true, action: 'cancel_submitted' });
  }

  const amountCheck = verifyAmount(gatewayPayment, product.price);

  if (amountCheck.valid) {
    // Valid payment — finalize the escrow
    console.log(`[webhook] Payment #${orderId} escrowed and valid, calling finalize`);
    const finalizeResult = await callGatewayFinalize(gatewayPayment.paymentId);
    if (!finalizeResult.ok) {
      console.error(`[webhook] Finalize failed: ${finalizeResult.error}`);
      return NextResponse.json({ error: 'Finalize request failed' }, { status: 502 });
    }
    await prisma.payment.update({
      where: { id: Number(orderId) },
      data: { status: 'FINALIZE_SUBMITTED' },
    });
    console.log(`[webhook] Payment #${orderId} finalize submitted`);
    return NextResponse.json({ success: true, action: 'finalize_submitted' });
  } else {
    // Invalid payment — cancel the escrow
    console.error(`[webhook] ${amountCheck.reason}, cancelling escrow for orderId=${orderId}`);
    const cancelResult = await callGatewayCancel(gatewayPayment.paymentId);
    if (!cancelResult.ok) {
      console.error(`[webhook] Cancel failed: ${cancelResult.error}`);
      return NextResponse.json({ error: 'Cancel request failed' }, { status: 502 });
    }
    await prisma.payment.update({
      where: { id: Number(orderId) },
      data: { status: 'CANCEL_SUBMITTED' },
    });
    console.log(`[webhook] Payment #${orderId} cancel submitted (amount mismatch)`);
    return NextResponse.json({ success: true, action: 'cancel_submitted' });
  }
}

/**
 * Handle CONFIRMED webhook (V1 direct payment flow — no escrow).
 */
async function handleConfirmed(
  orderId: string,
  localPayment: { product_id: number },
  gatewayPayment: GatewayPaymentResponse
) {
  if (gatewayPayment.status !== 'FINALIZED') {
    console.error(
      `[webhook] Gateway status mismatch: expected CONFIRMED, got ${gatewayPayment.status}`
    );
    return NextResponse.json({ error: 'Payment not confirmed on gateway' }, { status: 400 });
  }

  const product = await prisma.product.findUnique({
    where: { id: localPayment.product_id },
  });

  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }

  const amountCheck = verifyAmount(gatewayPayment, product.price);
  if (!amountCheck.valid) {
    console.error(`[webhook] ${amountCheck.reason}`);
    return NextResponse.json({ error: 'Amount mismatch' }, { status: 400 });
  }

  await prisma.payment.update({
    where: { id: Number(orderId) },
    data: {
      status: 'FINALIZED',
      tx_hash: gatewayPayment.txHash ?? null,
      confirmed_at: gatewayPayment.confirmedAt ? new Date(gatewayPayment.confirmedAt) : new Date(),
    },
  });

  console.log(`[webhook] Payment #${orderId} verified and confirmed`);
  return NextResponse.json({ success: true });
}

/**
 * Handle FINALIZED webhook (escrow released to merchant — terminal state).
 */
async function handleFinalized(orderId: string, gatewayPayment: GatewayPaymentResponse) {
  if (gatewayPayment.status !== 'FINALIZED') {
    console.error(
      `[webhook] Gateway status mismatch: expected FINALIZED, got ${gatewayPayment.status}`
    );
    return NextResponse.json({ error: 'Payment not finalized on gateway' }, { status: 400 });
  }

  await prisma.payment.update({
    where: { id: Number(orderId) },
    data: {
      status: 'FINALIZED',
      tx_hash: gatewayPayment.txHash ?? null,
      confirmed_at: gatewayPayment.confirmedAt ? new Date(gatewayPayment.confirmedAt) : new Date(),
    },
  });

  console.log(`[webhook] Payment #${orderId} finalized`);
  return NextResponse.json({ success: true });
}

/**
 * Handle CANCELLED webhook (escrow refunded to buyer — terminal state).
 */
async function handleCancelled(orderId: string, gatewayPayment: GatewayPaymentResponse) {
  if (gatewayPayment.status !== 'CANCELLED') {
    console.error(
      `[webhook] Gateway status mismatch: expected CANCELLED, got ${gatewayPayment.status}`
    );
    return NextResponse.json({ error: 'Payment not cancelled on gateway' }, { status: 400 });
  }

  await prisma.payment.update({
    where: { id: Number(orderId) },
    data: {
      status: 'CANCELLED',
    },
  });

  console.log(`[webhook] Payment #${orderId} cancelled`);
  return NextResponse.json({ success: true });
}
