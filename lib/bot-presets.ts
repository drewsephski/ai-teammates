import {
  BookOpenIcon,
  CalendarCheckIcon,
  ChartNoAxesCombinedIcon,
  FilePenLineIcon,
  GraduationCapIcon,
  SquareCodeIcon,
} from "lucide-react"

export const botPresets = [
  {
    id: "research",
    job: "Research assistant",
    label: "Research",
    icon: BookOpenIcon,
    description:
      "Explore a market, compare options, and turn reliable sources into a clear brief.",
    prompt:
      "Compare three competitors and summarize their positioning, with sources.",
    instructions:
      "Find reliable sources, summarize what they say, and cite every claim. Say so when the evidence is thin.",
  },
  {
    id: "code",
    job: "Code reviewer",
    label: "Code review",
    icon: SquareCodeIcon,
    description:
      "Get another set of eyes on bugs, security, and the details that make code maintainable.",
    prompt: "Review this change for edge cases and suggest concrete fixes.",
    instructions:
      "Review changes for bugs, security issues, and unclear code. Point to the exact lines and suggest a fix.",
  },
  {
    id: "writing",
    job: "Writing editor",
    label: "Writing",
    icon: FilePenLineIcon,
    description:
      "Shape a first draft, sharpen your message, and edit without losing your voice.",
    prompt: "Turn these rough notes into a concise launch announcement.",
    instructions:
      "Tighten prose without changing its voice. Explain each edit briefly and flag anything ambiguous.",
  },
  {
    id: "learning",
    job: "Tutor",
    label: "Learning",
    icon: GraduationCapIcon,
    description:
      "Work through a new subject with patient explanations, useful questions, and practice.",
    prompt: "Teach me the basics of SQL, then help me practice with examples.",
    instructions:
      "Teach step by step, check understanding with questions, and give hints before giving answers.",
  },
  {
    id: "planning",
    job: "Project planner",
    label: "Planning",
    icon: CalendarCheckIcon,
    description:
      "Break a big goal into practical steps, priorities, and dependencies you can act on.",
    prompt:
      "Break my product launch into milestones and flag the dependencies.",
    instructions:
      "Turn goals into practical plans with clear steps, priorities, and dependencies. Ask about constraints before proposing dates, and flag assumptions.",
  },
  {
    id: "data",
    job: "Data analyst",
    label: "Data analysis",
    icon: ChartNoAxesCombinedIcon,
    description:
      "Inspect your data, check the calculations, and find the story behind the numbers.",
    prompt: "Analyze this CSV for trends, missing values, and unusual changes.",
    instructions:
      "Analyze the data provided, check its quality, and explain findings with clear comparisons. Show calculations and distinguish evidence from assumptions. Never invent missing data.",
  },
] as const

export type BotPresetId = (typeof botPresets)[number]["id"]
