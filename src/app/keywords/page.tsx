"use client";

import { useCallback, useEffect, useState } from "react";
import { Keyword, Segment, TrackingSettings } from "@/types";

export default function KeywordsPage() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [segmentId, setSegmentId] = useState("");
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [settings, setSettings] = useState<TrackingSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/segments")
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setSegments(data));
  }, []);

  const load = useCallback(async () => {
    if (!segmentId) {
      setKeywords([]);
      setSettings(null);
      return;
    }
    const [kw, ts] = await Promise.all([
      fetch(`/api/keywords?segment_id=${segmentId}`).then((r) => r.json()),
      fetch(`/api/tracking-settings?segment_id=${segmentId}`).then((r) => r.json()),
    ]);
    if (Array.isArray(kw)) setKeywords(kw);
    if (ts && !ts.error) setSettings(ts);
  }, [segmentId]);

  useEffect(() => {
    load();
    setSuggestions([]);
    setSelected(new Set());
  }, [load]);

  async function generate() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/keywords/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segment_id: segmentId }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "生成に失敗しました");
      return;
    }
    const existing = new Set(keywords.map((k) => k.keyword));
    const fresh = (data.keywords as string[]).filter((k) => !existing.has(k));
    setSuggestions(fresh);
    setSelected(new Set(fresh));
  }

  async function saveSelected() {
    setError("");
    const res = await fetch("/api/keywords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segment_id: segmentId, keywords: [...selected] }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "保存に失敗しました");
      return;
    }
    setMessage(`${data.inserted}件を保存しました`);
    setSuggestions([]);
    setSelected(new Set());
    load();
  }

  async function toggleTracked(kw: Keyword) {
    await fetch(`/api/keywords/${kw.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_tracked: !kw.is_tracked }),
    });
    load();
  }

  async function saveSettings() {
    if (!settings) return;
    setError("");
    const res = await fetch("/api/tracking-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "設定の保存に失敗しました");
      return;
    }
    setMessage("トラッキング設定を保存しました");
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-semibold">キーワード管理</h1>
        <select
          value={segmentId}
          onChange={(e) => setSegmentId(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white"
        >
          <option value="">セグメントを選択</option>
          {segments.map((seg) => (
            <option key={seg.id} value={seg.id}>
              {seg.name}
            </option>
          ))}
        </select>
        {segmentId && (
          <button
            onClick={generate}
            disabled={loading}
            className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm disabled:opacity-40"
          >
            {loading ? "生成中..." : "Claudeでキーワード案を生成"}
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-green-700">{message}</p>}

      {suggestions.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              生成された候補({selected.size}/{suggestions.length}件選択中)
            </h2>
            <button
              onClick={saveSelected}
              disabled={selected.size === 0}
              className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm disabled:opacity-40"
            >
              選択分を保存
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((kw) => (
              <button
                key={kw}
                onClick={() => {
                  const next = new Set(selected);
                  if (next.has(kw)) next.delete(kw);
                  else next.add(kw);
                  setSelected(next);
                }}
                className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                  selected.has(kw)
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-500 border-gray-200"
                }`}
              >
                {kw}
              </button>
            ))}
          </div>
        </div>
      )}

      {segmentId && settings && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-end gap-3 text-sm">
          <h2 className="text-sm font-semibold w-full">
            順位トラッキング設定(統計的に有意なサンプル量はここで調整)
          </h2>
          <label className="space-y-1">
            <span className="text-xs text-gray-500 block">取得間隔(時間)</span>
            <input
              type="number"
              value={settings.fetch_frequency_hours}
              onChange={(e) =>
                setSettings({ ...settings, fetch_frequency_hours: Number(e.target.value) })
              }
              className="w-24 border border-gray-200 rounded-lg px-3 py-1.5"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-gray-500 block">取得順位(上位N件)</span>
            <input
              type="number"
              value={settings.fetch_depth}
              onChange={(e) =>
                setSettings({ ...settings, fetch_depth: Number(e.target.value) })
              }
              className="w-24 border border-gray-200 rounded-lg px-3 py-1.5"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-gray-500 block">必要サンプル日数</span>
            <input
              type="number"
              value={settings.min_sample_days}
              onChange={(e) =>
                setSettings({ ...settings, min_sample_days: Number(e.target.value) })
              }
              className="w-24 border border-gray-200 rounded-lg px-3 py-1.5"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-gray-500 block">デバイス</span>
            <select
              value={settings.device}
              onChange={(e) => setSettings({ ...settings, device: e.target.value })}
              className="border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
            >
              <option value="desktop">desktop</option>
              <option value="mobile">mobile</option>
            </select>
          </label>
          <button
            onClick={saveSettings}
            className="px-3 py-1.5 border border-gray-300 rounded-lg"
          >
            設定を保存
          </button>
        </div>
      )}

      {segmentId && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="text-left px-4 py-2 font-medium">キーワード</th>
                <th className="text-left px-4 py-2 font-medium">順位計測</th>
              </tr>
            </thead>
            <tbody>
              {keywords.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-6 text-center text-gray-400">
                    キーワードが未登録です
                  </td>
                </tr>
              )}
              {keywords.map((kw) => (
                <tr key={kw.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">{kw.keyword}</td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => toggleTracked(kw)}
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        kw.is_tracked
                          ? "bg-green-50 text-green-700"
                          : "bg-gray-100 text-gray-400"
                      }`}
                    >
                      {kw.is_tracked ? "計測中" : "停止中"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
