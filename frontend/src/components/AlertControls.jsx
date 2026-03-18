/**
 * AlertControls — combines HealthThermometer + AlertBell with shared open state.
 *
 * The thermometer and bell are siblings — clicking the thermometer opens the
 * same dropdown as clicking the bell. Shared open state is managed here.
 *
 * Usage: drop <AlertControls /> into any layout header.
 */

import { useState } from 'react'
import HealthThermometer from './HealthThermometer'
import AlertBell from './AlertBell'

export default function AlertControls() {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex items-center gap-1">
      <HealthThermometer onToggle={() => setOpen(o => !o)} />
      <AlertBell isOpen={open} onOpenChange={setOpen} />
    </div>
  )
}
