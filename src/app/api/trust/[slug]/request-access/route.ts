import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const BLOCKED_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com",
  "icloud.com", "mail.com", "protonmail.com", "yandex.com", "zoho.com",
  "live.com", "msn.com", "me.com", "inbox.com", "gmx.com",
]);

const requestSchema = z.object({
  email: z.string().email().max(200),
  name: z.string().min(1).max(200),
  company: z.string().min(1).max(200),
  reason: z.string().max(2000).optional().default(""),
}).strict();

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const org = await prisma.organization.findUnique({ where: { slug } });
    if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const config = await prisma.trustVaultConfig.findUnique({
      where: { organizationId: org.id },
    });
    if (!config || !config.enabled) {
      return NextResponse.json({ error: "Trust vault not enabled" }, { status: 404 });
    }

    let data: z.infer<typeof requestSchema>;
    try {
      data = requestSchema.parse(await req.json());
    } catch {
      return NextResponse.json({ error: "Invalid request data" }, { status: 400 });
    }

    const domain = data.email.split("@")[1]?.toLowerCase();
    if (!domain || BLOCKED_DOMAINS.has(domain)) {
      return NextResponse.json(
        { error: "Please use your official company email address" },
        { status: 400 }
      );
    }

    const existing = await prisma.trustAccessRequest.findFirst({
      where: { configId: config.id, email: data.email.toLowerCase(), status: "PENDING" },
    });
    if (existing) {
      return NextResponse.json(
        { error: "A request with this email is already pending" },
        { status: 409 }
      );
    }

    await prisma.trustAccessRequest.create({
      data: {
        configId: config.id,
        email: data.email.toLowerCase(),
        name: data.name,
        company: data.company,
        reason: data.reason,
      },
    });

    return NextResponse.json({ success: true, message: "Access request submitted successfully" }, { status: 201 });
  } catch (err) {
    console.error("[trust/request-access] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
