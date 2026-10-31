import Link from "next/link";
import { Logo } from "./Logo";
import { Nav, TabBar } from "./Nav";

export function AppShell({ children, authed }: { children: React.ReactNode; authed: boolean }) {
  return (
    <div className="shell">
      <header className="topbar">
        <Link href={authed ? "/dashboard" : "/"} className="brand">
          <Logo />
          <span>Lielu Lists</span>
        </Link>
        {authed ? <Nav /> : null}
      </header>
      <main className="main" id="contenu">{children}</main>
      <footer className="footer">
        <p>Lielu Lists — Your TMDB lists in Stremio · Édité par Lielu</p>
        <p className="small">Ce produit utilise l&apos;API TMDB mais n&apos;est ni approuvé ni certifié par TMDB.</p>
      </footer>
      {authed ? <TabBar /> : null}
    </div>
  );
}
