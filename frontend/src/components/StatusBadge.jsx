const STATUS_COLORS = {
  pending:   'bg-yellow-100 text-yellow-700',
  published: 'bg-green-100 text-green-700',
  removed:   'bg-red-100 text-red-700',
}

export default function StatusBadge({ status }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  )
}
