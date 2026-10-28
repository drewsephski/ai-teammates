import assert from "node:assert/strict"
import { after, before, describe, it } from "node:test"

import {
  featureIds,
  summarizeFeatureVotes,
  voteShare,
} from "../lib/feature-votes"
import { startTestDatabase } from "./helpers/test-db"

const token = (char: string) => char.repeat(43)

describe("feature vote tally", () => {
  it("counts every option, ignores retired ids and keeps a valid choice", () => {
    const votes = summarizeFeatureVotes(
      [
        { featureId: "team", count: 3 },
        { featureId: "retired", count: 9 },
      ],
      "team"
    )
    assert.equal(votes.total, 3)
    assert.equal(votes.counts.team, 3)
    assert.deepEqual(Object.keys(votes.counts), featureIds)
    assert.equal(votes.choice, "team")
    assert.equal(summarizeFeatureVotes([], "retired").choice, null)
  })
  it("rounds shares and returns 0 before anyone votes", () => {
    assert.equal(voteShare(1, 3), 33)
    assert.equal(voteShare(2, 3), 67)
    assert.equal(voteShare(0, 0), 0)
  })
})

describe("feature vote persistence", () => {
  let database: Awaited<ReturnType<typeof startTestDatabase>>
  let service: typeof import("../services/feature-votes")
  before(async () => {
    database = await startTestDatabase()
    service = await import("../services/feature-votes")
  })
  after(async () => {
    await database?.stop()
  })

  it("gives each voter one vote that can move, and stores only a hash", async () => {
    await service.castFeatureVote(token("a"), { featureId: "team" })
    await service.castFeatureVote(token("b"), { featureId: "team" })
    const moved = await service.castFeatureVote(token("a"), {
      featureId: "extension",
    })
    assert.equal(moved.total, 2)
    assert.equal(moved.counts.team, 1)
    assert.equal(moved.counts.extension, 1)
    assert.equal(moved.choice, "extension")

    const result = await database.pool.query(
      "select voter_hash from feature_votes"
    )
    for (const row of result.rows) {
      assert.match(row.voter_hash, /^[0-9a-f]{64}$/)
      assert.notEqual(row.voter_hash, token("a"))
    }
  })
  it("reads the tally without a choice for a missing or malformed token", async () => {
    assert.equal((await service.getFeatureVotes(null)).choice, null)
    assert.equal((await service.getFeatureVotes("short")).choice, null)
    assert.equal((await service.getFeatureVotes(token("b"))).choice, "team")
  })
  it("rejects unknown options and malformed tokens before writing", async () => {
    await assert.rejects(
      service.castFeatureVote(token("c"), { featureId: "teleport" })
    )
    await assert.rejects(
      service.castFeatureVote("short", { featureId: "team" })
    )
    assert.equal((await service.getFeatureVotes(null)).total, 2)
  })
})
