import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getUsers, updateUser } from '../../services/users'
import { useAuth } from '../../hooks/useAuth'
import UserModal from './UserModal'
import Spinner from '../../components/Spinner'
import { formatDate } from '../../utils/formatDate'

const ROLE_BADGE = {
  admin:  'bg-indigo-100 text-indigo-700',
  editor: 'bg-emerald-100 text-emerald-700',
  viewer: 'bg-gray-100 text-gray-600',
}

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-6 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? 'bg-indigo-600' : 'bg-gray-300'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

export default function Users() {
  const qc = useQueryClient()
  const { user: me } = useAuth()
  const [showModal, setShowModal] = useState(false)
  const [togglingId, setTogglingId] = useState(null)

  const { data: users = [], isLoading, isError } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
  })

  const patch = useMutation({
    mutationFn: ({ id, data }) => updateUser(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onSettled: () => setTogglingId(null),
  })

  async function handleToggleActive(user) {
    setTogglingId(user.id)
    patch.mutate({ id: user.id, data: { is_active: !user.is_active } })
  }

  if (isLoading) return <Spinner />
  if (isError) return <p className="text-sm text-red-600">Failed to load users.</p>

  const active = users.filter((u) => u.is_active).length

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {active} active{users.length - active > 0 ? `, ${users.length - active} inactive` : ''}
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>+ New User</button>
      </div>

      {users.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-400 text-sm mb-4">No users yet.</p>
          <button className="btn-primary" onClick={() => setShowModal(true)}>Create your first user</button>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium text-gray-600">User</th>
                <th className="px-4 py-3 font-medium text-gray-600">Role</th>
                <th className="px-4 py-3 font-medium text-gray-600">Joined</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-center">Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map((user) => {
                const isMe = user.id === me?.id
                const isToggling = togglingId === user.id
                return (
                  <tr
                    key={user.id}
                    className={`transition-colors ${user.is_active ? 'hover:bg-gray-50' : 'bg-gray-50/50 opacity-70'}`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">
                        {user.full_name || <span className="text-gray-400 italic">No name</span>}
                        {isMe && (
                          <span className="ml-2 text-xs font-normal bg-indigo-50 text-indigo-500 rounded px-1.5 py-0.5">
                            you
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400">{user.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${ROLE_BADGE[user.role] ?? 'bg-gray-100 text-gray-600'}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(user.created_at, { showTime: false, showYear: true })}</td>
                    <td className="px-4 py-3 text-center">
                      <Toggle
                        checked={user.is_active}
                        disabled={isMe || isToggling}
                        onChange={() => handleToggleActive(user)}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && <UserModal onClose={() => setShowModal(false)} />}
    </div>
  )
}
