import { prisma } from "@/lib/db/prisma";
import type {AuthEventType} from "@/generated/prisma/enums";

export async function auditAuth(params: {
    type: AuthEventType;
    success: boolean;
    reason?: string;
    email?: string;
    userId?: string;
    ip?: string;
    userAgent?: string;
}) {
    await prisma.loginEvent.create({
        data: {
            type: params.type,
            success: params.success,
            reason: params.reason,
            email: params.email,
            userId: params.userId,
            ip: params.ip,
            userAgent: params.userAgent,
        },
    });
}
