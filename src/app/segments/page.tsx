import { redirect } from "next/navigation";

// 旧URL互換: セグメント管理は企業セクションに統合
export default function SegmentsRedirect() {
  redirect("/companies/segments");
}
