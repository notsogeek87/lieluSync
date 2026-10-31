import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { StremioManager } from "@/components/StremioManager";
import { requireOverview } from "@/lib/account/page-guard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mes addons Stremio" };

export default async function StremioAddons() {
  const o = await requireOverview();
  return (
    <AppShell authed>
      <div className="page-head">
        <h1>Mes addons Stremio</h1>
        <p>Installez Lielu Lists en tête pour voir vos listes en premier sur l&apos;accueil, réordonnez ou retirez vos addons. Les changements s&apos;appliquent à tous vos appareils Stremio, Android TV compris.</p>
      </div>
      <StremioManager manifestUrl={o.install.manifestUrl} />
      <p className="small muted" style={{ marginTop: 24 }}>
        <Link href="/install">← Retour à l&apos;installation</Link>
      </p>
    </AppShell>
  );
}
