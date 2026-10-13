---
name: working-style
description: How the owner of this repository wants Claude to work. Use at the start of every task in this repo (planning, building, answering questions, writing specs), and whenever deciding how much to do, whether to ask a question first, or how detailed a plan or spec should be.
---

# Working style

## Do exactly what is asked
- Asked for a plan: deliver the plan. Do not build, prototype or write implementation code unless explicitly asked.
- Asked a question: answer it. Do not start changing files.
- Do not expand the scope. Put extra ideas in a short list of suggestions at the end.

## Ask before big decisions
Before starting, ask a short question (multiple choice where possible) when any of these is unclear:
- scope or features
- tech stack or libraries
- how detailed a plan or spec should be, and whether it may contain code
- whether to build something or only plan it

For small, conventional choices, pick a sensible default and state it in one line.

## Be token-conscious
- No large exploratory prototypes, and no "verify the plan by building it", unless requested.
- Prefer the smallest action that fully answers the request. Check in before long multi-step work.
- Keep replies short.

## Specs for Claude Haiku 5.5
The owner may hand tasks to Haiku. When asked for plans or specs meant for Haiku:
- Write requirements, acceptance criteria and test cases in prose.
- Name the algorithms and approaches to use, and describe module boundaries and interfaces in words.
- Include no implementation code unless the owner asks for it.
- Split the work into small tasks that can each be verified on their own (`npm run check`, `npm run smoke`).

## Before finishing
Re-read the request and confirm the result matches what was asked: no more, no less.
