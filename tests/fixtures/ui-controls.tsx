import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Select } from '../../src/components/ui/Select'
import { Tooltip } from '../../src/components/ui/Tooltip'
import Modal from '../../src/components/Modal'
import '../../src/styles.css'

const options = [
  { value: '20', label: '20 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '45', label: '45 minutes' },
  { value: '60', label: '60 minutes', disabled: true },
]

function ControlsFixture() {
  const [value, setValue] = useState('30')
  const [open, setOpen] = useState(false)
  return (
    <main style={{ padding: 24, maxWidth: 520, margin: 'auto' }}>
      <h1>Shared controls</h1>
      <p>Selected duration: {value}</p>
      <div style={{ display: 'grid', gap: 16, marginTop: 24 }}>
        <button type="button">Before duration</button>
        <Select label="Fixture duration" value={value} onValueChange={setValue} options={options} />
        <button type="button">After duration</button>
        <Tooltip content="Choose another variation">
          <button type="button" aria-label="Fixture swap">
            Swap movement
          </button>
        </Tooltip>
        <Tooltip content="Keep your logged sets. Swap before recording this movement.">
          <button type="button" aria-label="Unavailable swap" disabled>
            Unavailable swap
          </button>
        </Tooltip>
        <button type="button" onClick={() => setOpen(true)}>
          Open training dialog
        </button>
      </div>
      {open && (
        <Modal title="Training controls" onClose={() => setOpen(false)}>
          <div style={{ display: 'grid', gap: 16 }}>
            <Select
              label="Dialog duration"
              value={value}
              onValueChange={setValue}
              options={options}
            />
            <button type="button">After dialog duration</button>
            <Tooltip content="This stays above the dialog">
              <button type="button">Dialog help</button>
            </Tooltip>
          </div>
        </Modal>
      )}
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<ControlsFixture />)
