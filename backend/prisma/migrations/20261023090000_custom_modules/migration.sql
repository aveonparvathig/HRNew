-- Per-tenant custom-module grant. Off for every tenant by default; granted
-- from the platform-owner console. Subset of CUSTOM_MODULES (project | proposals).
ALTER TABLE "organizations" ADD COLUMN "customModules" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Grant the custom modules to Aveon Infotech (the platform owner's own org) so
-- it keeps Project & Sales; every other tenant stays empty and never sees them.
UPDATE "organizations" SET "customModules" = ARRAY['project', 'proposals']
  WHERE name ILIKE '%aveon%infotech%';

-- Keep standard plans clean: custom modules are never carried on a plan.
UPDATE "plans" SET "enabledModules" =
  array_remove(array_remove("enabledModules", 'project'), 'proposals');
