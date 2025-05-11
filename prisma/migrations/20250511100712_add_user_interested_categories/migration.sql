-- CreateTable
CREATE TABLE "_UserInterestedCategories" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_UserInterestedCategories_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_UserInterestedCategories_B_index" ON "_UserInterestedCategories"("B");

-- AddForeignKey
ALTER TABLE "_UserInterestedCategories" ADD CONSTRAINT "_UserInterestedCategories_A_fkey" FOREIGN KEY ("A") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserInterestedCategories" ADD CONSTRAINT "_UserInterestedCategories_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
