-- WeCom userid ↔ existing account. OAuth looks up rows; it never inserts users.
CREATE TABLE "wecom_user_binding" (
    "wecom_userid" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wecom_user_binding_pkey" PRIMARY KEY ("wecom_userid")
);

CREATE UNIQUE INDEX "wecom_user_binding_user_id_key" ON "wecom_user_binding"("user_id");

ALTER TABLE "wecom_user_binding" ADD CONSTRAINT "wecom_user_binding_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
