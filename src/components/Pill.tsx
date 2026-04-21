"use client";

import React from "react";

// Cycle of palette colors used anywhere we need more pills than a fixed toggle.
export const PILL_COLORS: { bg: string; hover: string }[] = [
  { bg: "#517d19", hover: "#3c5e13" }, // wood
  { bg: "#4fa6eb", hover: "#2770a8" }, // blue
  { bg: "#f0ad00", hover: "#c98a00" }, // wheat
  { bg: "#9c4300", hover: "#6f2f00" }, // brick
  { bg: "#7b6f83", hover: "#594e61" }, // ore
];

export function pillColorAt(i: number) {
  return PILL_COLORS[i % PILL_COLORS.length];
}

export function Pill({
  active,
  color,
  onClick,
  children,
  className = "",
  title,
}: {
  active?: boolean;
  color: { bg: string; hover: string };
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  const style = {
    ["--pill-bg"]: color.bg,
    ["--pill-hover"]: color.hover,
  } as React.CSSProperties;
  return (
    <button
      onClick={onClick}
      title={title}
      className={`pill ${active === false ? "pill-ghost" : ""} ${className}`}
      style={style}
      type="button"
    >
      {children}
    </button>
  );
}
