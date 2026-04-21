import { NextResponse } from "next/server";
import getDb from "@/lib/db";

export async function GET() {
  const db = getDb();
  const players = db
    .prepare("SELECT * FROM players ORDER BY added_at ASC")
    .all();
  return NextResponse.json(players);
}

export async function POST(request: Request) {
  const { colonist_username, display_name } = await request.json();

  if (!colonist_username || typeof colonist_username !== "string") {
    return NextResponse.json(
      { error: "colonist_username is required" },
      { status: 400 }
    );
  }

  const db = getDb();
  try {
    db.prepare(
      "INSERT INTO players (colonist_username, display_name) VALUES (?, ?)"
    ).run(colonist_username.trim(), display_name?.trim() || colonist_username.trim());

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("UNIQUE")) {
      return NextResponse.json(
        { error: "Player already exists" },
        { status: 409 }
      );
    }
    throw e;
  }
}

export async function DELETE(request: Request) {
  const { colonist_username } = await request.json();
  const db = getDb();
  db.prepare("DELETE FROM players WHERE colonist_username = ?").run(
    colonist_username
  );
  return NextResponse.json({ success: true });
}
