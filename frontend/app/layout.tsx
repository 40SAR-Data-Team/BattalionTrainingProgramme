import type { Metadata } from "next";
import { Barlow, Barlow_Semi_Condensed } from "next/font/google";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { getSettings } from "@trng/backend/common/settings";
import { isSignedIn, SESSION_COOKIE } from "@trng/backend/common/session";
import { TabGuard } from "@/components/common/TabSession";
import { SettingsProvider } from "@/components/common/SettingsContext";
import "./globals.css";

const barlow = Barlow({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-barlow" });
const condensed = Barlow_Semi_Condensed({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-barlow-condensed" });

/** Page title uses the configured unit name. */
export async function generateMetadata(): Promise<Metadata> {
  const { unitName } = await getSettings();
  return { title: `${unitName} Training Programme`, description: `${unitName} company training programmes, synced with Google Calendar` };
}

/** Root layout: fonts, theme, and (signed in only) the current settings for client components.
 * The login page is public, so it must not receive the settings payload. */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  await connection(); // settings are live and every page is behind sign-in: never prerender
  const signedIn = await isSignedIn((await cookies()).get(SESSION_COOKIE)?.value);
  return (
    <html lang="en" className={`h-full antialiased ${barlow.variable} ${condensed.variable}`}>
      <body className="stripes flex min-h-full flex-col">
        {signedIn
          ? <SettingsProvider value={{ ...(await getSettings()), calendarOwner: "" }}><TabGuard />{children}</SettingsProvider>
          : children}
      </body>
    </html>
  );
}
