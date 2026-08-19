"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { requestGuildLookup } from "@/lib/guild-lookup-client";
import type { AreaId } from "@/lib/types";

export function GuildLookupStart({
  areaId,
  areaName,
  guildId,
}: {
  areaId: AreaId;
  areaName: string;
  guildId: string;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const submitLock = useRef(false);

  async function startLookup() {
    if (submitLock.current) return;
    setError("");
    submitLock.current = true;
    setIsSubmitting(true);

    try {
      const result = await requestGuildLookup(areaId, guildId);
      router.replace(result.href);
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "조회 요청을 처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
      );
      submitLock.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <main className="centered-state lookup-start-state">
      <p className="eyebrow">FIRST LOOKUP</p>
      <h1>아직 수집되지 않은 유니온입니다.</h1>
      <p>
        {areaName} 서버 · ID {guildId}
        <br />
        조회를 시작하면 기록을 모은 뒤 이 주소에서 자동으로 보여 드립니다.
      </p>
      <div className="lookup-actions">
        <button
          className="primary-button"
          type="button"
          aria-busy={isSubmitting}
          disabled={isSubmitting}
          onClick={startLookup}
        >
          {isSubmitting ? <span className="submit-spinner" aria-hidden="true" /> : null}
          {isSubmitting ? "조회 요청 중" : "조회 시작"}
        </button>
        <Link className="secondary-button" href="/">
          다른 ID 입력
        </Link>
      </div>
      {error ? (
        <p className="lookup-error" role="alert">
          {error}
        </p>
      ) : null}
    </main>
  );
}
