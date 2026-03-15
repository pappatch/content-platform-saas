/**
 * Shared AI score badge.
 * midThreshold — score below this shows yellow (default 0.5 = auto-publish threshold).
 * CMS article lists may pass midThreshold={0.4} for a more lenient display.
 */
export default function AiScoreBadge({ score, midThreshold = 0.5 }) {
  if (score == null) return <span className="text-xs text-gray-400">—</span>
  const pct = Math.round(score * 100)
  const cls =
    score >= 0.7
      ? 'bg-green-100 text-green-700'
      : score >= midThreshold
      ? 'bg-yellow-100 text-yellow-700'
      : 'bg-red-100 text-red-700'
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {pct}%
    </span>
  )
}
