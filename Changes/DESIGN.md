# Design System Strategy: The Hospitality Editorial

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Digital Maître d’."** 

In a high-value restaurant environment, luxury is defined by invisibility, precision, and warmth. This design system moves away from the "software-as-a-tool" aesthetic and toward a "software-as-a-service" editorial experience. We achieve this by rejecting rigid, boxy layouts in favor of intentional asymmetry, layered depth, and expansive white space. The interface should feel like a crisp, linen tablecloth—structured yet organic, premium yet inviting.

By utilizing high-contrast typography scales and overlapping "glass" surfaces, we break the "template" look typical of CRMs, replacing it with a bespoke digital environment that reflects the prestige of the establishments using it.

---

## 2. Colors & Surface Philosophy
The palette is rooted in `surface` (#F9F9FB) and `surface_container_lowest` (#FFFFFF), creating a luminous, breathable foundation.

### The "No-Line" Rule
To maintain a high-end feel, **1px solid borders are prohibited for sectioning.** Structural boundaries must be defined exclusively through background color shifts. For example, a sidebar using `surface_container_low` should sit against a `surface` background without a stroke. This creates a "soft" edge that feels more sophisticated and less "engineered."

### Surface Hierarchy & Nesting
Treat the UI as a physical stack of fine materials. 
- **Base Layer:** `surface` (#f9f9fb)
- **Secondary Sections:** `surface_container_low` (#f3f3f5)
- **Interactive Cards:** `surface_container_lowest` (#ffffff)
- **High-Interaction/Pop-overs:** `surface_container_highest` (#e2e2e4)

### The "Glass & Gradient" Rule
To achieve a "Stripe-like" polish, floating elements (modals, dropdowns, sticky headers) must utilize Glassmorphism. Apply a `surface_container_lowest` background at 80% opacity with a `backdrop-blur` of 20px. 

### Signature Textures
Main CTAs and Hero backgrounds should avoid flat fills. Use a subtle linear gradient (135°) transitioning from `primary` (#b60e3d) to `primary_container` (#da3054). This provides a "lit-from-within" quality that adds tonal depth and professional vigor.

---

## 3. Typography
We use **Inter** exclusively, relying on its neutral but highly legible character to act as the "anchor" for our more expressive layout choices.

- **Display (3.5rem - 2.25rem):** Reserved for high-impact data points (e.g., total revenue, guest count). Use `font-weight: 700` and `letter-spacing: -0.02em` to create a bold, editorial presence.
- **Headline (2rem - 1.5rem):** Used for page titles. These should be paired with generous top margins to allow the content to "breathe."
- **Title (1.375rem - 1rem):** Medium weights (`500`) for card headers and section titles.
- **Body (1rem - 0.75rem):** The workhorse for guest notes and CRM data. Use `on_surface_variant` (#5a4042) for secondary body text to reduce visual noise.
- **Labels (0.75rem - 0.6875rem):** Always `font-weight: 600` and often uppercase with `0.05em` tracking for a "metadata" look that feels intentional.

---

## 4. Elevation & Depth
In this system, depth is a function of light and layering, not shadows alone.

- **Tonal Layering:** Instead of a shadow, place a `surface_container_lowest` card on a `surface_container_low` background. The 2-point difference in hex value is enough to create a "Natural Lift."
- **Ambient Shadows:** When a float is required (e.g., a guest profile modal), use an ultra-diffused shadow: 
  - `box-shadow: 0 20px 40px rgba(26, 28, 29, 0.05);`
  - The shadow color must be a low-opacity version of `on_surface` to mimic natural light.
- **The "Ghost Border" Fallback:** If a border is required for accessibility (e.g., input fields), use the `outline_variant` (#e2bec0) at **20% opacity**. Never use a 100% opaque stroke.
- **Glassmorphism:** Use `surface_container_lowest` with `backdrop-blur: 12px` for navigation bars. This allows the soft colors of the content below to bleed through, maintaining a sense of place.

---

## 5. Components

### Buttons
- **Primary:** Gradient fill (`primary` to `primary_container`), `on_primary` text, `rounded-md` (0.75rem). Subtle hover lift of 2px.
- **Secondary:** `surface_container_high` fill with `primary` text. No border.
- **Tertiary:** Pure text with `on_surface` weight 600. Use for "Cancel" or "Back" actions.

### Cards & Lists
- **The Divider Ban:** Do not use `<hr>` tags or border-bottoms. Separate guest entries using vertical whitespace (1.5rem) or by alternating background tints between `surface` and `surface_container_low`.
- **Nesting:** Place `surface_container_lowest` cards inside a `surface_container_low` wrapper for a "tray" effect.

### Input Fields
- Use a `surface_container_lowest` fill with a "Ghost Border" (20% `outline_variant`). 
- On focus, transition the border to `primary` (#b60e3d) at 100% opacity and add a 4px soft glow.

### Additional CRM-Specific Components
- **The Status Jewel:** Instead of large badges, use a 6px circular "jewel" of `tertiary` (#00685f) next to text to indicate an active table or VIP status.
- **Timeline Threads:** For guest history, use a 1px `outline_variant` vertical line at 15% opacity, connecting `surface_container_high` circular icons.

---

## 6. Do's and Don'ts

### Do
- **Do** use asymmetrical padding (e.g., more padding at the top of a card than the bottom) to create an editorial feel.
- **Do** lean into the `tertiary` (#00685f) for "success" or "active" states—it provides a sophisticated alternative to "standard" green.
- **Do** use `letter-spacing` on small labels to improve their "premium" legibility.

### Don't
- **Don't** use pure black (#000000). Always use `on_surface` (#1a1c1d) to maintain the softness of the cream/white palette.
- **Don't** use "Standard" shadows. If you can see where the shadow ends, it’s too dark.
- **Don't** use 100% opaque borders to separate content. Let color transitions and whitespace do the heavy lifting.