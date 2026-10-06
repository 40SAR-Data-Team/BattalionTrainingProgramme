import { secretSources } from "@trng/backend/secrets";
import { getSettings } from "@trng/backend/settings";
import { isAdmin } from "@trng/backend/session";
import { DEFAULT_SETTINGS } from "@trng/shared/settings";
import { NavBar } from "@/components/NavBar";
import { SettingsForm } from "@/components/SettingsForm";

/** Settings: anyone signed in can read; editing needs the admin key. Secrets are write-only. */
export default async function SettingsPage() {
  const admin = await isAdmin();
  const s = await getSettings();
  // The owner email and factory defaults reach the browser only once unlocked; clerks don't need them.
  const initial = admin ? s : { ...s, calendarOwner: "" };
  return (
    <div className="flex min-h-full flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-5">
        <SettingsForm key={String(admin)} initial={initial} defaults={admin ? DEFAULT_SETTINGS : initial} admin={admin}
          adminConfigured={!!process.env.ADMIN_KEY} secrets={await secretSources()} />
      </main>
    </div>
  );
}
