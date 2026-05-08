"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Check, Search } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
  icon?: string;
  description?: string;
}

interface CustomSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  icon?: React.ReactNode;
  searchable?: boolean;
  disabled?: boolean;
  className?: string;
}

interface DropdownCoords {
  top: number;
  left: number;
  width: number;
}

export function CustomSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
  icon,
  searchable = false,
  disabled = false,
  className = "",
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [coords, setCoords] = useState<DropdownCoords | null>(null);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);
  const filtered = search
    ? options.filter((o) =>
        o.label.toLowerCase().includes(search.toLowerCase())
      )
    : options;

  // Portal needs the document to be available (client only)
  useEffect(() => setMounted(true), []);

  // Calculate dropdown position from trigger's bounding rect
  const updateCoords = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setCoords({
      top: rect.bottom + 6,   // 6px gap below trigger
      left: rect.left,
      width: Math.max(rect.width, 300), // at least 300px wide
    });
  }, []);

  // Open/close with position calculation
  function toggle() {
    if (disabled) return;
    if (!open) {
      updateCoords();
      setOpen(true);
    } else {
      setOpen(false);
      setSearch("");
    }
  }

  // Recalculate on scroll / resize so dropdown tracks the trigger
  useEffect(() => {
    if (!open) return;
    const recalc = () => updateCoords();
    window.addEventListener("scroll", recalc, true);
    window.addEventListener("resize", recalc);
    return () => {
      window.removeEventListener("scroll", recalc, true);
      window.removeEventListener("resize", recalc);
    };
  }, [open, updateCoords]);

  // Close on click outside (both trigger and portal dropdown)
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      // Check if click is inside trigger container
      if (containerRef.current?.contains(target)) return;
      // Check if click is inside the portal dropdown
      const portalRoot = document.getElementById("custom-select-portal");
      if (portalRoot?.contains(target)) return;
      setOpen(false);
      setSearch("");
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Focus search on open
  useEffect(() => {
    if (open && searchable) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open, searchable]);

  // Keyboard nav
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { setOpen(false); setSearch(""); }
    if (e.key === "Enter" && !open) toggle();
  }

  // The dropdown rendered in a fixed portal so overflow:hidden parents can't clip it
  const dropdownEl = coords && open && mounted
    ? createPortal(
        <div
          id="custom-select-portal"
          style={{
            position: "fixed",
            top: coords.top,
            left: coords.left,
            width: Math.min(coords.width, window.innerWidth - coords.left - 16),
            minWidth: Math.min(300, window.innerWidth - 32),
            zIndex: 9999,
          }}
        >
          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-xl overflow-hidden"
                style={{
                  background: "var(--bg-overlay)",
                  border: "1px solid var(--border-mid)",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)",
                }}
                role="listbox"
              >
                {/* Search */}
                {searchable && (
                  <div
                    className="px-3 pt-2.5 pb-1.5"
                    style={{ borderBottom: "1px solid var(--border-dim)" }}
                  >
                    <div className="relative">
                      <Search
                        size={14}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2"
                        style={{ color: "var(--text-tertiary)" }}
                      />
                      <input
                        ref={searchRef}
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search…"
                        className="w-full h-8 pl-8 pr-3 rounded-lg text-[13px] outline-none"
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid var(--border-dim)",
                          color: "var(--text-primary)",
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Options */}
                <div
                  className="max-h-[240px] overflow-y-auto py-1"
                  style={{ scrollbarWidth: "thin" }}
                >
                  {filtered.length === 0 && (
                    <div
                      className="px-3 py-4 text-center text-[13px]"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      No options found
                    </div>
                  )}
                  {filtered.map((option) => {
                    const isActive = option.value === value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onMouseDown={(e) => {
                          // Use mousedown so it fires before blur closes anything
                          e.preventDefault();
                          onChange(option.value);
                          setOpen(false);
                          setSearch("");
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-[13px] transition-colors cursor-pointer"
                        style={{
                          background: isActive
                            ? "var(--info-soft)"
                            : "transparent",
                          color: isActive
                            ? "var(--text-primary)"
                            : "var(--text-secondary)",
                        }}
                        onMouseEnter={(e) =>
                          !isActive &&
                          (e.currentTarget.style.background = "rgba(255,255,255,0.04)")
                        }
                        onMouseLeave={(e) =>
                          !isActive &&
                          (e.currentTarget.style.background = "transparent")
                        }
                        role="option"
                        aria-selected={isActive}
                      >
                        {option.icon && (
                          <span className="text-base w-6 text-center">
                            {option.icon}
                          </span>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="truncate font-medium">{option.label}</div>
                          {option.description && (
                            <div
                              className="text-[11px] truncate mt-0.5"
                              style={{ color: "var(--text-tertiary)" }}
                            >
                              {option.description}
                            </div>
                          )}
                        </div>
                        {isActive && (
                          <Check size={14} style={{ color: "var(--teal-light)" }} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <div
        ref={containerRef}
        className={`relative ${className}`}
        onKeyDown={handleKeyDown}
      >
        {/* Trigger button */}
        <button
          ref={triggerRef}
          type="button"
          onClick={toggle}
          disabled={disabled}
          className="w-full h-11 rounded-xl text-[14px] font-medium text-left cursor-pointer outline-none transition-all input-maple focus-ring flex items-center gap-2.5"
          style={{
            paddingLeft: icon ? "40px" : "14px",
            paddingRight: "36px",
            color: selected ? "var(--text-primary)" : "var(--text-tertiary)",
            opacity: disabled ? 0.5 : 1,
          }}
          aria-expanded={open}
          aria-haspopup="listbox"
        >
          {selected ? (
            <span className="flex items-center gap-2 truncate">
              {selected.icon && <span className="text-base">{selected.icon}</span>}
              {selected.label}
            </span>
          ) : (
            placeholder
          )}
        </button>

        {/* Left icon */}
        {icon && (
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base pointer-events-none">
            {selected?.icon || icon}
          </span>
        )}

        {/* Chevron */}
        <motion.span
          className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: "var(--text-tertiary)" }}
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown size={15} />
        </motion.span>
      </div>

      {/* Portal dropdown — renders outside any overflow:hidden parents */}
      {dropdownEl}
    </>
  );
}
