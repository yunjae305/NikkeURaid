"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="centered-state">
      <p className="eyebrow">잠시 문제가 생겼어요</p>
      <h1>화면을 불러오지 못했습니다.</h1>
      <p>잠시 뒤 다시 시도해 주세요.</p>
      <button className="primary-button compact-button" type="button" onClick={reset}>
        다시 시도
      </button>
    </main>
  );
}
