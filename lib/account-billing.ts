type SubscriptionItem = {
  id: string
  status: string
  plan: { isDefault: boolean } | null
}

type BillingProvider = {
  getUserBillingSubscription: (
    userId: string
  ) => Promise<{ subscriptionItems: SubscriptionItem[] }>
  cancelSubscriptionItem: (
    id: string,
    options: { endNow: boolean }
  ) => Promise<unknown>
}

function missingSubscription(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    error.status === 404
  )
}

// Deletion ends access immediately. Cancel renewals before removing any account
// data, including plans already canceled for the end of their paid period.
export async function cancelAccountSubscriptions(
  userId: string,
  billing: BillingProvider
) {
  let subscription
  try {
    subscription = await billing.getUserBillingSubscription(userId)
  } catch (error) {
    // New accounts may not have a default subscription yet.
    if (missingSubscription(error)) return
    throw error
  }

  for (const item of subscription.subscriptionItems) {
    if (
      item.plan?.isDefault ||
      ["ended", "abandoned", "expired"].includes(item.status)
    )
      continue
    await billing.cancelSubscriptionItem(item.id, { endNow: true })
  }
}
