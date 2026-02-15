// Mock for @solo-pay/database when the package isn't built

export class Decimal {
  private value: string;
  constructor(value: string | number | Decimal) {
    this.value = String(value);
  }
  toString() {
    return this.value;
  }
  toFixed(dp?: number) {
    return Number(this.value).toFixed(dp);
  }
  valueOf() {
    return Number(this.value);
  }
  equals(other: Decimal) {
    return this.value === String(other);
  }
  static isDecimal(obj: unknown): obj is Decimal {
    return obj instanceof Decimal;
  }
}

// Prisma enums
export const PaymentStatus = {
  CREATED: 'CREATED',
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const RelayStatus = {
  QUEUED: 'QUEUED',
  SUBMITTED: 'SUBMITTED',
  CONFIRMED: 'CONFIRMED',
  FAILED: 'FAILED',
} as const;
export type RelayStatus = (typeof RelayStatus)[keyof typeof RelayStatus];

export const RefundStatus = {
  PENDING: 'PENDING',
  SUBMITTED: 'SUBMITTED',
  CONFIRMED: 'CONFIRMED',
  FAILED: 'FAILED',
} as const;
export type RefundStatus = (typeof RefundStatus)[keyof typeof RefundStatus];

export const EventType = {
  CREATED: 'CREATED',
  STATUS_CHANGED: 'STATUS_CHANGED',
  RELAY_SUBMITTED: 'RELAY_SUBMITTED',
  RELAY_CONFIRMED: 'RELAY_CONFIRMED',
  EXPIRED: 'EXPIRED',
  REFUND_REQUESTED: 'REFUND_REQUESTED',
  REFUND_SUBMITTED: 'REFUND_SUBMITTED',
  REFUND_CONFIRMED: 'REFUND_CONFIRMED',
  REFUND_FAILED: 'REFUND_FAILED',
} as const;
export type EventType = (typeof EventType)[keyof typeof EventType];

export const Prisma = {
  Decimal,
  PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
    code: string;
    meta?: Record<string, unknown>;
    constructor(
      message: string,
      { code, meta }: { code: string; meta?: Record<string, unknown>; clientVersion?: string }
    ) {
      super(message);
      this.code = code;
      this.meta = meta;
      this.name = 'PrismaClientKnownRequestError';
    }
  },
};

// Type stubs for Prisma model types
export type Merchant = Record<string, unknown>;
export type Payment = Record<string, unknown>;
export type Refund = Record<string, unknown>;
export type Relay = Record<string, unknown>;
export type Chain = Record<string, unknown>;
export type Token = Record<string, unknown>;

export const getPrismaClient = () => {
  throw new Error('Not available in test');
};
export const disconnectPrisma = async () => {};
