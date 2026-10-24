-- Password-reset fields (bcrypt-hashed OTP + expiry + attempt lockout),
-- mirroring the email-verification hardening from 20261024055951_add_otp_lockout.
ALTER TABLE "User" ADD COLUMN     "passwordResetToken" TEXT,
ADD COLUMN     "passwordResetExpires" TIMESTAMP(3),
ADD COLUMN     "resetAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "resetLockedUntil" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_passwordResetToken_key" ON "User"("passwordResetToken");
