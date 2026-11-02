-- R-DEC-43: members and organizers rate each other with 1 to 5 stars once a paluwagan is completed, and
-- the organizer may rate a member who hands their slot over (R-WDR-09). Profiles show the averages.

-- CreateEnum
CREATE TYPE "RatingRole" AS ENUM ('MEMBER', 'ORGANIZER');

-- CreateTable
CREATE TABLE "ratings" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "reviewer_id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "role" "RatingRole" NOT NULL,
    "stars" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ratings_recipient_id_role_idx" ON "ratings"("recipient_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "ratings_group_id_reviewer_id_recipient_id_role_key" ON "ratings"("group_id", "reviewer_id", "recipient_id", "role");

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Whole stars from 1 to MAX_STARS (5); the service checks it too. Nobody rates themselves.
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_stars_range" CHECK ("stars" BETWEEN 1 AND 5);
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_not_self" CHECK ("reviewer_id" <> "recipient_id");

-- Every table has RLS on; the server reaches it through Prisma, browsers never do.
ALTER TABLE "ratings" ENABLE ROW LEVEL SECURITY;
