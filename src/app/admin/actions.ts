"use server";

import { redirect } from "next/navigation";

import {
  clearAdminSession,
  getAdminConfiguration,
  setAdminSession,
  verifyAdminPassword,
} from "./auth";

function slowFailedAttempt() {
  return new Promise((resolve) => setTimeout(resolve, 650));
}

export async function unlockAdmin(formData: FormData) {
  const configuration = getAdminConfiguration();
  if (configuration.state !== "ready") {
    redirect("/admin?error=configuration");
  }

  const submittedPassword = formData.get("password");
  if (
    typeof submittedPassword !== "string" ||
    !verifyAdminPassword(submittedPassword, configuration)
  ) {
    await slowFailedAttempt();
    redirect("/admin?error=invalid");
  }

  await setAdminSession(configuration);
  redirect("/admin");
}

export async function lockAdmin() {
  await clearAdminSession();
  redirect("/admin");
}
