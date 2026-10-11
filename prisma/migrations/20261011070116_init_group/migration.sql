-- CreateEnum
CREATE TYPE "group_kind" AS ENUM ('school', 'company', 'community', 'other');

-- CreateEnum
CREATE TYPE "group_state" AS ENUM ('pending_owner', 'active', 'going_private', 'ownerless', 'locked', 'closed');

-- CreateEnum
CREATE TYPE "group_mode" AS ENUM ('public_open', 'public_review', 'private_code', 'private_invite');

-- CreateEnum
CREATE TYPE "group_board_style" AS ENUM ('list', 'grid');

-- CreateEnum
CREATE TYPE "group_lock_cause" AS ENUM ('master', 'ownerless_timeout', 'no_moderators');

-- CreateEnum
CREATE TYPE "group_role" AS ENUM ('member', 'moderator', 'owner');

-- CreateEnum
CREATE TYPE "group_join_path" AS ENUM ('joined', 'approved', 'invited', 'roster', 'assigned');

-- CreateEnum
CREATE TYPE "group_join_request_status" AS ENUM ('pending', 'approved', 'rejected', 'expired', 'withdrawn', 'cancelled');

-- CreateEnum
CREATE TYPE "group_invitation_status" AS ENUM ('pending', 'accepted', 'declined', 'expired', 'revoked', 'cancelled');

-- CreateEnum
CREATE TYPE "group_owner_offer_kind" AS ENUM ('assignment', 'transfer');

-- CreateEnum
CREATE TYPE "group_owner_offer_status" AS ENUM ('pending', 'accepted', 'declined', 'expired', 'cancelled');

-- CreateTable
CREATE TABLE "groups" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" TEXT NOT NULL,
    "name_folded" TEXT NOT NULL,
    "description" TEXT,
    "kind" "group_kind" NOT NULL,
    "state" "group_state" NOT NULL DEFAULT 'pending_owner',
    "mode" "group_mode" NOT NULL,
    "target_mode" "group_mode",
    "allow_outsiders" BOOLEAN NOT NULL DEFAULT false,
    "show_name_on_marketplace" BOOLEAN NOT NULL DEFAULT false,
    "board_style" "group_board_style" NOT NULL DEFAULT 'list',
    "code" TEXT,
    "ownerless_since" TIMESTAMPTZ(3),
    "nominee_id" UUID,
    "locked_at" TIMESTAMPTZ(3),
    "lock_cause" "group_lock_cause",
    "locked_reason" TEXT,
    "locked_by" UUID,
    "closed_at" TIMESTAMPTZ(3),
    "closed_by" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_units" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "group_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_members" (
    "group_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "role" "group_role" NOT NULL DEFAULT 'member',
    "moderator_unit_id" UUID,
    "unit_id" UUID,
    "joined_via" "group_join_path" NOT NULL,
    "joined_at" TIMESTAMPTZ(3) NOT NULL,
    "role_since" TIMESTAMPTZ(3),

    CONSTRAINT "group_members_pkey" PRIMARY KEY ("group_id","account_id")
);

-- CreateTable
CREATE TABLE "group_bans" (
    "group_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "banned_by" UUID NOT NULL,
    "banned_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "group_bans_pkey" PRIMARY KEY ("group_id","account_id")
);

-- CreateTable
CREATE TABLE "group_join_requests" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "group_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "status" "group_join_request_status" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "decided_at" TIMESTAMPTZ(3),
    "decided_by" UUID,

    CONSTRAINT "group_join_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_invitations" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "group_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "unit_id" UUID,
    "invited_by" UUID NOT NULL,
    "status" "group_invitation_status" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "decided_at" TIMESTAMPTZ(3),

    CONSTRAINT "group_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_roster_entries" (
    "group_id" UUID NOT NULL,
    "email_hash" TEXT NOT NULL,
    "unit_id" UUID,
    "added_by" UUID NOT NULL,
    "added_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "group_roster_entries_pkey" PRIMARY KEY ("group_id","email_hash")
);

-- CreateTable
CREATE TABLE "group_owner_offers" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "group_id" UUID NOT NULL,
    "kind" "group_owner_offer_kind" NOT NULL,
    "from_account_id" UUID,
    "to_account_id" UUID NOT NULL,
    "status" "group_owner_offer_status" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "decided_at" TIMESTAMPTZ(3),

    CONSTRAINT "group_owner_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_announcements" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "group_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "unit_id" UUID,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "group_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "groups_code_key" ON "groups"("code");

-- CreateIndex
CREATE INDEX "groups_state_mode_idx" ON "groups"("state", "mode");

-- CreateIndex
CREATE INDEX "groups_ownerless_idx" ON "groups"("ownerless_since") WHERE (state = 'ownerless');

