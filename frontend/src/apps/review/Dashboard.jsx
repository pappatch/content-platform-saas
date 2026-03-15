import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateArticle } from '../../services/articles'
import ReviewQueue from './ReviewQueue'
import ArticlePreviewModal from './ArticlePreviewModal'
import ConfirmDialog from '../../components/ConfirmDialog'

/**
 * ReviewDashboard — entry point for /review.
 *
 * Owns:
 *   - approveMut  PATCH status=published
 *   - rejectMut   PATCH status=removed
 *   - previewId   which article the preview modal is showing
 *   - confirmRejectId  which article the reject confirm is for
 *
 * Passes callbacks down to ReviewQueue and ArticlePreviewModal so both the
 * table row buttons and the modal footer buttons share the same mutations.
 */
export default function ReviewDashboard() {
  const qc = useQueryClient()
  const [previewId, setPreviewId] = useState(null)
  const [confirmRejectId, setConfirmRejectId] = useState(null)

  // ── Approve: PATCH /cms/articles/{id}  { status: 'published' } ───────────
  const approveMut = useMutation({
    mutationFn: (id) => updateArticle(id, { status: 'published' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['review-articles'] })
      qc.invalidateQueries({ queryKey: ['cms-articles'] })
      setPreviewId(null)
    },
  })

  // ── Reject: PATCH /cms/articles/{id}  { status: 'removed' } ─────────────
  const rejectMut = useMutation({
    mutationFn: (id) => updateArticle(id, { status: 'removed' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['review-articles'] })
      qc.invalidateQueries({ queryKey: ['cms-articles'] })
      setConfirmRejectId(null)
      setPreviewId(null)
    },
  })

  // approvePendingId lets ReviewQueue disable only the specific row being approved
  const approvePendingId = approveMut.isPending ? approveMut.variables : null

  function handleApprove(id) {
    approveMut.mutate(id)
  }

  function handleRejectRequest(id) {
    setConfirmRejectId(id)
  }

  function handleRejectConfirmed() {
    rejectMut.mutate(confirmRejectId)
  }

  return (
    <>
      <ReviewQueue
        onPreviewRequest={setPreviewId}
        onRejectRequest={handleRejectRequest}
        onApprove={handleApprove}
        approvePendingId={approvePendingId}
      />

      {previewId != null && (
        <ArticlePreviewModal
          articleId={previewId}
          onApprove={handleApprove}
          onRejectRequest={handleRejectRequest}
          approvePending={approveMut.isPending}
          rejectPending={rejectMut.isPending}
          onClose={() => setPreviewId(null)}
        />
      )}

      {confirmRejectId != null && (
        <ConfirmDialog
          title="Reject article?"
          message="This will mark the article as removed. It won't appear on the site."
          confirmLabel="Reject"
          loading={rejectMut.isPending}
          onConfirm={handleRejectConfirmed}
          onCancel={() => setConfirmRejectId(null)}
        />
      )}
    </>
  )
}
