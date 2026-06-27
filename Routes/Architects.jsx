import { useEffect, useState } from 'react'
import * as api from '../api'

export default function Architects() {
  const [architects, setArchitects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => { loadArchitects() }, [])

  async function loadArchitects() {
    setLoading(true)
    const data = await api.getArchitects()
    if (data.error) setError(data.error)
    else setArchitects(data)
    setLoading(false)
  }

  function handleCreated(architect) {
    setArchitects(prev => [architect, ...prev])
    setShowCreate(false)
    loadArchitects() // re-fetch so inline-created POCs show up
  }

  function handleUpdated(updated) {
    setArchitects(prev => prev.map(a => a.id === updated.id ? { ...a, ...updated } : a))
  }

  function handleDeleted(id) {
    setArchitects(prev => prev.filter(a => a.id !== id))
  }

  return (
    <div className="min-h-screen bg-surface bg-texture">
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-serif text-2xl text-ink">Architects / PMC</h2>
          <p className="text-xs text-ink-dim mt-0.5">{architects.length} architect{architects.length === 1 ? '' : 's'}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-brand-500 hover:bg-brand-600 text-surface text-sm font-medium px-4 py-2 rounded-lg transition"
        >
          + Add Architect / PMC
        </button>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {loading ? (
        <p className="text-sm text-ink-dim">Loading architects...</p>
      ) : architects.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-surface-border rounded-card">
          <p className="text-sm text-ink-dim">No architects/PMCs yet.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="text-sm text-brand-600 font-medium mt-2 hover:underline"
          >
            Add your first architect / PMC
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {architects.map(architect => (
            <ArchitectCard
              key={architect.id}
              architect={architect}
              expanded={expandedId === architect.id}
              onToggle={() => setExpandedId(expandedId === architect.id ? null : architect.id)}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
              onPocsChanged={loadArchitects}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <ArchitectModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
    </div>
  )
}

function ArchitectCard({ architect, expanded, onToggle, onUpdated, onDeleted, onPocsChanged }) {
  const [showEdit, setShowEdit] = useState(false)
  const [showAddPoc, setShowAddPoc] = useState(false)
  const primaryPoc = architect.architect_pocs?.find(p => p.is_primary) || architect.architect_pocs?.[0]

  async function handleDelete() {
    if (!confirm(`Delete "${architect.company_name}"? This cannot be undone.`)) return
    await api.deleteArchitect(architect.id)
    onDeleted(architect.id)
  }

  async function handleDeletePoc(pocId) {
    await api.deletePoc(pocId)
    onPocsChanged()
  }

  return (
    <div className="bg-surface-card border border-surface-border rounded-card overflow-hidden">
      <div
        className="p-4 cursor-pointer flex items-center justify-between"
        onClick={onToggle}
      >
        <div>
          <p className="text-sm font-medium text-ink">{architect.company_name}</p>
          <p className="text-xs text-ink-dim mt-0.5">
            {primaryPoc ? primaryPoc.poc_name : 'No POC added yet'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); setShowEdit(true) }}
            className="text-xs text-ink-dim hover:text-ink border border-surface-border rounded-xl px-2.5 py-1"
          >
            Edit
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete() }}
            className="text-xs text-red-600 hover:text-red-700 border border-red-200 rounded-lg px-2.5 py-1"
          >
            Delete
          </button>
          <span className="text-ink-faint text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-surface-border px-4 py-3 bg-surface/40">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-ink-dim">POCs</p>
            <button
              onClick={() => setShowAddPoc(true)}
              className="text-xs text-brand-600 hover:underline"
            >
              + Add POC
            </button>
          </div>

          {(!architect.architect_pocs || architect.architect_pocs.length === 0) ? (
            <p className="text-xs text-ink-faint">No POCs added</p>
          ) : (
            <div className="space-y-2">
              {architect.architect_pocs.map(poc => (
                <div key={poc.id} className="flex items-center justify-between bg-surface border border-surface-border rounded-xl px-3 py-2">
                  <div>
                    <p className="text-xs font-medium text-ink">
                      {poc.poc_name} {poc.is_primary && <span className="text-brand-600">(Primary)</span>}
                    </p>
                    <p className="text-xs text-ink-dim">
                      {poc.phone_number || poc.email || 'No contact info'}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeletePoc(poc.id)}
                    className="text-xs text-ink-faint hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showEdit && (
        <ArchitectModal
          architect={architect}
          onClose={() => setShowEdit(false)}
          onUpdated={(updated) => { onUpdated(updated); setShowEdit(false) }}
        />
      )}

      {showAddPoc && (
        <PocModal
          architectId={architect.id}
          onClose={() => setShowAddPoc(false)}
          onAdded={() => { onPocsChanged(); setShowAddPoc(false) }}
        />
      )}
    </div>
  )
}

function emptyPoc() {
  return { poc_name: '', email: '', phone_number: '', is_primary: false }
}

function ArchitectModal({ architect, onClose, onCreated, onUpdated }) {
  const isEdit = !!architect
  const [form, setForm] = useState({
    company_name: architect?.company_name || '',
  })
  // Inline optional POCs, only used at creation time (edit flow uses the
  // existing add/remove-POC UI on the expanded card instead).
  const [pocs, setPocs] = useState(isEdit ? [] : [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function addPocRow() {
    setPocs(prev => [...prev, emptyPoc()])
  }

  function updatePocRow(index, field, value) {
    setPocs(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p))
  }

  function removePocRow(index) {
    setPocs(prev => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit() {
    if (!form.company_name.trim()) return setError('Architect/PMC name is required')
    setLoading(true)
    setError('')
    try {
      const payload = isEdit ? form : { ...form, pocs: pocs.filter(p => p.poc_name.trim()) }
      const result = isEdit
        ? await api.updateArchitect(architect.id, payload)
        : await api.createArchitect(payload)
      if (result.error) throw new Error(result.error)
      isEdit ? onUpdated(result) : onCreated(result)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-surface-card border border-surface-border rounded-card p-6 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
        <h3 className="font-serif text-xl text-ink mb-4">
          {isEdit ? 'Edit Architect / PMC' : 'Add Architect / PMC'}
        </h3>

        <div className="space-y-3">
          <Field label="Architect / PMC Name" value={form.company_name} onChange={v => setForm({ ...form, company_name: v })} placeholder="e.g. ABC Architects" />
        </div>

        {!isEdit && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-ink-dim">POCs (optional)</p>
              <button onClick={addPocRow} className="text-xs text-brand-600 hover:underline">
                + Add POC
              </button>
            </div>
            <div className="space-y-3">
              {pocs.map((poc, i) => (
                <div key={i} className="border border-surface-border rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-ink-faint">POC {i + 1}</p>
                    <button onClick={() => removePocRow(i)} className="text-xs text-ink-faint hover:text-red-600">Remove</button>
                  </div>
                  <Field label="Name" value={poc.poc_name} onChange={v => updatePocRow(i, 'poc_name', v)} />
                  <Field label="Phone" value={poc.phone_number} onChange={v => updatePocRow(i, 'phone_number', v)} optional />
                  <Field label="Email" value={poc.email} onChange={v => updatePocRow(i, 'email', v)} optional type="email" />
                  <label className="flex items-center gap-2 text-xs text-ink-dim">
                    <input type="checkbox" checked={poc.is_primary} onChange={e => updatePocRow(i, 'is_primary', e.target.checked)} />
                    Set as primary contact
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 text-sm text-ink-dim border border-surface-border rounded-xl py-2">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 text-sm text-surface bg-brand-500 hover:bg-brand-600 rounded-lg py-2 disabled:opacity-50"
          >
            {loading ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Architect / PMC'}
          </button>
        </div>
      </div>
    </div>
  )
}

function PocModal({ architectId, onClose, onAdded }) {
  const [form, setForm] = useState(emptyPoc())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (!form.poc_name.trim()) return setError('POC name is required')
    setLoading(true)
    setError('')
    try {
      const result = await api.addPoc(architectId, form)
      if (result.error) throw new Error(result.error)
      onAdded(result)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-surface-card border border-surface-border rounded-card p-6 w-full max-w-md shadow-xl">
        <h3 className="font-serif text-xl text-ink mb-4">Add POC</h3>

        <div className="space-y-3">
          <Field label="POC Name" value={form.poc_name} onChange={v => setForm({ ...form, poc_name: v })} />
          <Field label="Phone Number" value={form.phone_number} onChange={v => setForm({ ...form, phone_number: v })} optional />
          <Field label="Email" value={form.email} onChange={v => setForm({ ...form, email: v })} optional type="email" />
          <label className="flex items-center gap-2 text-xs text-ink-dim">
            <input
              type="checkbox"
              checked={form.is_primary}
              onChange={e => setForm({ ...form, is_primary: e.target.checked })}
            />
            Set as primary contact
          </label>
        </div>

        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 text-sm text-ink-dim border border-surface-border rounded-xl py-2">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 text-sm text-surface bg-brand-500 hover:bg-brand-600 rounded-lg py-2 disabled:opacity-50"
          >
            {loading ? 'Adding...' : 'Add POC'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, optional, type = 'text', placeholder }) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink-dim mb-1">
        {label} {optional && <span className="text-ink-faint">(optional)</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-surface-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
      />
    </div>
  )
}
