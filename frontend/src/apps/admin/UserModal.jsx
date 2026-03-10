import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createUser } from '../../services/users'
import Modal from '../../components/Modal'

const EMPTY = { email: '', password: '', full_name: '', role: 'viewer' }

const ROLES = [
  { value: 'viewer',  label: 'Viewer',  desc: 'Can review articles' },
  { value: 'editor',  label: 'Editor',  desc: 'Can manage articles & categories' },
  { value: 'admin',   label: 'Admin',   desc: 'Full platform access' },
]

function FieldError({ msg }) {
  return msg ? <p className="mt-1 text-xs text-red-600">{msg}</p> : null
}

export default function UserModal({ onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})

  const mutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); onClose() },
    onError: (err) => {
      const detail = err.response?.data?.detail
      if (typeof detail === 'string') setErrors({ _general: detail })
      else if (Array.isArray(detail)) {
        const map = {}
        detail.forEach((d) => { const f = d.loc?.[d.loc.length - 1]; if (f) map[f] = d.msg })
        setErrors(map)
      }
    },
  })

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
    setErrors((e) => ({ ...e, [field]: undefined, _general: undefined }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    const next = {}
    if (!form.email.trim()) next.email = 'Required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = 'Invalid email'
    if (!form.password) next.password = 'Required'
    else if (form.password.length < 8) next.password = 'At least 8 characters'
    if (Object.keys(next).length) { setErrors(next); return }
    mutation.mutate({
      email: form.email.trim(),
      password: form.password,
      full_name: form.full_name.trim() || undefined,
      role: form.role,
    })
  }

  return (
    <Modal title="New User" onClose={onClose} size="sm">
      <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
        {errors._general && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {errors._general}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            className={`input-field ${errors.email ? 'border-red-400' : ''}`}
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            placeholder="user@example.com"
            autoComplete="off"
          />
          <FieldError msg={errors.email} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input
            type="password"
            className={`input-field ${errors.password ? 'border-red-400' : ''}`}
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
            placeholder="Min. 8 characters"
            autoComplete="new-password"
          />
          <FieldError msg={errors.password} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Full Name <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            className="input-field"
            value={form.full_name}
            onChange={(e) => set('full_name', e.target.value)}
            placeholder="Jane Doe"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
          <div className="space-y-2">
            {ROLES.map(({ value, label, desc }) => (
              <label key={value} className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="role"
                  value={value}
                  checked={form.role === value}
                  onChange={() => set('role', value)}
                  className="mt-0.5 accent-indigo-600"
                />
                <div>
                  <div className="text-sm font-medium text-gray-900">{label}</div>
                  <div className="text-xs text-gray-500">{desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="btn-primary">
            {mutation.isPending ? 'Creating…' : 'Create User'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
