export function safeFileName(input: string): string {
  const cleaned = input
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return cleaned || 'picbook-scene'
}

export function downloadTextFile(input: { text: string; fileName: string; mimeType: string }) {
  const blob = new Blob([input.text], { type: input.mimeType })
  const url = URL.createObjectURL(blob)
  downloadUrl(url, input.fileName)
  URL.revokeObjectURL(url)
}

export function downloadUrl(url: string, fileName: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
}

export function downloadDataUrl(dataUrl: string, fileName: string) {
  downloadUrl(dataUrl, fileName)
}
