-- DP-MASTER WP-21.S1: work components in the one package engine. Additive only.

-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CustomizationSolutionComponentType" ADD VALUE 'workUnit';
ALTER TYPE "CustomizationSolutionComponentType" ADD VALUE 'workProfile';
ALTER TYPE "CustomizationSolutionComponentType" ADD VALUE 'workQueue';
