import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

// 特化先項目の一括登録。「名前」または「名前,業種コード」を1行1項目で受け取る
export async function POST(req: Request) {
  const body = await req.json();
  const databaseId: string | undefined = body.database_id;
  const lines: string[] = Array.isArray(body.items)
    ? body.items
    : String(body.text ?? "")
        .split("\n")
        .map((line: string) => line.trim())
        .filter(Boolean);

  if (!databaseId || lines.length === 0) {
    return NextResponse.json(
      { error: "database_id と items(または text)は必須です" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: existing, error: existingError } = await supabase
    .from("industries")
    .select("name")
    .eq("database_id", databaseId);
  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }
  const existingNames = new Set((existing ?? []).map((row) => row.name));

  const rows: { name: string; gbizinfo_code: string | null; database_id: string }[] = [];
  for (const line of lines) {
    const [name, code] = line.split(",").map((s: string) => s.trim());
    if (!name || existingNames.has(name)) continue;
    existingNames.add(name);
    rows.push({ name, gbizinfo_code: code || null, database_id: databaseId });
  }

  if (rows.length === 0) {
    return NextResponse.json({ inserted: 0, skipped: lines.length });
  }
  const { error } = await supabase.from("industries").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    inserted: rows.length,
    skipped: lines.length - rows.length,
  });
}
