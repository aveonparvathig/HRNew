-- Back-fill: the Leave & Attendance module was added after the default plans
-- were first seeded, so existing plans never listed 'leave' and any tenant put
-- on a plan lost the Leave module. Add 'leave' to every plan that is missing it.
-- Idempotent: the WHERE clause skips plans that already include it.
UPDATE "plans"
  SET "enabledModules" = array_append("enabledModules", 'leave')
  WHERE NOT ('leave' = ANY("enabledModules"));
