"use client";

import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useStore } from "@/lib/store";

/**
 * Renders inline text with a dotted underline that shows a glossary tooltip on hover.
 * Uses a portal to render the tooltip at the document root so it's never clipped.
 */
export function Tooltip({
  keyword,
  children,
}: {
  keyword: string;
  children?: React.ReactNode;
}) {
  const { glossary } = useStore();
  const entry = glossary.find(
    (g) => g.keyword.toLowerCase() === keyword.toLowerCase()
  );
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  if (!entry) {
    return <span>{children ?? keyword}</span>;
  }

  const handleEnter = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPos({
        top: rect.top - 8,
        left: rect.left + rect.width / 2,
      });
    }
    setShow(true);
  };

  return (
    <>
      <span
        ref={ref}
        className="text-blue-400 font-medium cursor-help border-b border-dotted border-blue-400/50"
        onMouseEnter={handleEnter}
        onMouseLeave={() => setShow(false)}
      >
        {children ?? entry.label}
      </span>
      {show &&
        createPortal(
          <div
            className="fixed pointer-events-none"
            style={{
              top: pos.top,
              left: pos.left,
              transform: "translate(-50%, -100%)",
              zIndex: 9999,
            }}
          >
            <div className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-300 shadow-xl w-max max-w-[250px] text-center leading-relaxed">
              <span className="font-semibold text-white block mb-0.5">
                {entry.label}
              </span>
              {entry.description}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

/**
 * Renders plain text with **bold** markers as white bold spans.
 */
function RichText({ text }: { text: string }) {
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="text-white font-bold">{part}</span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

/**
 * Parses a text string and replaces:
 * - [[keyword]] with glossary Tooltip components
 * - **text** with bold white text
 */
export function GlossaryText({ text }: { text: string }) {
  const parts = text.split(/\[\[([^\]]+)\]\]/g);

  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <Tooltip key={i} keyword={part} />
        ) : (
          <RichText key={i} text={part} />
        )
      )}
    </>
  );
}
