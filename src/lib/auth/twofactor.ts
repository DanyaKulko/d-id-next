import crypto from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { sendOtpEmail } from "@/lib/email/smtp";
import { logExternalServiceError } from "@/lib/logging/external-errors";

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("base64url");
}
function otp6() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}
const OTP_TTL_MIN = 10;

export async function startEmail2fa(userId: string, email: string) {
  await prisma.twoFactorToken.updateMany({
    where: { userId, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });

  const code = otp6();
  const codeHash = sha256(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000);

  const t = await prisma.twoFactorToken.create({
    data: { userId, codeHash, expiresAt },
    select: { id: true, expiresAt: true },
  });

  console.log("code", code);
  let emailSent = true;
  try {
    await sendOtpEmail({ to: email, code, ttlMinutes: OTP_TTL_MIN });
  } catch (error) {
    emailSent = false;
    await logExternalServiceError({
      source: "SMTP",
      type: "OTP_SEND",
      message:
        error instanceof Error ? error.message : "Failed to send OTP email",
    }).catch(() => undefined);
  }

  return { tokenId: t.id, expiresAt: t.expiresAt, emailSent };
}

export async function verifyEmail2fa(params: {
  userId: string;
  tokenId: string;
  code: string;
}) {
  const t = await prisma.twoFactorToken.findFirst({
    where: {
      id: params.tokenId,
      userId: params.userId,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true, codeHash: true, attempts: true, maxAttempts: true },
  });
  if (!t) return { ok: false as const, reason: "invalid_or_expired" as const };
  if (t.attempts >= t.maxAttempts) {
    await prisma.twoFactorToken.update({
      where: { id: t.id },
      data: { consumedAt: new Date() },
    });
    return { ok: false as const, reason: "too_many_attempts" as const };
  }

  const ok = crypto.timingSafeEqual(
    Buffer.from(t.codeHash),
    Buffer.from(sha256(params.code)),
  );
  if (!ok) {
    await prisma.twoFactorToken.update({
      where: { id: t.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false as const, reason: "wrong_code" as const };
  }

  await prisma.twoFactorToken.update({
    where: { id: t.id },
    data: { consumedAt: new Date() },
  });
  return { ok: true as const };
}
