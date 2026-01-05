-- CreateEnum
CREATE TYPE "AuthEventType" AS ENUM ('LOGIN_PASSWORD', 'LOGIN_OTP_SENT', 'LOGIN_OTP_VERIFY', 'LOGOUT', 'PASSWORD_CHANGE', 'ADMIN_USER_CREATE', 'ADMIN_USER_UPDATE', 'ADMIN_USER_DELETE');

-- CreateTable
CREATE TABLE "LoginEvent" (
    "id" TEXT NOT NULL,
    "type" "AuthEventType" NOT NULL,
    "success" BOOLEAN NOT NULL,
    "reason" TEXT,
    "email" TEXT,
    "userId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoginEvent_userId_createdAt_idx" ON "LoginEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LoginEvent_email_createdAt_idx" ON "LoginEvent"("email", "createdAt");

-- AddForeignKey
ALTER TABLE "LoginEvent" ADD CONSTRAINT "LoginEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
