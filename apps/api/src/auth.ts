import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";
import { emailFingerprint } from "./crypt.js";
import { MIN_PASSWORD_LENGTH } from "../../../packages/security/password.js";
import { db, schema } from "./db/index.js";
import { env } from "./env.js";
import { resetMail, sendMail, welcomeMail } from "./mail.js";
import { clustered, hit } from "./shared.js";

export const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

export const auth = betterAuth({
  // La web y el API se sirven desde el mismo origen (en desarrollo, vía el proxy de Vite)
  baseURL: env.APP_URL,
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.APP_URL],
  // IP real de quien usa la app, para el límite de intentos y la sesión. Sale de un encabezado que el proxy de
  // adelante pisa siempre (CLIENT_IP_HEADER, ver docs/DEPLOY.md). Por defecto Better Auth usaba X-Forwarded-For,
  // que puede mandar cualquiera: con eso el límite de intentos se salteaba.
  advanced: { ipAddress: { ipAddressHeaders: [env.CLIENT_IP_HEADER] } },
  // Límite de intentos (activo en producción). Better Auth trae 3 cada 10 s en login, unos 1000 por hora:
  // muy poco para frenar a quien prueba contraseñas.
  rateLimit: {
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 5 * 60, max: 10 },
      "/sign-up/email": { window: 60 * 60, max: 5 },
      "/request-password-reset": { window: 60 * 60, max: 3 },
      "/reset-password": { window: 60 * 60, max: 10 },
    },
    // Con varios procesos del API, los intentos se cuentan en todos juntos (ver shared.ts). Si no, cada proceso
    // llevaría su propia cuenta y alcanzaría con repartir los intentos para multiplicar el límite.
    ...(clustered
      ? { customStorage: { consume: async (key: string, rule: { window: number; max: number }) => {
          const allowed = await hit(`auth:${key}`, rule.max, rule.window * 1000);
          return { allowed, retryAfter: allowed ? null : rule.window };
        } } }
      : {}),
  },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    resetPasswordTokenExpiresIn: 60 * 60,
    // Al cambiar la contraseña se cierran las demás sesiones abiertas
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      void sendMail(resetMail(user.email, url));
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const [restricted] = await db.select({ fingerprint: schema.restrictedEmail.fingerprint }).from(schema.restrictedEmail)
            .where(eq(schema.restrictedEmail.fingerprint, emailFingerprint(user.email))).limit(1);
          if (restricted) throw new APIError("FORBIDDEN", { message: "No se pudo crear la cuenta." });
        },
        // Mail de bienvenida, también para quien entra con Google. No se espera: el registro sigue aunque falle.
        after: async (user) => {
          void sendMail(welcomeMail(user.email, user.name));
        },
      },
    },
  },
  socialProviders: googleEnabled
    ? { google: { clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET! } }
    : {},
});

export type AuthUser = typeof auth.$Infer.Session.user;
