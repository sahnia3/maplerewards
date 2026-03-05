import { OptimizerForm } from "@/components/optimizer-form";

export default function Home() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      {/* Hero */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass border border-white/10 text-sm text-muted-foreground mb-6">
          <span>🍁</span>
          <span>Built for Canadians</span>
        </div>
        <h1 className="text-5xl font-bold leading-tight tracking-tight mb-4">
          <span className="gradient-text">Maximize Your</span>
          <br />
          <span className="text-white">Points Value</span>
        </h1>
        <p className="text-muted-foreground text-lg max-w-md mx-auto leading-relaxed">
          Tell us what you&apos;re buying. We&apos;ll tell you which card in your wallet earns the most.
        </p>
      </div>

      {/* Optimizer */}
      <OptimizerForm />

      {/* Footer hint */}
      <p className="text-center text-muted-foreground text-sm mt-10">
        No cards yet?{" "}
        <a href="/wallet" className="text-[#C8102E] hover:underline">
          Add cards to your wallet →
        </a>
      </p>
    </div>
  );
}
