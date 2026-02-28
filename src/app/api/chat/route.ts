import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { ANALYSIS_SYSTEM_PROMPT, COMBINATION_PROMPT } from "@/lib/prompts";
import type { CombinationSuggestion } from "@/types";

export const dynamic = "force-dynamic";

const client = new Anthropic();

export async function POST(req: NextRequest) {
  const { input } = await req.json();

  if (!input?.trim()) {
    return NextResponse.json({ error: "入力が空です" }, { status: 400 });
  }

  // 1. Claudeでフレームワーク分析
  const analysisMessage = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: ANALYSIS_SYSTEM_PROMPT,
    messages: [{ role: "user", content: input }],
  });

  const analysisText =
    analysisMessage.content[0].type === "text"
      ? analysisMessage.content[0].text
      : "";

  let analysis;
  try {
    analysis = JSON.parse(analysisText);
  } catch {
    return NextResponse.json(
      { error: "分析結果のパースに失敗しました" },
      { status: 500 }
    );
  }

  const supabase = getSupabase();

  // 2. Supabaseに保存
  const { data: savedSeed, error: saveError } = await supabase
    .from("seeds")
    .insert({
      raw_input: input,
      pest: analysis.pest,
      jobs: analysis.jobs,
      frameworks: analysis.frameworks,
      service_ideas: analysis.service_ideas,
      tags: analysis.tags,
    })
    .select()
    .single();

  if (saveError) {
    return NextResponse.json(
      { error: "保存に失敗しました: " + saveError.message },
      { status: 500 }
    );
  }

  // 3. 既存タネを取得して組み合わせ提案
  const { data: existingSeeds } = await supabase
    .from("seeds")
    .select("id, raw_input")
    .neq("id", savedSeed.id)
    .order("created_at", { ascending: false })
    .limit(10);

  let combinations: CombinationSuggestion[] = [];

  if (existingSeeds && existingSeeds.length > 0) {
    const combinationMessage = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: COMBINATION_PROMPT(input, existingSeeds),
        },
      ],
    });

    const combinationText =
      combinationMessage.content[0].type === "text"
        ? combinationMessage.content[0].text
        : "[]";

    try {
      combinations = JSON.parse(combinationText);
    } catch {
      combinations = [];
    }
  }

  return NextResponse.json({
    seed: savedSeed,
    combinations,
  });
}
