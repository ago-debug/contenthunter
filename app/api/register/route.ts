import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { randomSlugSuffix, slugifyCompanyName } from "@/lib/company-slug";
import { FREE_PLAN } from "@/lib/plan-limits";
import { getPublicAppBaseUrl } from "@/lib/app-base-url";
import { isMailConfigured, sendTransactionalMail } from "@/lib/mail";

/**
 * Self-service: crea Company (piano free, in attesa approvazione) + primo utente admin di quell’azienda.
 * L’accesso è consentito solo dopo che un admin globale imposta onboardingStatus = active su Company.
 */
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const emailRaw = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        const password = typeof body.password === "string" ? body.password : "";
        const name = typeof body.name === "string" ? body.name.trim() : "";
        const companyName = typeof body.companyName === "string" ? body.companyName.trim() : "";

        if (!emailRaw || !password) {
            return NextResponse.json({ message: "Email e password sono obbligatori" }, { status: 400 });
        }
        if (password.length < 8) {
            return NextResponse.json({ message: "La password deve avere almeno 8 caratteri" }, { status: 400 });
        }
        if (!companyName) {
            return NextResponse.json({ message: "Il nome del workspace / azienda è obbligatorio" }, { status: 400 });
        }

        const existingUser = await prisma.user.findUnique({ where: { email: emailRaw } });
        if (existingUser) {
            return NextResponse.json({ message: "Esiste già un account con questa email" }, { status: 400 });
        }

        let slugBase = slugifyCompanyName(companyName);
        if (!slugBase) slugBase = "workspace";

        const hashedPassword = await bcrypt.hash(password, 10);
        const mailWillSend = isMailConfigured();
        const verifyToken = mailWillSend ? randomBytes(32).toString("base64url") : null;
        const verifyExpires = mailWillSend ? new Date(Date.now() + 48 * 3600 * 1000) : null;

        const result = await prisma.$transaction(async (tx) => {
            let slug = slugBase;
            let company;
            try {
                company = await tx.company.create({
                    data: {
                        name: companyName,
                        slug,
                        subscriptionPlan: FREE_PLAN,
                        onboardingStatus: "pending_approval",
                        maxProducts: 100,
                        maxUsers: 2,
                        featureSeoGeo: false,
                        featurePdfSuite: false,
                    },
                });
            } catch (e: any) {
                if (e?.code === "P2002") {
                    slug = `${slugBase}-${randomSlugSuffix(6)}`;
                    company = await tx.company.create({
                        data: {
                            name: companyName,
                            slug,
                            subscriptionPlan: FREE_PLAN,
                            onboardingStatus: "pending_approval",
                            maxProducts: 100,
                            maxUsers: 2,
                            featureSeoGeo: false,
                            featurePdfSuite: false,
                        },
                    });
                } else {
                    throw e;
                }
            }

            const user = await tx.user.create({
                data: {
                    email: emailRaw,
                    password: hashedPassword,
                    name: name || null,
                    companyId: company.id,
                    isActive: true,
                    ...(mailWillSend && verifyToken && verifyExpires
                        ? {
                              emailVerificationToken: verifyToken,
                              emailVerificationExpires: verifyExpires,
                          }
                        : {
                              emailVerifiedAt: new Date(),
                              emailVerificationToken: null,
                              emailVerificationExpires: null,
                          }),
                },
            });

            return { company, user };
        });

        if (mailWillSend && verifyToken) {
            const verifyUrl = `${getPublicAppBaseUrl()}/api/auth/verify-email?token=${encodeURIComponent(verifyToken)}`;
            try {
                await sendTransactionalMail({
                    to: emailRaw,
                    subject: "Conferma la tua email — Iris",
                    text: `Ciao,\n\nconferma il tuo indirizzo email aprendo questo link (valido 48 ore):\n\n${verifyUrl}\n\nDopo la conferma, quando il workspace sarà approvato dall'amministratore, potrai accedere.\n`,
                    html: `<p>Ciao,</p><p>conferma il tuo indirizzo email con il pulsante qui sotto (link valido 48 ore).</p><p><a href="${verifyUrl}">Conferma email</a></p><p>Oppure copia questo URL nel browser:<br/><code>${verifyUrl}</code></p>`,
                });
            } catch (mailErr) {
                console.error("[register] invio email verifica fallito:", mailErr);
            }
        }

        return NextResponse.json(
            {
                message: mailWillSend
                    ? "Registrazione ricevuta. Controlla la posta per confermare l’email; quando il workspace sarà approvato potrai accedere."
                    : "Registrazione ricevuta. Email considerata verificata (SMTP non configurato). Quando il workspace sarà approvato potrai accedere.",
                userId: result.user.id,
                companyId: result.company.id,
                verifyEmailConfigured: mailWillSend,
            },
            { status: 201 }
        );
    } catch (error) {
        console.error("Error creating registration:", error);
        return NextResponse.json(
            { message: "Errore durante la registrazione. Riprova più tardi." },
            { status: 500 }
        );
    }
}
