import assert from "node:assert/strict"
import test from "node:test"
import { appIntent, appIntentInstructions } from "../lib/app-intent"

const toolkits = (text: string) =>
  appIntent(text)?.apps.map((app) => app.toolkit)

test("email requests without a service offer Gmail and Outlook", () => {
  for (const text of [
    "email this person",
    "Email them the notes from today",
    "can you email Sam about the invoice?",
    "email sam",
    "send an email to my landlord",
    "Draft a quick email to the team",
    "reply to that email from Jordan",
    "check my inbox",
    "any new emails?",
    "email jo@example.com the deck",
  ])
    assert.deepEqual(toolkits(text), ["gmail", "outlook"], text)
})

test("a named service offers only that app", () => {
  assert.deepEqual(toolkits("send it from my Outlook"), ["outlook"])
  assert.deepEqual(toolkits("search my gmail for receipts"), ["gmail"])
  assert.deepEqual(toolkits("post this in Slack"), ["slack"])
  assert.deepEqual(toolkits("copy my Gmail receipts into Google Sheets"), [
    "gmail",
    "googlesheets",
  ])
})

test("calendar and spreadsheet requests offer their common apps", () => {
  for (const text of [
    "what's on my calendar tomorrow",
    "schedule a meeting with Priya on Friday",
    "am I free at 3?",
    "send a calendar invite to the team",
  ])
    assert.deepEqual(toolkits(text), ["googlecalendar", "outlook"], text)
  assert.deepEqual(toolkits("put these numbers in a spreadsheet"), [
    "googlesheets",
    "excel",
  ])
})

test("passing mentions and other work need no app", () => {
  for (const text of [
    "",
    "my email address is drew@example.com",
    "what's a good email signature?",
    "write a poem about the ocean",
    "how do I make my emails sound friendlier", // advice, not account work
    "schedule this every morning at 8",
    "I've connected it",
  ])
    assert.equal(appIntent(text), undefined, text)
})

test("instructions name the cards, and stay quiet once an app is connected", () => {
  const intent = appIntent("email this person")
  const text = appIntentInstructions(intent, new Set(["slack"]))
  assert.ok(text)
  assert.match(text, /askUser with appConnections/)
  assert.match(text, /"toolkit":"gmail"/)
  assert.match(text, /"toolkit":"outlook"/)
  assert.match(text, /Don't call findApps or searchAppTools first/)
  assert.equal(appIntentInstructions(intent, new Set(["outlook"])), undefined)
  assert.equal(appIntentInstructions(undefined, new Set()), undefined)
})
