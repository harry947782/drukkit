# Drukkit Core Architecture & Master LLM Specification

This document serves as the absolute blueprint and system instruction manual for **Drukkit**—a responsive, standalone, zero-dependency HTML5/JavaScript Drum Notation Editor and Viewer. It defines the technical landscape, state serialization mechanics, and strict design guardrails required to analyze, maintain, or extend the codebase.

---

## 1. Architectural Principles & System Design

To bypass browser local `file:///` CORS security restrictions and remain endlessly portable, Drukkit relies on a strict single-file decoupled architecture.

* **Zero Dependencies:** The application must remain entirely native. Third-party frameworks, design libraries, utility packages, and external web fonts (e.g., Bootstrap, Tailwind, jQuery, FontAwesome, Google Fonts) are completely banned.
* **Decoupled Layout Grid Engine:** The display matrix avoids brittle text characters or canvas elements. Instead, it relies on JavaScript to programmatically compute a master layout string (`globalCachedGridTemplate`) using fixed-width spacer channels:
* `36px` boundary tracks for measure lines (`.gap-bar-line`).
* `20px` transparent layout tracks between individual beats (`.gap-beat-space`).
* Flexible square blocks (`minmax(0, 1fr)`) with an enforced aspect ratio of `1` to maintain proportional symmetry across all viewports.


* **Pure Vector Graphic Engine:** Notation nodes drop textual font characters to eliminate baseline alignment anomalies and cross-browser line shifting. Active states rely on inline CSS URL-encoded vector graphics (`--svg-circle`, `--svg-cross`, `--svg-letter-r`, `--svg-letter-l`). All symbols are uniformly locked to a centered `background-size: 65%` bounding box.

---

## 2. Notation State Machine & Input Vectors

Clicking any grid cell coordinates triggers a unidirectional cyclic loop step manager.

### The 4-State Cycle

```
[Empty Space] ──➔ [Configured Symbol] ──➔ [R - Right Hand] ──➔ [L - Left Hand] ──➔ [Loop back to Empty]

```

### Data Serialization Schema

The application serializes its active state instantly into the URL query parameters using `window.history.replaceState`. The state contains six parameters:

1. `title`: The URL-encoded project name string (synchronized continuously with `document.title`).
2. `time`: The global time signature constraint ("4/4", "3/4", "2/2", or "6/8").
3. `bars`: Total measure length tracking string ("1" to "16").
4. `sub`: Resolution tier token ("quarter", "8th", "12th", or "16th").
5. `notes`: The URL-encoded text string capturing the content of the performance remarks text area.
6. `tracks`: A URL-encoded serialized JSON array of track objects.

### Track Structure Node Architecture

```json
{
  "id": "unique_string_timestamp_hash",
  "name": "instrument_display_name",
  "sym": "circle_or_cross_token",
  "notes": [
    { "i": 0, "s": "A" },
    { "i": 2, "s": "R" },
    { "i": 5, "s": "L" }
  ]
}

```

* `i` (Index): A single, continuous, 0-indexed linear integer timeline position tracking variable.
* `s` (State): Character flags tracking active modes: `"A"` (Active standard graphic), `"R"` (Right-hand SVG), or `"L"` (Left-hand SVG).

> **Backward Compatibility Requirement:** The parameter hydration parser (`restoreNotes`) must inspect the type structure of ingested notes. If a legacy array of flat integers is detected instead of object tuples, it must map them automatically as standard active (`"A"`) notes.

---

## 3. Contextual Boundary Controls & Life Cycles

Major measure barlines act as structural management coordinates.

* **Internal Boundaries:** Hovering over internal vertical measure bars exposes an absolute-centered overlay control popover (`.bar-copy-menu`) displaying four contextual interactive vectors:
* `◂ Copy Left`: Clones the full step-state map of the right-hand bar *into* the left-hand bar block.
* `Copy Right ▸`: Clones the full step-state map of the left-hand bar *into* the right-hand bar block.
* `Del Left ✖`: Wipes the measure to the left, shifts downstream states leftward by one bar length, and shrinks the bar input pool.
* `✖ Del Right`: Wipes the measure to the right, compresses downstream data, and reduces bar metrics.


* **Outer Boundaries:** Hovering over the start boundary track (before Bar 1) or end boundary track (after the final bar) exposes add/delete options to structurally extend the notation canvas outwards.
* **Structural Safety Valve:** To keep the rendering canvas from breaking, deletion commands must be programmatically hidden or suppressed across all boundaries if the current session bar count drops to `1` measure.

---

## 4. Mathematical Timeline Ingestion Formulas

To accurately read or write note events across the continuous, 0-indexed horizontal axis, you must map grid coordinates using specific calculations:

* **Steps Per Individual Bar** = $\text{Beats Per Bar} \times \text{Subdivision Multiplier}$
* **Subdivision Multipliers**: `quarter` = 1, `8th` = 2, `12th (Triplets)` = 3, `16th` = 4.

$$\text{Global Step Index } (i) = (\text{Bar Index} \times \text{Steps Per Bar}) + (\text{Beat Index} \times \text{Multiplier}) + \text{Sub-beat Offset}$$

---

## 5. Hardcoded Print Engine & Sync Pipeline

Drukkit utilizes an aggressive `@media print` style sheet layout to optimize charts for clean physical paper output or PDF exports.

* **Browser Metadata Elimination:** To completely suppress default browser header/footer text strings (such as URLs, page counts, dates, and names), `@page` forces a strict `margin: 0;` profile. Canvas clipping protection is handled by moving margins completely inside the layout, using a `1cm` padding rule on the `body` tag.
* **Layout Immobilization:** All structural controls, layout buttons, scrollbars, text field background colors, drop selectors, and bar menus are entirely stripped from the view. Track label containers lock to a frozen layout of `140px` to guarantee that all music row sections align along the exact same vertical start coordinate.
* **Print-Ready QR Engine:** The application header embeds an automated barcode image container (`#printQrCode`). It passes the current state URL to an offline vector QR server.
* On active web screen monitors, it is hidden via `display: none;`.
* On print layouts, it reveals itself via `display: block !important;` as a crisp `90px × 90px` high-contrast square, allowing musicians to scan physical sheet music and reload the interactive digital session instantly.
