/**
 * Deterministic placement for the AI Tools guided preview card.
 *
 * One function positions every tool's card the same way, so no tool invents its own rules. The
 * card is rendered in a body-level portal (viewport coordinates), which is why this works purely
 * off rects and needs no DOM. Pure + dependency-free so it runs under the backend node:test runner.
 *
 * Rule: prefer the side of the row that has room for the full card (the inspector sits on the
 * right, so "left" wins in the normal editor layout). If neither side fully fits, pick the side
 * with more free space and clamp. Vertically, align the card's top to the row and clamp inside the
 * viewport so it never clips the top/bottom edges.
 */

export interface PlacementRect {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

export interface PlacementViewport {
  width: number;
  height: number;
}

export interface PlacementInput {
  /** The hovered/focused tool row, in viewport coordinates. */
  row: PlacementRect;
  cardWidth: number;
  cardHeight: number;
  viewport: PlacementViewport;
  /** Space between the row and the card. */
  gap?: number;
  /** Minimum distance the card keeps from any viewport edge. */
  margin?: number;
}

export type PlacementSide = 'left' | 'right';

export interface Placement {
  top: number;
  left: number;
  side: PlacementSide;
}

export function computePreviewPlacement(input: PlacementInput): Placement {
  const gap = input.gap ?? 12;
  const margin = input.margin ?? 8;
  const { row, cardWidth, cardHeight, viewport } = input;

  const leftX = row.left - gap - cardWidth;
  const rightX = row.right + gap;
  const leftFits = leftX >= margin;
  const rightFits = rightX + cardWidth <= viewport.width - margin;

  let side: PlacementSide;
  let left: number;
  if (leftFits) {
    side = 'left';
    left = leftX;
  } else if (rightFits) {
    side = 'right';
    left = rightX;
  } else {
    // Neither side fits the full card — choose the side with more free space, then clamp.
    const spaceLeft = row.left;
    const spaceRight = viewport.width - row.right;
    if (spaceLeft >= spaceRight) {
      side = 'left';
      left = margin;
    } else {
      side = 'right';
      left = viewport.width - cardWidth - margin;
    }
  }

  // Horizontal clamp keeps the card fully on-screen regardless of the branch above.
  const maxLeft = Math.max(margin, viewport.width - cardWidth - margin);
  left = Math.min(Math.max(left, margin), maxLeft);

  // Vertical: anchor to the row, clamp within the viewport (never clip top/bottom).
  const maxTop = Math.max(margin, viewport.height - cardHeight - margin);
  const top = Math.min(Math.max(row.top, margin), maxTop);

  return { top, left, side };
}
