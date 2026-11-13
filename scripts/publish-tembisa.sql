-- Publish "Mixed Development in Tembisa" (property #28) for investment.
-- Creates a dedicated SPV, assigns it, corrects the funding goal (R1bn typo -> R8m),
-- and flips the property to RAISING_FUNDS + published with a funding breakdown.
BEGIN;

WITH new_spv AS (
  INSERT INTO "SPV" (name, "registrationNumber", status, "directorId", "registeredDate", "createdAt", "updatedAt")
  VALUES ('Tembisa Mixed Development SPV (Pty) Ltd', 'PENDING-CIPC', 'REGISTERED', 1, now(), now(), now())
  RETURNING id
)
UPDATE "Property" p
SET "spvId" = (SELECT id FROM new_spv),
    "investmentStatus" = 'RAISING_FUNDS',
    "isPublished" = true,
    "fundingGoal" = 8000000,
    "fundingClosingDate" = now() + interval '90 days',
    "fundingBreakdown" = '[{"category":"Land & Site","amount":1500000,"description":"Land acquisition and site works"},{"category":"Construction","amount":4500000,"description":"Hard construction costs"},{"category":"Professional Fees & Approvals","amount":1000000,"description":"Architect, engineers, town planning and statutory approvals"},{"category":"Contingency","amount":500000,"description":"Development contingency"},{"category":"Marketing & Holding","amount":500000,"description":"Sales, marketing and holding costs"}]'::jsonb
WHERE p.id = 28;

UPDATE "PropertyDevelopment" SET "fundingGoal" = 8000000 WHERE "propertyId" = 28;

COMMIT;

SELECT p.id, p.title, p."investmentStatus", p."isPublished", p."spvId", p."fundingGoal", p."fundingClosingDate"
FROM "Property" p WHERE p.id = 28;