-- CreateIndex
CREATE UNIQUE INDEX "group_units_group_id_name_key" ON "group_units"("group_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "group_units_group_id_id_key" ON "group_units"("group_id", "id");

-- CreateIndex
CREATE INDEX "group_members_account_id_idx" ON "group_members"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_members_one_owner_key" ON "group_members"("group_id") WHERE (role = 'owner');

-- CreateIndex
CREATE INDEX "group_join_requests_account_id_status_idx" ON "group_join_requests"("account_id", "status");

-- CreateIndex
CREATE INDEX "group_join_requests_group_id_status_created_at_idx" ON "group_join_requests"("group_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "group_join_requests_due_idx" ON "group_join_requests"("expires_at") WHERE (status = 'pending');

-- CreateIndex
CREATE UNIQUE INDEX "group_join_requests_pending_key" ON "group_join_requests"("group_id", "account_id") WHERE (status = 'pending');

-- CreateIndex
CREATE INDEX "group_invitations_account_id_status_idx" ON "group_invitations"("account_id", "status");

-- CreateIndex
CREATE INDEX "group_invitations_due_idx" ON "group_invitations"("expires_at") WHERE (status = 'pending');

-- CreateIndex
CREATE UNIQUE INDEX "group_invitations_pending_key" ON "group_invitations"("group_id", "account_id") WHERE (status = 'pending');

-- CreateIndex
CREATE INDEX "group_roster_entries_email_hash_idx" ON "group_roster_entries"("email_hash");

-- CreateIndex
CREATE INDEX "group_owner_offers_to_account_id_status_idx" ON "group_owner_offers"("to_account_id", "status");

-- CreateIndex
CREATE INDEX "group_owner_offers_due_idx" ON "group_owner_offers"("expires_at") WHERE (status = 'pending');

-- CreateIndex
CREATE UNIQUE INDEX "group_owner_offers_pending_key" ON "group_owner_offers"("group_id") WHERE (status = 'pending');

-- CreateIndex
CREATE INDEX "group_announcements_group_id_created_at_idx" ON "group_announcements"("group_id", "created_at");

-- AddForeignKey
ALTER TABLE "group_units" ADD CONSTRAINT "group_units_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_unit_id_fkey" FOREIGN KEY ("group_id", "unit_id") REFERENCES "group_units"("group_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_moderator_unit_id_fkey" FOREIGN KEY ("group_id", "moderator_unit_id") REFERENCES "group_units"("group_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_bans" ADD CONSTRAINT "group_bans_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_bans" ADD CONSTRAINT "group_bans_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_join_requests" ADD CONSTRAINT "group_join_requests_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_join_requests" ADD CONSTRAINT "group_join_requests_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_invitations" ADD CONSTRAINT "group_invitations_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_invitations" ADD CONSTRAINT "group_invitations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_roster_entries" ADD CONSTRAINT "group_roster_entries_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_owner_offers" ADD CONSTRAINT "group_owner_offers_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_owner_offers" ADD CONSTRAINT "group_owner_offers_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_announcements" ADD CONSTRAINT "group_announcements_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── CHECK viết tay (tên trùng comment `///` ở model) ─────────────────────────────────────────────
ALTER TABLE "groups"
  ADD CONSTRAINT "groups_locked_check" CHECK ("state" <> 'locked' OR ("locked_at" IS NOT NULL AND "lock_cause" IS NOT NULL)),
  ADD CONSTRAINT "groups_master_lock_reason_check" CHECK ("lock_cause" IS DISTINCT FROM 'master' OR "locked_reason" IS NOT NULL),
  ADD CONSTRAINT "groups_closed_check" CHECK (("state" = 'closed') = ("closed_at" IS NOT NULL)),
  ADD CONSTRAINT "groups_ownerless_check" CHECK ("state" <> 'ownerless' OR "ownerless_since" IS NOT NULL),
  ADD CONSTRAINT "groups_going_private_check" CHECK (("state" = 'going_private') = ("target_mode" IS NOT NULL) AND ("target_mode" IS NULL OR "target_mode" IN ('private_code', 'private_invite'))),
  ADD CONSTRAINT "groups_outsiders_check" CHECK (NOT "allow_outsiders" OR "mode" IN ('public_open', 'public_review')),
  ADD CONSTRAINT "groups_show_name_check" CHECK (NOT "show_name_on_marketplace" OR "mode" IN ('private_code', 'private_invite')),
  ADD CONSTRAINT "groups_code_check" CHECK (("code" IS NOT NULL) = ("mode" = 'private_code' AND "state" <> 'closed'));

ALTER TABLE "group_members"
  ADD CONSTRAINT "group_members_moderator_unit_check" CHECK ("moderator_unit_id" IS NULL OR "role" = 'moderator'),
  ADD CONSTRAINT "group_members_role_since_check" CHECK ("role" = 'member' OR "role_since" IS NOT NULL);

ALTER TABLE "group_join_requests"
  ADD CONSTRAINT "group_join_requests_decided_check" CHECK (("status" = 'pending') = ("decided_at" IS NULL));

ALTER TABLE "group_invitations"
  ADD CONSTRAINT "group_invitations_decided_check" CHECK (("status" = 'pending') = ("decided_at" IS NULL));

ALTER TABLE "group_owner_offers"
  ADD CONSTRAINT "group_owner_offers_decided_check" CHECK (("status" = 'pending') = ("decided_at" IS NULL));
