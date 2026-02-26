-- Add escrow-related fields for V2 payment gateway

-- 1. Add new enum values to PaymentStatus
ALTER TABLE `Payment` MODIFY COLUMN `status` ENUM('CREATED', 'PENDING', 'CONFIRMED', 'FAILED', 'EXPIRED', 'ESCROWED', 'FINALIZE_SUBMITTED', 'CANCEL_SUBMITTED', 'FINALIZED', 'CANCELLED') NOT NULL DEFAULT 'CREATED';

-- 2. Add new enum values to EventType
ALTER TABLE `PaymentEvent` MODIFY COLUMN `event_type` ENUM('CREATED', 'STATUS_CHANGED', 'TX_SUBMITTED', 'TX_CONFIRMED', 'TX_FAILED', 'WEBHOOK_SENT', 'WEBHOOK_FAILED', 'ESCROWED', 'FINALIZE_SUBMITTED', 'FINALIZE_CONFIRMED', 'CANCEL_SUBMITTED', 'CANCEL_CONFIRMED') NOT NULL;

-- 3. Add escrow_duration to Merchant (nullable, default uses env DEFAULT_ESCROW_DURATION)
ALTER TABLE `Merchant` ADD COLUMN `escrow_duration` INT NULL;

-- 4. Add escrow_deadline to Payment (nullable, set when payment is created)
ALTER TABLE `Payment` ADD COLUMN `escrow_deadline` DATETIME(3) NULL;

-- 5. Add finalized_at and cancelled_at timestamps to Payment
ALTER TABLE `Payment` ADD COLUMN `finalized_at` DATETIME(3) NULL;
ALTER TABLE `Payment` ADD COLUMN `cancelled_at` DATETIME(3) NULL;
