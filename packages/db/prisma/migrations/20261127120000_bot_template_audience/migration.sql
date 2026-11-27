-- Additive: existing templates stay visible only in their workspace.
ALTER TABLE "bot_templates" ADD COLUMN "audience" TEXT NOT NULL DEFAULT 'space';

ALTER TABLE "bot_templates" ADD CONSTRAINT "bot_templates_audience_check"
  CHECK ("audience" IN ('space', 'signed_in'));

-- Read: a logged-in workspace can see its own templates and ones shared with everyone
-- who can log in. A session with no workspace sees nothing.
-- Write: a workspace can only change rows it owns. The publisher can delete their
-- signed-in template from whichever workspace they are in.
DROP POLICY bot_templates_tenant ON "bot_templates";

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
