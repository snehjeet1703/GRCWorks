import { UserRole } from "@prisma/client";
import NextAuth from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: UserRole;
      organizationId: string;
      organizationName: string;
      mfaPending?: boolean;
      mfaMethod?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: UserRole;
    organizationId: string;
    organizationName: string;
    mfaPending?: boolean;
    mfaMethod?: string;
  }
}
