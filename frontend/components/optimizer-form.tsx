"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listCategories, optimize, ensureSession } from "@/lib/api";
import { RecommendationCard } from "@/components/recommendation-card";
import type { Category, CardRecommendation } from "@/lib/types";

export function OptimizerForm() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categorySlug, setCategorySlug] = useState("");
  const [spendAmount, setSpendAmount] = useState("");
  const [results, setResults] = useState<CardRecommendation[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catLoading, setCatLoading] = useState(true);

  useEffect(() => {
    listCategories()
      .then(setCategories)
      .catch(() => setError("Could not load categories"))
      .finally(() => setCatLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const sessionId = await ensureSession();
      const amount = parseFloat(spendAmount);
      if (isNaN(amount) || amount <= 0) throw new Error("Enter a valid spend amount");
      const recs = await optimize({ session_id: sessionId, category_slug: categorySlug, spend_amount: amount });
      setResults(recs);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full">
      {/* Form */}
      <form onSubmit={handleSubmit} className="glass rounded-2xl p-6 border border-white/8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          {/* Category */}
          <div className="sm:col-span-1">
            <label className="text-sm text-muted-foreground mb-2 block">Spend category</label>
            <Select value={categorySlug} onValueChange={setCategorySlug} disabled={catLoading}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white h-11">
                <SelectValue placeholder={catLoading ? "Loading..." : "Select category"} />
              </SelectTrigger>
              <SelectContent className="bg-[oklch(0.14_0.012_260)] border-white/10">
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.slug} className="text-white focus:bg-white/10">
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Amount */}
          <div className="sm:col-span-1">
            <label className="text-sm text-muted-foreground mb-2 block">Spend amount (CAD)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="100.00"
                value={spendAmount}
                onChange={(e) => setSpendAmount(e.target.value)}
                className="pl-7 bg-white/5 border-white/10 text-white placeholder:text-muted-foreground h-11"
              />
            </div>
          </div>

          {/* Submit */}
          <div className="sm:col-span-1">
            <Button
              type="submit"
              disabled={loading || !categorySlug || !spendAmount}
              className="w-full h-11 maple-gradient maple-glow text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Analyzing...
                </span>
              ) : (
                "Find Best Card →"
              )}
            </Button>
          </div>
        </div>

        {error && (
          <p className="mt-3 text-red-400 text-sm">{error}</p>
        )}
      </form>

      {/* Results */}
      {results !== null && (
        <div className="mt-8">
          {results.length === 0 ? (
            <div className="glass rounded-2xl p-10 border border-white/8 text-center">
              <div className="text-4xl mb-3">🍁</div>
              <p className="text-muted-foreground">No cards found for this category. Add cards to your wallet first.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold text-lg">
                  {results.length} card{results.length !== 1 ? "s" : ""} ranked
                </h2>
                <span className="text-muted-foreground text-sm">
                  For ${parseFloat(spendAmount).toFixed(2)} CAD spend
                </span>
              </div>
              <div className="flex flex-col gap-4">
                {results.map((rec, i) => (
                  <RecommendationCard key={rec.card_id} rec={rec} rank={i + 1} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
