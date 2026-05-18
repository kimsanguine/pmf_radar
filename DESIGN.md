---
version: "alpha"
name: "PMF Radar Lab"
description: "Habix.ai subdomain design system for a Korean PM training/product lab that turns Kakao-style customer inquiries into PMF evidence, visual maps, and hplan decisions."
colors:
  primary: "#1A1A2E"
  primaryContainer: "#0A0A14"
  ink: "#3D3830"
  inkSoft: "#5E564E"
  muted: "#7A7068"
  paper: "#FAF8F4"
  surface: "#F3F0EA"
  line: "#E8E3D8"
  accent: "#C8623A"
  accentContainer: "#F5E4DA"
  danger: "#C85A3A"
  success: "#4CAF82"
  weak: "#9A9288"
typography:
  display:
    fontFamily: "Noto Sans KR, Apple SD Gothic Neo, sans-serif"
    fontSize: "64px"
    fontWeight: 800
    lineHeight: 1.14
    letterSpacing: "0px"
  h1:
    fontFamily: "Noto Sans KR, Apple SD Gothic Neo, sans-serif"
    fontSize: "56px"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "0px"
  h2:
    fontFamily: "Noto Sans KR, Apple SD Gothic Neo, sans-serif"
    fontSize: "40px"
    fontWeight: 800
    lineHeight: 1.22
    letterSpacing: "0px"
  body:
    fontFamily: "Noto Sans KR, Apple SD Gothic Neo, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.7
    letterSpacing: "0px"
  label:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0px"
rounded:
  none: "0px"
  sm: "4px"
  md: "8px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  xxl: "72px"
components:
  page-background:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.inkSoft}"
    rounded: "{rounded.md}"
  source-pill:
    backgroundColor: "{colors.accentContainer}"
    textColor: "{colors.primary}"
    rounded: "999px"
  divider:
    backgroundColor: "{colors.line}"
  metadata:
    textColor: "{colors.muted}"
  button-secondary:
    backgroundColor: "{colors.accentContainer}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "12px 18px"
  success-pill:
    backgroundColor: "{colors.success}"
    textColor: "{colors.primaryContainer}"
    rounded: "999px"
  evidence-bubble-build:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.primaryContainer}"
    rounded: "999px"
  evidence-bubble-interview:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.primaryContainer}"
    rounded: "999px"
  evidence-bubble-hold:
    backgroundColor: "{colors.weak}"
    textColor: "{colors.primaryContainer}"
    rounded: "999px"
---

## Overview

PMF Radar Lab is not a generic customer-support dashboard. It is a Korean PM thinking product: KakaoTalk-style customer messages become evidence, evidence becomes a visual map, and the map becomes an hplan decision.

The interface must sit naturally under a habix.ai subdomain. It should inherit Habix's Korean course/consulting landing style: warm paper background, dark hero canvas, terracotta accent, mono technical labels, practical Korean copy, and compact product-grade sections.

The user should understand the core job within three seconds:

> 고객문의가 제품 판단으로 바뀐다.

## Brief First

Primary user:

- PM/PO/founder/course operator in Korea
- receives customer questions through KakaoTalk, Kakao Channel, Channel Talk, open chat, email, or community comments
- wants to know what to reply to, what to improve, what to interview about, and what not to build

Core UI job:

- ingest or simulate customer messages
- visualize PMF evidence, not just list categories
- show why a signal is strong, medium, or weak
- force a build/interview/hold decision
- keep human review before customer-facing replies

The UI should not look like a CRM clone, generic Tailwind dashboard, or chatbot admin panel.

## Colors

Use Habix distribution.

- 60% warm paper/surface: Korean education/consulting trust
- 30% dark navy/ink: Habix AI technical seriousness
- 10% terracotta accent: CTA, section eyebrow, decisive action

Boundary rules:

- `primary` and `primaryContainer` are for hero, footer, decision surfaces, and serious product framing.
- `danger` is not decorative red. Use only for build-now evidence, churn/refund/security risk, or critical signals.
- `accent` is Habix terracotta. Use for CTA, mono eyebrow, active navigation, and selected decision state.
- Kakao yellow may appear only as a source icon or integration marker, never as a dominant brand color.
- No more than one saturated accent family per viewport.

## Typography

Korean readability wins. Habix pages use Noto Sans KR for body/headings and JetBrains Mono for technical eyebrows, labels, and small tags.

- Display type is for one hero line only.
- H1 is for page-level intent only.
- H2 opens major product sections.
- Body text must remain calm and readable.
- Labels are uppercase only for interface metadata such as `Evidence Map`, `Gate Decision`, `Source`.
- Do not use the heavy geometric display treatment from the previous prototype; it feels less Korean and less Habix.

Do not use more than two font weights in a single screen region.

## Layout & Spacing

The product should use large first-impression space and dense-but-controlled work areas.

- Landing hero: one primary idea, one supporting sentence, one proof/decision panel.
- Analysis workspace: 3-part structure is allowed only when it maps to workflow: Raw → Evidence → Decision.
- Data visualization should be spatial, not merely tabular.
- When showing many data points, use map, flow, heatmap, timeline, or bubble chart before table.

## Visualization Rules

This product must prove that it understands visualization.

Use:

