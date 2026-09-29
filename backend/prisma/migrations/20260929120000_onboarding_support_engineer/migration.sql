-- Larger institutions run with a second engineer alongside the primary one.
ALTER TABLE "client_onboardings" ADD COLUMN "supportEngineer" TEXT NOT NULL DEFAULT '';
