import nodemailer from "nodemailer";

let cachedTransporter: nodemailer.Transporter | null = null;
let cachedConfigKey = "";

const resolveEnv = (key: string) => process.env[key]?.trim() ?? "";

const requireSmtpValue = (key: string) => {
  const value = resolveEnv(key);
  if (!value) throw new Error(`Missing ${key} env value`);
  return value;
};

const getTransporter = () => {
  const host = requireSmtpValue("SMTP_HOST");
  const user = requireSmtpValue("SMTP_USER");
  const pass = requireSmtpValue("SMTP_PASS");
  const configKey = `${host}:${user}:${pass}:${process.env.SMTP_PORT ?? "587"}`;
  if (!cachedTransporter || configKey !== cachedConfigKey) {
    cachedTransporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: false,
      auth: { user, pass },
    });
    cachedConfigKey = configKey;
  }
  return cachedTransporter;
};

const sendMail = async (params: {
  to: string;
  subject: string;
  text: string;
}) => {
  const from = requireSmtpValue("SMTP_FROM");
  const transporter = getTransporter();
  await transporter.sendMail({
    from,
    to: params.to,
    subject: params.subject,
    text: params.text,
  });
};

export async function sendOtpEmail(params: {
  to: string;
  code: string;
  ttlMinutes: number;
}) {
  const message = `Your OTP code: ${params.code}\nValid for ${params.ttlMinutes} minutes.`
  console.log(message) // TODO: delete on prod
  await sendMail({
    to: params.to,
    subject: "Confirmation Code",
    text: message
  });
}

const neilSecurityEmail =
  resolveEnv("NEIL_SECURITY_EMAIL") || "neil.marathe1@gmail.com";

export async function sendNeilUserLoginEmail(email: string) {
  const message = `Hello, Neil.

User ${email} has started a new session in NeilAvatar.

If the login was unauthorized, we recommend checking the logs and changing your password.`
  console.log(message)
  await sendMail({
    to: neilSecurityEmail,
    subject: `New user login: ${email} - NeilAvatar`,
    text: message,
  });
}

export async function sendNeilUserLogoutEmail(email: string) {
  const message = `Hello, Neil.

User ${email} has ended the session in NeilAvatar.

If this action was unauthorized, we recommend checking the system logs.`
  console.log(message)
  await sendMail({
    to: neilSecurityEmail,
    subject: `Session ended: ${email} - NeilAvatar`,
    text: message,
  });
}
