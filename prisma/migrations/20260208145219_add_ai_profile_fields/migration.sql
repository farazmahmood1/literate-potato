-- AlterTable
ALTER TABLE "lawyer_profiles" ADD COLUMN     "certifications" JSONB,
ADD COLUMN     "courtLevels" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "education" JSONB,
ADD COLUMN     "linkedInUrl" TEXT,
ADD COLUMN     "previousFirms" JSONB,
ADD COLUMN     "professionalSummary" TEXT,
ADD COLUMN     "profilePhoto" TEXT;
