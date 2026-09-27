import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter, Plus_Jakarta_Sans } from "next/font/google";
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

// Polices de la landing et de /faq, auto-hébergées par next/font (plus aucune requête vers
// fonts.googleapis.com / fonts.gstatic.com). Mêmes graisses que l'ancien <link> : Plus
// Jakarta Sans 500/600/700/800, Inter 400/500/600.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
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
      className={`${geistSans.variable} ${geistMono.variable} ${jakarta.variable} ${inter.variable} h-full antialiased`}
      // Valeur de départ côté serveur = le défaut de l'app (clair), pour que le rendu sans
      // JS soit déjà correct ; le script inline ci-dessous la remplace par "dark" si
      // l'utilisateur a enregistré ce choix (voir lib/theme.ts). suppressHydrationWarning :
      // React ne doit pas traiter cette réécriture avant hydratation comme un vrai mismatch.
      data-theme="light"
      suppressHydrationWarning
    >
      <head>
        {/* Pose data-theme avant tout rendu React — évite un flash du mauvais thème le
            temps que le JS de l'app se charge. Doit rester en JS pur (pas d'import),
            la clé localStorage est dupliquée depuis lib/theme.ts (THEME_STORAGE_KEY).
            Le thème par défaut est "clair" : seule une préférence "dark" enregistrée
            bascule en sombre, et un stockage indisponible (navigation privée stricte)
            laisse bien le clair, pas le thème de secours du CSS. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `var t='light';try{if(localStorage.getItem('dropvio-theme')==='dark')t='dark'}catch(e){}document.documentElement.setAttribute('data-theme',t)`,
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
