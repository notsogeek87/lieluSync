import Link from "next/link";
import { AppShell } from "@/components/AppShell";

export default function NotFound() {
  return (
    <AppShell authed={false}>
      <div className="page-head">
        <h1>Page introuvable</h1>
        <p>Cette adresse n&apos;existe pas.</p>
      </div>
      <Link className="btn" href="/">Retour à l&apos;accueil</Link>
    </AppShell>
  );
}
