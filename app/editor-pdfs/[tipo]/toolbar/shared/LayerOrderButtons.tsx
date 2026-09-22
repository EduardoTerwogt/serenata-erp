'use client'

import { Button } from '@/components/ui/Button'

interface LayerOrderButtonsProps {
  onBringToFront: () => void
  onSendToBack: () => void
}

/** Dentro de `PositionPopover` (un elemento) y de `MultiSelectToolbar` (selección extendida). */
export function LayerOrderButtons({ onBringToFront, onSendToBack }: LayerOrderButtonsProps) {
  return (
    <div className="flex gap-1.5">
      <Button variant="secondary" size="md" iconLeft="bring-to-front" onClick={onBringToFront} className="flex-1">
        Al frente
      </Button>
      <Button variant="secondary" size="md" iconLeft="send-to-back" onClick={onSendToBack} className="flex-1">
        Al fondo
      </Button>
    </div>
  )
}
