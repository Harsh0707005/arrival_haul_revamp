-- AlterTable
ALTER TABLE "User" ADD COLUMN     "countryCode" INTEGER NOT NULL DEFAULT 102,
ALTER COLUMN "source_country_id" SET DEFAULT 1,
ALTER COLUMN "destination_country_id" SET DEFAULT 2;
