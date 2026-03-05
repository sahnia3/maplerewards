import { OptimizerForm } from "@/components/optimizer-form";

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Ambient background orbs */}
      <div className="orb w-[600px] h-[400px] top-[-100px] left-1/2 -translate-x-1/2"
        style={{ background: "radial-gradient(ellipse, rgba(200,16,46,0.12) 0%, transparent 70%)" }}
      />
      <div className="orb w-[300px] h-[300px] top-[200px] left-[5%]"
        style={{ background: "radial-gradient(ellipse, rgba(59,130,246,0.06) 0%, transparent 70%)" }}
      />
      <div className="orb w-[250px] h-[250px] top-[150px] right-[8%]"
        style={{ background: "radial-gradient(ellipse, rgba(139,92,246,0.06) 0%, transparent 70%)" }}
      />

      <div className="relative max-w-3xl mx-auto px-6 pt-28 pb-24">
        {/* Hero */}
        <div className="text-center mb-14 fade-up">
          {/* Pill badge */}
          <div className="inline-flex items-center gap-2 mb-7 px-3.5 py-1.5 rounded-full text-[12px] font-medium"
            style={{
              background: "rgba(200,16,46,0.1)",
              border: "1px solid rgba(200,16,46,0.2)",
              color: "#E8173A",
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#C8102E] animate-pulse inline-block" />
            Built for Canadian cardholders
          </div>

          {/* Headline */}
          <h1 className="display gradient-text-warm mb-5">
            Every dollar,<br />maximized.
          </h1>

          <p className="text-[17px] leading-relaxed max-w-[420px] mx-auto"
            style={{ color: "var(--text-secondary)" }}
          >
            Tell us what you&apos;re buying. We rank your cards by real dollar value returned — not just points.
          </p>
        </div>

        {/* Optimizer card */}
        <div className="fade-up-1">
          <OptimizerForm />
        </div>

        {/* Footer hint */}
        <p className="text-center text-[13px] mt-10 fade-up-2" style={{ color: "var(--text-tertiary)" }}>
          No cards yet?{" "}
          <a href="/wallet" className="transition-colors hover:text-white/70" style={{ color: "var(--text-secondary)" }}>
            Build your wallet →
          </a>
        </p>

        {/* Stats row */}
        <div className="mt-16 grid grid-cols-3 gap-px rounded-2xl overflow-hidden fade-up-3"
          style={{ background: "var(--border-dim)", border: "1px solid var(--border-dim)" }}
        >
          {[
            { value: "40+", label: "Canadian cards" },
            { value: "100%", label: "Free, no login" },
            { value: "CAD", label: "Dollar values" },
          ].map(({ value, label }) => (
            <div key={label} className="flex flex-col items-center justify-center py-5 gap-0.5"
              style={{ background: "var(--bg-elevated)" }}
            >
              <span className="text-2xl font-bold tracking-tight text-white">{value}</span>
              <span className="label-xs" style={{ color: "var(--text-tertiary)" }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
