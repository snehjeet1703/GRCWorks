-- CreateTable: roles
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "is_built_in" BOOLEAN NOT NULL DEFAULT false,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable: user_framework_scopes
CREATE TABLE "user_framework_scopes" (
    "user_id" TEXT NOT NULL,
    "framework_id" TEXT NOT NULL,

    CONSTRAINT "user_framework_scopes_pkey" PRIMARY KEY ("user_id","framework_id")
);

-- AddColumn: users.role_id (nullable FK to roles)
ALTER TABLE "users" ADD COLUMN "role_id" TEXT;

-- CreateIndex
CREATE INDEX "roles_organization_id_idx" ON "roles"("organization_id");
CREATE UNIQUE INDEX "roles_organization_id_name_key" ON "roles"("organization_id", "name");

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_framework_scopes" ADD CONSTRAINT "user_framework_scopes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_framework_scopes" ADD CONSTRAINT "user_framework_scopes_framework_id_fkey" FOREIGN KEY ("framework_id") REFERENCES "frameworks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
