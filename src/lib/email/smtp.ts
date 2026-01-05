import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST!,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: false,
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
});

export async function sendOtpEmail(params: { to: string; code: string; ttlMinutes: number }) {
    await transporter.sendMail({
        from: process.env.SMTP_FROM!,
        to: params.to,
        subject: "Код подтверждения",
        text: `Код: ${params.code}\nДействует: ${params.ttlMinutes} минут.`,
    });
}
