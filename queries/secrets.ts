import { auth } from "@clerk/nextjs/server"

import { listSecrets } from "@/services/secrets"

// Names, labels and dates only: values never leave the server
export async function getWorkspaceSecrets() {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  return listSecrets(userId)
}
