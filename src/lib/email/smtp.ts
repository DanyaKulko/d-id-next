import nodemailer from "nodemailer";

const requireEnv = (key: string) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing ${key} env value`);
  }
  return value;
};

const transporter = nodemailer.createTransport({
  host: requireEnv("SMTP_HOST"),
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: false,
  auth: { user: requireEnv("SMTP_USER"), pass: requireEnv("SMTP_PASS") },
});

export async function sendOtpEmail(params: {
  to: string;
  code: string;
  ttlMinutes: number;
}) {
  await transporter.sendMail({
    from: requireEnv("SMTP_FROM"),
    to: params.to,
    subject: "Код подтверждения",
    text: `Код: ${params.code}\nДействует: ${params.ttlMinutes} минут.`,
  });
}
