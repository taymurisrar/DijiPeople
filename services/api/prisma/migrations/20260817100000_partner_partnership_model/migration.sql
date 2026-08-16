-- ITEM-0030 — carry the partnership model across conversion.
--
-- PartnerInquiry has captured `partnershipModel` since Wave 3, and converting an
-- inquiry into a Partner discarded it. The field an operator triages on — what
-- commercial relationship is being proposed — did not survive the moment the
-- relationship actually began, so it was answerable only by going back to the
-- inquiry, if one still existed.
--
-- Nullable and NOT backfilled. Partners taken on before this existed were taken
-- on under a model nobody recorded; deriving one from their inquiry would be
-- wrong wherever the inquiry was edited after conversion, and inventing one
-- where there is no inquiry at all would be a fabricated commercial fact. NULL
-- reads as "not recorded", which is true.
ALTER TABLE "Partner" ADD COLUMN "partnershipModel" "PartnershipModel";

CREATE INDEX "Partner_partnershipModel_idx" ON "Partner" ("partnershipModel");
