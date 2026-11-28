// Session cache ownership: every sign-out must route through endSession() so the
// previous account's react-query cache cannot render for the next login.

import { apiPost } from "./api";
import { queryClient } from "./queryClient";

export async function beginSession(): Promise<void> {
  await queryClient.invalidateQueries();
}

export async function endSession(): Promise<void> {
  try {
    await apiPost<{ ok: boolean }>("/auth/logout");
  } finally {
    queryClient.clear();
  }
}
