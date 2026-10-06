import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./db";

type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "APPROVE" | "LOGIN";

type Db = PrismaClient | Prisma.TransactionClient;

export async function logAudit(
  {
    organizationId,
    userId,
    userName,
    entityType,
    entityId,
    entityName = "",
    action,
    changes = {},
    beforeJson,
    afterJson,
    metadataJson,
    requestId,
  }: {
    organizationId: string;
    userId: string | null;
    userName: string;
    entityType: string;
    entityId: string;
    entityName?: string;
    action: AuditAction;
    changes?: Record<string, unknown>;
    beforeJson?: Record<string, unknown> | null;
    afterJson?: Record<string, unknown> | null;
    metadataJson?: Record<string, unknown> | null;
    requestId?: string | null;
  },
  db: Db = prisma
) {
  return db.auditLog.create({
    data: {
      organizationId,
      userId,
      userName,
      entityType,
      entityId,
      entityName,
      action,
      changes: changes as Prisma.InputJsonValue,
      beforeJson: beforeJson ? (beforeJson as Prisma.InputJsonValue) : undefined,
      afterJson: afterJson ? (afterJson as Prisma.InputJsonValue) : undefined,
      metadataJson: metadataJson ? (metadataJson as Prisma.InputJsonValue) : undefined,
      requestId: requestId ?? undefined,
    },
  });
}

export function diffChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Record<string, { from: unknown; to: unknown }> {
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      diff[key] = { from: before[key], to: after[key] };
    }
  }
  return diff;
}

export function snapshotEntity(entity: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const snap: Record<string, unknown> = {};
  for (const k of keys) {
    if (k in entity) snap[k] = entity[k];
  }
  return snap;
}
