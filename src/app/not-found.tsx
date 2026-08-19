import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="centered-state">
      <p className="eyebrow">404</p>
      <h1>찾을 수 없는 유니온입니다.</h1>
      <p>서버와 유니온 ID를 다시 확인해 주세요.</p>
      <Link className="primary-button compact-button" href="/">
        다시 검색
      </Link>
    </main>
  );
}
