"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function Header() {
  const pathname = usePathname();
  const isLanding = pathname === "/";

  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 border-b border-card-border transition-shadow duration-200 ${
        scrolled ? "shadow-[0_6px_18px_-12px_rgba(0,0,0,0.25)]" : "shadow-[0_1px_0_rgba(0,0,0,0.04)]"
      }`}
      style={{ background: "#ffffff" }}
    >
      <div className="brand-stripe" />
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between flex-wrap gap-4">
        {isLanding ? (
          // Spacer so the nav pills stay right-aligned on the landing page
          <div />
        ) : (
          <Link href="/" className="flex items-center gap-3 text-4xl font-extrabold tracking-tight">
            <span>
              <span style={{ color: "#517d19" }}>catan</span>
              <span style={{ color: "#f0ad00" }}>tracker</span>
              <span style={{ color: "#4fa6eb" }}>.io</span>
            </span>
            <Image
              src="/images/logo.png"
              alt="Catan Tracker logo"
              width={234}
              height={54}
              priority
              unoptimized
              className="-translate-y-1"
            />
          </Link>
        )}
        <nav className="flex gap-2 text-sm font-extrabold">
          {[
            { href: "/player-data", label: "Statistics", bg: "#517d19", hoverBg: "#3c5e13" },
            { href: "/analysis", label: "Player Profiles", bg: "#4fa6eb", hoverBg: "#2770a8" },
            { href: "/records", label: "Record Book", bg: "#f0ad00", hoverBg: "#c98a00" },
            { href: "/calendar", label: "Calendar", bg: "#9c4300", hoverBg: "#6f2f00" },
          ].map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="nav-pill"
              style={
                {
                  ["--pill-bg" as string]: n.bg,
                  ["--pill-hover" as string]: n.hoverBg,
                } as React.CSSProperties
              }
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="brand-stripe" />
    </header>
  );
}
