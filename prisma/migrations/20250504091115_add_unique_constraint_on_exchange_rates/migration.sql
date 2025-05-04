/*
  Warnings:

  - A unique constraint covering the columns `[fromId,toId]` on the table `ExchangeRate` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_fromId_toId_key" ON "ExchangeRate"("fromId", "toId");
