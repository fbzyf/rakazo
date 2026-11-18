-- Additive: older releases never read or write this table.
-- A template is visible to its workspace, or to every signed-in workspace when
-- audience is signed_in. A session with no workspace sees nothing.
-- Existing rows (none on first apply) default to space.
CREATE TABLE "bot_templates" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "sourceBotId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "instructions" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL,
    "avatarSet" TEXT NOT NULL DEFAULT 'organic',
    "routines" JSONB NOT NULL DEFAULT '[]',
    "audience" TEXT NOT NULL DEFAULT 'space',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_templates_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "bot_templates" ADD CONSTRAINT "bot_templates_audience_check"
  CHECK ("audience" IN ('space', 'signed_in'));

CREATE UNIQUE INDEX "bot_templates_spaceId_sourceBotId_key" ON "bot_templates"("spaceId", "sourceBotId");

CREATE INDEX "bot_templates_spaceId_updatedAt_idx" ON "bot_templates"("spaceId", "updatedAt");

ALTER TABLE "bot_templates" ADD CONSTRAINT "bot_templates_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bot_templates" ADD CONSTRAINT "bot_templates_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "bot_templates" ADD CONSTRAINT "bot_templates_sourceBotId_fkey" FOREIGN KEY ("sourceBotId") REFERENCES "bots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "bot_templates" ENABLE ROW LEVEL SECURITY;

CREATE POLICY bot_templates_tenant_read ON "bot_templates"
  FOR SELECT
  USING (
    NULLIF(current_setting('app.space_id', true), '') IS NOT NULL
    AND (
      "spaceId" = NULLIF(current_setting('app.space_id', true), '')
      OR "audience" = 'signed_in'
    )
  );

CREATE POLICY bot_templates_tenant_insert ON "bot_templates"
  FOR INSERT
  WITH CHECK ("spaceId" = NULLIF(current_setting('app.space_id', true), ''));

CREATE POLICY bot_templates_tenant_update ON "bot_templates"
  FOR UPDATE
  USING ("spaceId" = NULLIF(current_setting('app.space_id', true), ''))
  WITH CHECK ("spaceId" = NULLIF(current_setting('app.space_id', true), ''));

CREATE POLICY bot_templates_tenant_delete ON "bot_templates"
  FOR DELETE
  USING (
    "spaceId" = NULLIF(current_setting('app.space_id', true), '')
    OR (
      "audience" = 'signed_in'
      AND "createdByUserId" = NULLIF(current_setting('app.user_id', true), '')
    )
  );

CREATE POLICY bot_templates_system ON "bot_templates"
  USING ((SELECT app_rls_bypass()));
