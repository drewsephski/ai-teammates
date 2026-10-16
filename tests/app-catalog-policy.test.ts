import assert from "node:assert/strict"
import test from "node:test"

import {
  appCatalogEntry,
  appConnectionState,
  httpsLogo,
  isConnectable,
} from "../lib/app-catalog-policy"

const none = { projectConfigured: false }
const sheets = { toolkit: "googlesheets", name: "Google Sheets" }

test("connectable through managed auth, no auth or the project's own config", () => {
  assert.equal(isConnectable({ ...none, managedSchemes: ["OAUTH2"] }), true)
  assert.equal(isConnectable({ ...none, noAuth: true }), true)
  assert.equal(isConnectable({ projectConfigured: true }), true)
  assert.equal(isConnectable({ ...none, managedSchemes: [] }), false)
  assert.equal(isConnectable(none), false)
})

test("a connected toolkit reads as connected and never blocked", () => {
  const entry = appCatalogEntry(
    sheets,
    { ...none, managedSchemes: ["OAUTH2"] },
    [{ toolkit: "googlesheets" }],
    "free"
  )
  assert.equal(entry.connected, true)
  assert.equal(entry.blockedByPlan, false)
})

test("the free plan blocks a second app but not the connected one", () => {
  const accounts = [{ toolkit: "gmail" }]
  const auth = { ...none, noAuth: true }
  assert.equal(
    appCatalogEntry(sheets, auth, accounts, "free").blockedByPlan,
    true
  )
  assert.equal(appCatalogEntry(sheets, auth, [], "free").blockedByPlan, false)
  assert.equal(
    appCatalogEntry({ toolkit: "gmail", name: "Gmail" }, auth, accounts, "free")
      .blockedByPlan,
    false
  )
})

test("a paid plan is never blocked", () => {
  const accounts = ["a", "b", "c"].map((toolkit) => ({ toolkit }))
  assert.equal(
    appCatalogEntry(sheets, { ...none, noAuth: true }, accounts, "paid")
      .blockedByPlan,
    false
  )
})

test("connection state: connect, planLimit, or an error written for the model", () => {
  const auth = { ...none, managedSchemes: ["OAUTH2"] }
  assert.equal(
    appConnectionState(appCatalogEntry(sheets, auth, [], "free")),
    "connect"
  )
  assert.equal(
    appConnectionState(
      appCatalogEntry(sheets, auth, [{ toolkit: "gmail" }], "free")
    ),
    "planLimit"
  )
  assert.throws(
    () =>
      appConnectionState(
        appCatalogEntry(sheets, auth, [{ toolkit: "googlesheets" }], "paid")
      ),
    /already connected/
  )
  assert.throws(
    () => appConnectionState(appCatalogEntry(sheets, none, [], "paid")),
    /Use the computer instead/
  )
})

test("only https logos are shown", () => {
  assert.equal(
    httpsLogo("https://logos.example/a.png"),
    "https://logos.example/a.png"
  )
  assert.equal(httpsLogo("http://logos.example/a.png"), null)
  assert.equal(httpsLogo("javascript:alert(1)"), null)
  assert.equal(httpsLogo(undefined), null)
})
