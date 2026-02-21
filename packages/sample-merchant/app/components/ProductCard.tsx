'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { SoloPay } from '@solo-pay/widget-js';

interface Product {
  id: number;
  name: string;
  roast: string;
  weight: string;
  price: number;
  description: string;
  image_url: string | null;
}

const roastBgMap: Record<string, string> = {
  'Light Roast': 'bg-roast-light',
  'Light-Medium Roast': 'bg-roast-light-medium',
  'Medium Roast': 'bg-roast-medium',
  'Medium-Dark Roast': 'bg-roast-medium-dark',
  'Dark Roast': 'bg-roast-dark',
};

export default function ProductCard({
  product,
  index = 0,
  widgetUrl,
  publicKey,
}: {
  product: Product;
  index?: number;
  widgetUrl: string;
  publicKey: string;
}) {
  const [isOpening, setIsOpening] = useState(false);
  const soloPayRef = useRef<SoloPay | null>(null);

  useEffect(() => {
    if (!publicKey || !widgetUrl) return;
    soloPayRef.current = new SoloPay({
      publicKey,
      widgetUrl,
      debug: process.env.NODE_ENV === 'development',
    });
    return () => {
      soloPayRef.current?.destroy();
      soloPayRef.current = null;
    };
  }, [publicKey, widgetUrl]);

  const handleClickPayNow = async () => {
    if (!soloPayRef.current) return;
    setIsOpening(true);
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id, price: product.price }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to create payment');

      const origin = window.location.origin;
      soloPayRef.current.requestPayment(
        {
          orderId: String(data.paymentId),
          amount: String(product.price),
          tokenAddress: data.tokenAddress,
          currency: 'USD',
          successUrl: `${origin}/payments/success?paymentId=${data.paymentId}`,
          failUrl: `${origin}/`,
        },
        { onClose: () => setIsOpening(false) }
      );
    } catch (err) {
      console.error('[ProductCard] Payment error:', err);
      setIsOpening(false);
    }
  };

  const roastBg = roastBgMap[product.roast] || 'bg-roast-medium';

  return (
    <>
      <div
        className="animate-fade-in-up rounded-2xl bg-surface-card overflow-hidden shadow-card hover:-translate-y-1.5 hover:shadow-card-hover transition-all duration-400 cursor-pointer flex flex-col"
        style={{ animationDelay: `${index * 80}ms` }}
      >
        <div className={`aspect-4/3 w-full ${roastBg} flex items-center justify-center p-6`}>
          {product.image_url && (
            <div className="relative w-full h-full">
              <Image
                src={product.image_url}
                alt={product.name}
                fill
                className="object-contain transition-transform duration-500 hover:-translate-y-1"
              />
            </div>
          )}
        </div>

        <div className="p-6 flex-1 flex flex-col">
          <span className="inline-block self-start px-3 py-1 rounded-full text-[11px] font-medium tracking-widest uppercase text-accent-gold bg-roast-light mb-3">
            {product.roast}
          </span>

          <h2 className="font-playfair text-xl font-semibold text-text-primary mb-2">
            {product.name}
          </h2>

          <p className="text-text-secondary text-sm leading-relaxed mb-5 flex-1">
            {product.description}
          </p>

          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-1.5">
              <span className="text-text-primary text-lg font-semibold">${product.price}</span>
              <span className="text-text-muted text-xs">{product.weight}</span>
            </div>
            <button
              type="button"
              disabled={!publicKey || isOpening}
              className="px-5 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
              onClick={handleClickPayNow}
            >
              {isOpening ? 'Opening…' : 'Order'}
            </button>
          </div>
        </div>
      </div>

      {isOpening && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          aria-busy
          aria-live="polite"
        >
          <div className="rounded-2xl bg-white px-8 py-6 shadow-2xl text-center">
            <p className="text-text-primary font-medium">Opening payment window…</p>
            <p className="text-text-muted text-sm mt-1">
              Complete payment in the popup or new tab.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
