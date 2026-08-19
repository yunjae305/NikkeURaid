import type { Metadata } from "next";

import { AdminScreen } from "@/components/admin/admin-screen";

import { getAdminConfiguration, hasValidAdminSession } from "./auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "운영자 도구",
  description: "NikkeURaid 수집 상태와 운영 설정을 확인하는 제한된 화면",
  robots: {
    follow: false,
    index: false,
  },
};

type AdminSearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

function scalar(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: AdminSearchParams;
}) {
  const configuration = getAdminConfiguration();

  if (configuration.state === "invalid") {
    return <AdminScreen state={{ kind: "setup", issues: configuration.issues }} />;
  }

  const [authenticated, query] = await Promise.all([
    hasValidAdminSession(configuration),
    searchParams,
  ]);

  if (!authenticated) {
    return (
      <AdminScreen
        state={{
          kind: "locked",
          invalidPassword: scalar(query.error) === "invalid",
        }}
      />
    );
  }

  return <AdminScreen state={{ kind: "unlocked" }} />;
}