- bubble map for frequency × risk × evidence strength
- Sankey/flow for raw inquiry → evidence → decision
- heatmap for source/channel × pain cluster
- timeline for emerging issue spikes
- quadrant for build/interview/hold decisions

Avoid:

- list of cards pretending to be a radar
- tables as the primary visualization
- decorative charts with no decision encoded
- color-only signal distinction

Every visualization must answer:

1. What should I notice?
2. Why does it matter?
3. What decision follows?

## Component Decision Rules

- Card: use only for a bounded object with 3+ properties, such as a selected evidence item.
- Row: use for inbox messages and compact repeated items.
- Bubble: use for evidence clusters with quantitative dimensions.
- Panel: use for workflow stages, not decorative grouping.
- Badge: use for evidence strength and source only.
- Table: use for appendix/research, not the main landing hero.

## Do's and Don'ts

Do:

- Show the product's job in the hero sentence.
- Include Kakao/Channel Talk source reality in the information architecture.
- Keep `What Not To Build` visible as a trust device.
- Use real evidence dimensions in visualizations.
- Show human review before reply sending.
- Make the first screen feel spacious and confident.

Do not:

- Do not use purple-to-blue gradients.
- Do not use Inter, Roboto, Arial, Space Grotesk, or `system-ui`.
- Do not use rounded corners above 8px except pills/bubbles.
- Do not use drop shadows as the only depth system.
- Do not make every surface a card.
- Do not call a list of cards a radar.
- Do not hide Kakao integration as an appendix if the product promise depends on it.
- Do not show auto-reply as the primary outcome.
- Do not use color-only error or evidence states.
- Do not use more than two font weights per screen region.

## Hybrid Craft Directives

The product should feel human-touched, not template-generated.

- Use Korean product language, not translated SaaS filler.
- Prefer editorial restraint over SaaS decoration.
- Add one hand-authored teaching line per screen.
- Use subtle asymmetry in hero layout.
- Use charts that look deliberately composed, not library defaults.
- Real product credibility comes from constraints, not ornament.

## Public Demo Rule

The public demo path must use one canonical Habix style.

- `demo/index.html` is the source of truth.
- `demo/landing-v1-editorial.html` and `demo/landing-v2-kakao-ops.html` are legacy compatibility URLs that redirect to `demo/index.html`.
- Do not expose `V1`, `V2`, `Default`, `Editorial Evidence`, `Kakao Ops`, or `Design Version` in customer-facing navigation.
- If future design explorations are needed, put them under an internal-only path or branch.

## hplan Design Skill Gap

This project should treat design as a forge-stage artifact, not decoration after implementation.

Recommended skill group:

- `design-md-bootstrap`: interview-first DESIGN.md generation. Ask product context, user job, constraints, and don'ts before tokens.
- `aesthetic-direction`: commit to a clear visual mode before coding. Never fall back to "clean, modern, professional."
- `design-md-lint`: run Google DESIGN.md lint checks, WCAG AA contrast, forbidden pattern detection, and token reference validation.
- `ui-drift-detect`: compare generated screens so the fifth screen does not forget the first screen's decisions.

## Quality Gate

Before a landing page or dashboard is accepted, answer these checks:

- Can a visitor understand the product job in three seconds?
- Is the primary visualization actually spatial, comparative, or relational?
- Does the page make Kakao/channel ingestion visible?
- Is human review visible before any customer-facing reply?
- Are all major colors traceable to the design tokens?
- Are forbidden patterns absent from CSS and copy?
- Does the screen encode at least one "what not to build" decision?

Failing any of these should trigger another Ralph loop.

## Anti-AI-Slop Lint Rules

These patterns should be treated as regressions:

| Rule | Why It Fails | Detection |
|---|---|---|
| Inter, Roboto, Arial, Space Grotesk, `system-ui` | Professionally generic default | `font-family` regex |
| Purple-to-blue gradient on white | Generic AI SaaS look | gradient color stop scan |
| Table as the primary "visualization" | It organizes, but does not visualize | DOM/content audit |
| More than two font weights per screen region | Hierarchy becomes noisy | CSS font-weight count |
| Color-only evidence state | Accessibility and ambiguity risk | component audit |
| Card shadow as the only depth system | Template dashboard feel | `box-shadow` audit |
| Kakao hidden below fold | MVP promise is not visible | viewport screenshot audit |

## Agent Guidance

When Claude Code, Codex, Cursor, or any coding agent reads this file:

1. Respect the brief before tokens.
2. Apply negative constraints before choosing components.
3. Use token references where possible.
4. If a request conflicts with this file, explain the design tradeoff before changing direction.
5. For new screens, use the Habix canonical mode: warm paper, dark hero, terracotta CTA, Noto Sans KR + JetBrains Mono, 1180px centered sections, compact cards.
6. Before finalizing UI, check:
   - Is the product job clear in 3 seconds?
   - Is the primary visualization actually visual?
   - Are Kakao/channel realities visible?
   - Is there a human review boundary?
   - Are there any forbidden generic AI aesthetics?

## References

- Google `DESIGN.md`: YAML tokens + Markdown rationale with lint/diff/export tooling.
- VoltAgent `awesome-design-md`: reference library of brand-specific DESIGN.md files for AI coding agents.
- hplan design gap: PRD/spec without a persistent design brain causes screen drift.
