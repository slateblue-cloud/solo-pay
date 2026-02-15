/**
 * Proxies to gateway POST /payments with public key + Origin from merchant config.
 * Body: orderId, amount, tokenAddress, successUrl, failUrl
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSoloPayClient } from '@/lib/solo-pay-client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderId, amount, tokenAddress, successUrl, failUrl } = body;

    if (!orderId || amount == null || !tokenAddress || !successUrl || !failUrl) {
      return NextResponse.json(
        {
          code: 'VALIDATION_ERROR',
          message: 'orderId, amount, tokenAddress, successUrl, failUrl are required',
        },
        { status: 400 }
      );
    }

    const client = getSoloPayClient();
    const payment = await client.createPayment({
      orderId: String(orderId),
      amount: Number(amount),
      tokenAddress: String(tokenAddress),
      successUrl: String(successUrl),
      failUrl: String(failUrl),
    });

    return NextResponse.json(payment, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create payment';
    const code = (err as { code?: string })?.code ?? 'INTERNAL_ERROR';
    return NextResponse.json({ code, message }, { status: 500 });
  }
}
