'use client';

import { useEffect, useCallback } from 'react';

/**
 * Pixel Perfect Text Rendering for 1-bit E-Ink Displays
 *
 * This system ensures text aligns precisely to the pixel grid by:
 * 1. Measuring each parent element's width to determine if it's odd or even
 * 2. Breaking text content into individual lines
 * 3. Wrapping each line in a span element
 * 4. Adjusting each span's width to match the parent's parity (even/odd)
 *
 * This eliminates sub-pixel rendering issues on 1-bit displays where
 * anti-aliasing and fractional pixels cause visual artifacts.
 */

interface PixelPerfectOptions {
  /** Selector for elements to process (default: '[data-pixel-perfect="true"]') */
  selector?: string;
  /** Whether to re-process on window resize */
  reprocessOnResize?: boolean;
}

/**
 * Breaks text node content into lines based on actual rendered line breaks.
 * Uses a temporary measuring element to detect where natural line breaks occur.
 */
function getTextLines(element: HTMLElement): string[] {
  const text = element.textContent || '';
  if (!text.trim()) return [];

  const computedStyle = window.getComputedStyle(element);

  // Create a measuring container that matches the element's text properties
  const measurer = document.createElement('span');
  measurer.style.cssText = `
    position: absolute;
    visibility: hidden;
    white-space: nowrap;
    font: ${computedStyle.font};
    letter-spacing: ${computedStyle.letterSpacing};
    word-spacing: ${computedStyle.wordSpacing};
  `;
  document.body.appendChild(measurer);

  // Get the available width for text
  const containerWidth = element.clientWidth;

  // Split text into words and build lines
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    measurer.textContent = testLine;

    if (measurer.offsetWidth <= containerWidth || !currentLine) {
      currentLine = testLine;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  document.body.removeChild(measurer);

  return lines;
}

/**
 * Processes a single element to apply pixel-perfect text rendering.
 */
function processElement(element: HTMLElement): void {
  // Skip if already processed and hasn't changed
  if (element.dataset.pixelPerfectProcessed === 'true') {
    return;
  }

  // Get parent width parity
  const parentWidth = element.parentElement?.clientWidth || element.clientWidth;
  const isParentEven = parentWidth % 2 === 0;

  // Get the lines of text
  const lines = getTextLines(element);

  if (lines.length === 0) return;

  // Clear the element and rebuild with wrapped spans
  element.innerHTML = '';

  lines.forEach((line) => {
    const span = document.createElement('span');
    span.textContent = line;
    span.className = 'pixel-perfect-line';
    span.style.display = 'block';

    element.appendChild(span);

    // Measure the span's natural width
    const spanWidth = span.offsetWidth;
    const isSpanEven = spanWidth % 2 === 0;

    // Adjust width to match parent parity
    if (isParentEven !== isSpanEven) {
      // Add 1px to make parity match
      span.style.width = `${spanWidth + 1}px`;
    } else {
      span.style.width = `${spanWidth}px`;
    }
  });

  // Mark as processed
  element.dataset.pixelPerfectProcessed = 'true';
}

/**
 * Resets an element to allow re-processing.
 */
function resetElement(element: HTMLElement): void {
  delete element.dataset.pixelPerfectProcessed;
}

/**
 * Hook to apply pixel-perfect text rendering to elements.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   usePixelPerfect();
 *
 *   return (
 *     <div>
 *       <p data-pixel-perfect="true">
 *         This text will be pixel-perfect aligned
 *       </p>
 *     </div>
 *   );
 * }
 * ```
 */
export function usePixelPerfect(options: PixelPerfectOptions = {}): void {
  const {
    selector = '[data-pixel-perfect="true"]',
    reprocessOnResize = true,
  } = options;

  const processAll = useCallback(() => {
    const elements = document.querySelectorAll<HTMLElement>(selector);
    elements.forEach(processElement);
  }, [selector]);

  const resetAll = useCallback(() => {
    const elements = document.querySelectorAll<HTMLElement>(selector);
    elements.forEach(resetElement);
  }, [selector]);

  useEffect(() => {
    // Initial processing after DOM is ready
    // Use requestAnimationFrame to ensure layout is complete
    const rafId = requestAnimationFrame(() => {
      processAll();
    });

    // Handle resize if enabled
    let resizeHandler: (() => void) | undefined;
    if (reprocessOnResize) {
      resizeHandler = () => {
        resetAll();
        requestAnimationFrame(processAll);
      };
      window.addEventListener('resize', resizeHandler);
    }

    return () => {
      cancelAnimationFrame(rafId);
      if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler);
      }
    };
  }, [processAll, resetAll, reprocessOnResize]);
}

/**
 * Standalone function to process pixel-perfect elements.
 * Useful for imperative processing outside of React components.
 */
export function applyPixelPerfect(
  container: HTMLElement | Document = document,
  selector = '[data-pixel-perfect="true"]'
): void {
  const elements = container.querySelectorAll<HTMLElement>(selector);
  elements.forEach(processElement);
}

/**
 * Reset all pixel-perfect elements to allow re-processing.
 */
export function resetPixelPerfect(
  container: HTMLElement | Document = document,
  selector = '[data-pixel-perfect="true"]'
): void {
  const elements = container.querySelectorAll<HTMLElement>(selector);
  elements.forEach(resetElement);
}

export default usePixelPerfect;
