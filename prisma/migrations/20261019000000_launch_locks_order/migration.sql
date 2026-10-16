-- R-DEC-27: launching makes the payout order final; there is no separate lock step.
ALTER TABLE "groups" DROP COLUMN "order_locked";
