export const PIN_DURATIONS = [
  { label: '1 day',   ms: 86_400_000 },
  { label: '1 week',  ms: 7 * 86_400_000 },
  { label: '1 month', ms: 30 * 86_400_000 },
]

/**
 * Duration picker for pinning an article to the top of a site.
 * pinLabel — title shown when article is not yet pinned (default "Pin article").
 */
export default function PinModal({ article, loading, onPin, onCancel, pinLabel = 'Pin article' }) {
  const isCurrentlyPinned =
    article.is_pinned || (article.pinned_until && new Date(article.pinned_until) > new Date())

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-1">
          {isCurrentlyPinned ? 'Unpin article?' : pinLabel}
        </h3>
        <p className="text-sm text-gray-500 mb-5 line-clamp-2">{article.title}</p>

        {isCurrentlyPinned ? (
          <>
            <p className="text-sm text-gray-600 mb-4">
              This article is currently pinned. Remove the pin?
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={onCancel} className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={() => onPin(0)}
                disabled={loading}
                className="px-4 py-2 text-sm rounded-lg bg-gray-800 text-white hover:bg-gray-900 disabled:opacity-50"
              >
                {loading ? 'Saving…' : 'Unpin'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-600 mb-3">Choose how long to feature this article at the top:</p>
            <div className="flex flex-col gap-2 mb-5">
              {PIN_DURATIONS.map(({ label, ms }) => (
                <button
                  key={ms}
                  onClick={() => onPin(ms)}
                  disabled={loading}
                  className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 text-sm font-medium text-gray-800 transition-colors disabled:opacity-50"
                >
                  {label}
                  <span className="float-right text-gray-400 font-normal">
                    until {new Date(Date.now() + ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <button onClick={onCancel} className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
