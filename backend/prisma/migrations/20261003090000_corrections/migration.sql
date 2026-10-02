-- AlterTable
ALTER TABLE "tax_regime_configs" ADD COLUMN     "professionalTaxLimit" DOUBLE PRECISION NOT NULL DEFAULT 2500;

-- Declaration items: four items carried only the higher limit the law
-- gives to senior citizens or for severe disability, so the ordinary case
-- was over-allowed. Each becomes two. The existing item keeps its code,
-- its limit and every amount declared against it, and is named as the
-- higher case; the ordinary case is added beside it. An item that HR has
-- renamed or given another limit is left alone and gets no sibling.
UPDATE "declaration_items" SET "name" = 'Medical insurance — parents (senior citizens)', "updatedAt" = now()
  WHERE "code" = 'MEDICLAIM_PARENTS' AND "name" = 'Medical insurance — parents' AND "maxAmount" = 50000;
UPDATE "declaration_items" SET "name" = 'Dependant with severe disability (80% or more)', "updatedAt" = now()
  WHERE "code" = 'DISABLED_DEPENDANT' AND "name" = 'Treatment of a dependant with disability' AND "maxAmount" = 125000;
UPDATE "declaration_items" SET "name" = 'Treatment of specified disease (senior citizen)', "updatedAt" = now()
  WHERE "code" = 'SPECIFIED_DISEASE' AND "name" = 'Treatment of specified disease' AND "maxAmount" = 100000;
UPDATE "declaration_items" SET "name" = 'Own severe disability (80% or more)', "updatedAt" = now()
  WHERE "code" = 'SELF_DISABILITY' AND "name" = 'Own disability' AND "maxAmount" = 125000;

INSERT INTO "declaration_items"
  ("id", "organizationId", "code", "name", "section", "sectionNew", "group", "maxAmount", "deductPercent", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT concat('c', md5(random()::text || d."id")), d."organizationId", v."code", v."name",
       d."section", d."sectionNew", d."group", v."maxAmount", d."deductPercent", d."isActive", d."sortOrder", now(), now()
FROM "declaration_items" d
JOIN (VALUES
  ('MEDICLAIM_PARENTS', 'Medical insurance — parents (senior citizens)', 'MEDICLAIM_PARENTS_BELOW_60', 'Medical insurance — parents (below 60)', 25000),
  ('DISABLED_DEPENDANT', 'Dependant with severe disability (80% or more)', 'DISABLED_DEPENDANT_40', 'Dependant with disability (40% to 80%)', 75000),
  ('SPECIFIED_DISEASE', 'Treatment of specified disease (senior citizen)', 'SPECIFIED_DISEASE_BELOW_60', 'Treatment of specified disease (patient below 60)', 40000),
  ('SELF_DISABILITY', 'Own severe disability (80% or more)', 'SELF_DISABILITY_40', 'Own disability (40% to 80%)', 75000)
) AS v("sibling", "siblingName", "code", "name", "maxAmount")
  ON d."code" = v."sibling" AND d."name" = v."siblingName"
ON CONFLICT ("organizationId", "code") DO NOTHING;
