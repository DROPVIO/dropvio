import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import AppShell from "@/components/AppShell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dropvio",
  description: "Trouve et lance tes produits gagnants en dropshipping",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Résolus par i18n/request.ts à partir de l'en-tête posé par middleware.ts (cookie
  // NEXT_LOCALE > Accept-Language > profils.langue si connecté) — voir lib/locale.ts.
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // data-theme est posé par le script inline ci-dessous avant hydratation (voir
      // lib/theme.ts) — React s'attend à ne pas le trouver dans le HTML serveur, ce qui
      // déclencherait un avertissement de mismatch sans rapport avec un vrai bug.
      suppressHydrationWarning
    >
      <head>
        {/* Pose data-theme avant tout rendu React — évite un flash du mauvais thème le
            temps que le JS de l'app se charge. Doit rester en JS pur (pas d'import),
            la clé localStorage est dupliquée depuis lib/theme.ts (THEME_STORAGE_KEY). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('dropvio-theme');document.documentElement.setAttribute('data-theme',t==='light'?'light':'dark')}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full bg-[var(--bg)]">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AppShell>{children}</AppShell>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
