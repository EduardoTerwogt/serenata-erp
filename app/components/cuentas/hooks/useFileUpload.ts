'use client'

import { useState, useCallback } from 'react'

interface UploadState {
  uploading: boolean
  error: string | null
  success: boolean
}

export function useFileUpload() {
  const [state, setState] = useState<UploadState>({
    uploading: false,
    error: null,
    success: false,
  })

  const reset = useCallback(() => {
    setState({ uploading: false, error: null, success: false })
  }, [])

  const upload = useCallback(async (fn: () => Promise<unknown>) => {
    setState({ uploading: true, error: null, success: false })
    try {
      const result = await fn()
      setState({ uploading: false, error: null, success: true })
      return result
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al subir archivo'
      setState({ uploading: false, error: msg, success: false })
      throw err
    }
  }, [])

  return { ...state, upload, reset }
}
