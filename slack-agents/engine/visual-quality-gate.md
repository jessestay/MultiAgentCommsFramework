# Visual Quality Gate — MACF Engine

Every social/blog image must pass this editorial filter BEFORE it reaches
Jesse. Images are hooks, not decorations: the image must grab attention in
under one second, exactly like a headline. Run by the CUXO.

## Owner
The CUXO (UX designer) owns all social/blog visuals end-to-end: concept,
sourcing, overlay, text, and final approval. No agent ships an image the
CUXO hasn't passed through this gate.

## Persona: Jasmine Star lens
The CUXO assumes the Jasmine Star lens for every visual: scroll-stopping,
story-driven, thumb-first composition. Ask her question on every image:
"Would this stop MY scroll?" If not, it fails.

## The filter (all must pass)

### 1. Stock-first, AI-second
- Start from REAL photography (stock). Real faces, real rooms, real texture.
- AI overlay only when it adds what photography can't: glow effects, data
  streams, conceptual elements composited onto the real photo.
- Pure-AI renders must never LOOK AI. If it has that glossy synthetic sheen,
  it fails — go back to stock and composite.

### 2. Text overlay with intent
- If the hook can be amplified visually, put the boldest 3–7 words ON the
  image. The image + headline work as one unit.
- Text must be readable at thumbnail size (phone feed, ~300px wide). Big,
  high-contrast, platform-safe zones (no text under profile pics or UI).
- Never more than ~7 words. One line beats two.

### 3. One-second attention test
- The image's job is the same as the hook's: stop the scroll.
- Test: shrink it to feed size. Does the eye land in under a second? Does
  it create a question or a feeling instantly?
- If the image needs its caption to make sense, it fails.

### 4. Human-created look
- Grain, imperfection, natural light preferred over studio-perfect renders.
- No floating objects, no impossible physics, no watermark-style artifacts.
- When in doubt: a great stock photo with bold text beats a clever AI render.

### 5. Platform-native sizing
- LinkedIn/Facebook feed: 16:9 or 1:1. Blog header: 16:9 wide.
- State the format in the handoff. Never ship a wrong-ratio image.

## Toolchain (best available, in order)
1. **Canva MCP** (verified Oct 3): templates, stock library, text overlay,
   brand kit. First choice for composed social graphics.
2. **Stock search** (image_search skill): real photography base layers.
3. **AI overlay** (media pipeline, image-edit mode): composite conceptual
   elements or text onto the stock base — never generate the whole scene
   from scratch when stock exists.
4. If Canva MCP is unreachable in-session, fall back to 2+3 and note it in
   the handoff — never silently ship pure-AI.

## Enforcement
- The CUXO scores each visual 1–5 per rule. Below 4 on any rule = redo.
- Content-quality-gate rule 7 now routes through this filter: no visual
  reaches Jesse without passing.
- A visual that reaches Jesse unfiltered is an engine defect.
