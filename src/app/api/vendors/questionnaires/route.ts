import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleError, parseBody, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";

const questionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(1000),
  type: z.enum(["TEXT", "YES_NO", "SINGLE_CHOICE", "MULTI_CHOICE", "RATING", "FILE_UPLOAD"]),
  required: z.boolean().optional().default(true),
  options: z.array(z.string()).optional().default([]),
  category: z.string().max(200).optional().default(""),
});

const createSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional().default(""),
  category: z.string().max(100).optional().default("GENERAL"),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional().default("DRAFT"),
  questions: z.array(questionSchema).min(1),
}).strict();

export async function GET() {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.VENDORS_READ);
    const questionnaires = await prisma.vendorQuestionnaire.findMany({
      where: { organizationId: user.organizationId },
      include: { _count: { select: { responses: true } } },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(questionnaires);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.VENDORS_WRITE);
    const data = await parseBody(req, createSchema);
    const questionnaire = await prisma.$transaction(async (tx) => {
      const created = await tx.vendorQuestionnaire.create({
        data: {
          organizationId: user.organizationId,
          title: data.title,
          description: data.description,
          category: data.category,
          status: data.status,
          questions: data.questions as any,
        },
      });
      await logAudit({
        organizationId: user.organizationId,
        userId: user.id,
        userName: user.name,
        entityType: "vendorquestionnaire",
        entityId: created.id,
        entityName: created.title,
        action: "CREATE",
        afterJson: { title: created.title, category: created.category, questionCount: data.questions.length },
      }, tx);
      return created;
    });
    return NextResponse.json(questionnaire, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
