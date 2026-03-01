"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import type { AnalysisResult } from "@/types";

type Message = {
  role: "user" | "assistant";
  content: string;
  result?: AnalysisResult;
  similarSeeds?: { id: string; raw_input: string }[];
  pendingInput?: string;
};

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function postToApi(userMessage: string, force = false) {
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: userMessage, force }),
      });

      const data = await res.json();

      if (res.status === 409) {
        // 類似タネあり
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "似たタネがすでにあります。それでも追加しますか？",
            similarSeeds: data.similar,
            pendingInput: userMessage,
          },
        ]);
        return;
      }

      if (!res.ok) throw new Error(data.error);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "分析完了。タネとして保存しました。",
          result: data,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `エラー: ${err instanceof Error ? err.message : "不明なエラー"}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    await postToApi(userMessage);
  }

  async function handleForceAdd(pendingInput: string) {
    setMessages((prev) => [...prev, { role: "user", content: "（それでも追加）" }]);
    await postToApi(pendingInput, true);
  }

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto px-4">
      <header className="flex items-center justify-between py-4 border-b border-gray-200">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">idea seeds</h1>
          <p className="text-xs text-gray-400">気づきをタネとして蓄積する</p>
        </div>
        <Link
          href="/seeds"
          className="text-sm text-gray-400 hover:text-gray-900 underline underline-offset-2 transition-colors"
        >
          タネ一覧
        </Link>
      </header>

      <div className="flex-1 overflow-y-auto py-6 space-y-6">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-24">
            <p className="text-base">最近気になるトレンドや気づきを入力してください</p>
            <p className="text-sm mt-2 text-gray-300">
              例：「最近ペットを家族のように思っている家が増えてきたよね」
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div className={`max-w-3xl w-full ${msg.role === "user" ? "flex justify-end" : ""}`}>
              {msg.role === "user" ? (
                <div className="bg-gray-900 text-white px-4 py-3 rounded-2xl rounded-tr-sm max-w-xl text-sm leading-relaxed">
                  {msg.content}
                </div>
              ) : (
                <div className="space-y-4 w-full">
                  <p className="text-sm text-gray-400">{msg.content}</p>
                  {msg.similarSeeds && msg.pendingInput && (
                    <SimilarWarning
                      similarSeeds={msg.similarSeeds}
                      onForceAdd={() => handleForceAdd(msg.pendingInput!)}
                    />
                  )}
                  {msg.result && <AnalysisCard result={msg.result} />}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="text-sm text-gray-400 animate-pulse">分析中...</div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="py-4 border-t border-gray-200">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="気づきや観察を自由に入力してください..."
            rows={2}
            className="flex-1 resize-none border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-5 py-3 bg-gray-900 text-white rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-gray-700 transition-colors"
          >
            送信
          </button>
        </div>
        <p className="text-xs text-gray-300 mt-1">Shift+Enter で送信 / Enter で改行</p>
      </form>
    </div>
  );
}

function SimilarWarning({
  similarSeeds,
  onForceAdd,
}: {
  similarSeeds: { id: string; raw_input: string }[];
  onForceAdd: () => void;
}) {
  return (
    <div className="border border-amber-200 bg-amber-50 rounded-2xl p-4">
      <p className="text-xs font-medium text-amber-700 mb-2">以下のタネと似ています：</p>
      <ul className="space-y-1 mb-3">
        {similarSeeds.map((s) => (
          <li key={s.id} className="text-xs text-amber-800 flex gap-1">
            <span className="text-amber-400">—</span>
            {s.raw_input}
          </li>
        ))}
      </ul>
      <button
        onClick={onForceAdd}
        className="text-xs px-3 py-1.5 bg-amber-700 text-white rounded-lg hover:bg-amber-800 transition-colors"
      >
        それでも追加する
      </button>
    </div>
  );
}

function AnalysisCard({ result }: { result: AnalysisResult }) {
  const { seed, combinations } = result;
  const [tab, setTab] = useState<"service" | "pest" | "jobs" | "combinations">("service");

  return (
    <div className="border border-gray-200 rounded-2xl bg-white overflow-hidden shadow-sm">
      <div className="flex border-b border-gray-100">
        {(
          [
            { key: "service", label: "サービス案" },
            { key: "pest", label: "PEST" },
            { key: "jobs", label: "Jobs" },
            { key: "combinations", label: "組み合わせ" },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-xs font-medium transition-colors border-b-2 ${
              tab === key
                ? "text-gray-900 border-gray-900"
                : "text-gray-400 border-transparent hover:text-gray-600"
            }`}
          >
            {label}
            {key === "combinations" && combinations.length > 0 && (
              <span className="ml-1 bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full text-xs">
                {combinations.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="p-4">
        {tab === "service" && seed.service_ideas && (
          <div className="space-y-3">
            {seed.service_ideas.map((s, i) => (
              <div key={i} className="border border-gray-100 rounded-xl p-3 hover:border-gray-200 transition-colors">
                <div className="font-medium text-sm text-gray-900">{s.name}</div>
                <div className="text-xs text-gray-600 mt-1 leading-relaxed">{s.description}</div>
                <div className="text-xs text-gray-400 mt-1.5">対象: {s.target}</div>
              </div>
            ))}
            {seed.tags && (
              <div className="flex flex-wrap gap-1 mt-3">
                {seed.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "pest" && seed.pest && (
          <div className="space-y-2.5 text-xs">
            {(
              [
                { key: "political", label: "P（政治）" },
                { key: "economic", label: "E（経済）" },
                { key: "social", label: "S（社会）" },
                { key: "technological", label: "T（技術）" },
              ] as const
            ).map(({ key, label }) => (
              <div key={key} className="flex gap-3">
                <span className="font-semibold text-gray-400 w-16 flex-shrink-0">{label}</span>
                <span className="text-gray-700 leading-relaxed">{seed.pest![key]}</span>
              </div>
            ))}
          </div>
        )}

        {tab === "jobs" && seed.jobs && (
          <div className="space-y-4 text-xs">
            {(
              [
                { key: "functional", label: "機能的ジョブ" },
                { key: "emotional", label: "感情的ジョブ" },
                { key: "social", label: "社会的ジョブ" },
              ] as const
            ).map(({ key, label }) => (
              <div key={key}>
                <div className="font-semibold text-gray-400 mb-1.5">{label}</div>
                <ul className="space-y-1">
                  {seed.jobs![key].map((job, i) => (
                    <li key={i} className="text-gray-700 flex gap-2">
                      <span className="text-gray-300 flex-shrink-0">—</span>
                      {job}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {tab === "combinations" && (
          <div className="space-y-3">
            {combinations.length === 0 ? (
              <p className="text-xs text-gray-400">
                まだ組み合わせられるタネがありません。タネを増やしていくと提案が出ます。
              </p>
            ) : (
              combinations.map((c, i) => (
                <div key={i} className="border border-gray-100 rounded-xl p-3">
                  <div className="text-xs text-gray-400 mb-1.5">× {c.related_seed_input}</div>
                  <div className="text-sm text-gray-800 leading-relaxed">{c.idea}</div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
