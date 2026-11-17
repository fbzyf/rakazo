-- Additive: older releases never read or write this table.
-- A template is visible to every member of its space. The publisher check lives in the app.
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bot_templates_spaceId_sourceBotId_key" ON "bot_templates"("spaceId", "sourceBotId");

CREATE INDEX "bot_templates_spaceId_updatedAt_idx" ON "bot_templates"("spaceId", "updatedAt");

ALTER TABLE "bot_templates" ADD CONSTRAINT "bot_templates_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bot_templates" ADD CONSTRAINT "bot_templates_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "bot_templates" ADD CONSTRAINT "bot_templates_sourceBotId_fkey" FOREIGN KEY ("sourceBotId") REFERENCES "bots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "bot_templates" ENABLE ROW LEVEL SECURITY;
CREATE POLICY bot_templates_tenant ON "bot_templates"
  USING ("spaceId" = NULLIF(current_setting('app.space_id', true), ''));
CREATE POLICY bot_templates_system ON "bot_templates"
  USING ((SELECT app_rls_bypass()));
