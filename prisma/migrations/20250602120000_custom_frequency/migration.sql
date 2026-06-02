-- AlterEnum
ALTER TYPE "GroupFrequency" ADD VALUE 'custom';

-- AlterTable
ALTER TABLE "groups" ADD COLUMN "frequency_days" INTEGER;
