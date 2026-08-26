const originalConfirm = window.confirm.bind(window)

window.confirm = message => {
  const text = String(message || '')
  if (/^Delete page \d+ from this book\?$/.test(text)) return true
  return originalConfirm(message)
}
