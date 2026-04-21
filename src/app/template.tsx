"use client";

// template.tsx remounts on every navigation (unlike layout.tsx),
// so this gives us a fresh entry animation each time the user moves between pages.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
