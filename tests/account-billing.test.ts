import assert from "node:assert/strict"
import { test } from "node:test"

import { cancelAccountSubscriptions } from "../lib/account-billing"

test("deletion cancels paid renewals and remaining paid access, including scheduled plans", async () => {
  const canceled: string[] = []
  await cancelAccountSubscriptions("owner", {
    getUserBillingSubscription: async (userId) => {
      assert.equal(userId, "owner")
      return {
        subscriptionItems: [
          { id: "free", status: "active", plan: { isDefault: true } },
          ...["active", "canceled", "upcoming", "past_due"].map((status) => ({
            id: status,
            status,
            plan: { isDefault: false },
          })),
          { id: "old", status: "ended", plan: { isDefault: false } },
        ],
      }
    },
    cancelSubscriptionItem: async (id, options) => {
      assert.deepEqual(options, { endNow: true })
      canceled.push(id)
    },
  })
  assert.deepEqual(canceled, ["active", "canceled", "upcoming", "past_due"])
})

test("an account without a subscription can be deleted; provider failures cannot be ignored", async () => {
  const provider = (error: unknown) => ({
    getUserBillingSubscription: async () => {
      throw error
    },
    cancelSubscriptionItem: async () =>
      assert.fail("No subscription was loaded"),
  })
  await cancelAccountSubscriptions("new-owner", provider({ status: 404 }))
  const outage = new Error("provider unavailable")
  await assert.rejects(
    cancelAccountSubscriptions("owner", provider(outage)),
    (e) => e === outage
  )
})

test("cancellation failures stop deletion and retries skip subscriptions already ended", async () => {
  let ended = false
  let attempts = 0
  const provider = {
    getUserBillingSubscription: async () => ({
      subscriptionItems: [
        {
          id: "paid",
          status: ended ? "ended" : "active",
          plan: { isDefault: false },
        },
      ],
    }),
    cancelSubscriptionItem: async () => {
      attempts++
      if (attempts === 1) throw new Error("cancel unavailable")
      ended = true
    },
  }
  await assert.rejects(
    cancelAccountSubscriptions("owner", provider),
    /cancel unavailable/
  )
  await cancelAccountSubscriptions("owner", provider)
  await cancelAccountSubscriptions("owner", provider)
  assert.equal(attempts, 2)
})
