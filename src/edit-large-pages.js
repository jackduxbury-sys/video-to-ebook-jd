const elp = (selector, root = document) => root.querySelector(selector)

function addLargeEditStyles() {
  if (elp('#edit-large-pages-styles')) return
  const style = document.createElement('style')
  style.id = 'edit-large-pages-styles'
  style.textContent = `
    .book-edit-grid{
      grid-template-columns:repeat(auto-fit,minmax(440px,1fr))!important;
      gap:18px!important;
    }
    .book-edit-card{
      padding:14px!important;
    }
    .book-edit-card>img{
      width:100%!important;
      height:auto!important;
      aspect-ratio:auto!important;
      max-height:68vh!important;
      object-fit:contain!important;
      background:#ece7de!important;
      cursor:zoom-in!important;
      border-radius:12px!important;
    }
    .book-edit-caption{
      font-size:1rem!important;
      padding:11px 12px!important;
    }
    .book-edit-actions button,
    .page-narration-actions button{
      min-height:40px!important;
      font-size:.85rem!important;
    }
    .edit-page-zoom{
      position:fixed;
      inset:0;
      z-index:29000;
      display:grid;
      place-items:center;
      padding:24px;
      background:rgba(10,10,9,.92);
      backdrop-filter:blur(5px);
    }
    .edit-page-zoom-inner{
      position:relative;
      width:min(1200px,96vw);
      height:min(90vh,900px);
      display:grid;
      place-items:center;
    }
    .edit-page-zoom img{
      max-width:100%;
      max-height:100%;
      object-fit:contain;
      border-radius:10px;
      box-shadow:0 24px 80px rgba(0,0,0,.45);
      background:#fff;
    }
    .edit-page-zoom-close{
      position:absolute;
      top:0;
      right:0;
      transform:translate(35%,-35%);
      width:42px;
      height:42px;
      border-radius:999px;
      border:0;
      background:#fff;
      color:#222;
      font-size:1.2rem;
      font-weight:900;
      cursor:pointer;
      box-shadow:0 8px 24px rgba(0,0,0,.3);
    }
    @media(max-width:900px){
      .book-edit-grid{grid-template-columns:1fr!important}
      .book-edit-card>img{max-height:none!important}
    }
  `
  document.head.appendChild(style)
}

function openPageZoom(img) {
  if (!img?.src || document.querySelector('.edit-page-zoom')) return
  const overlay = document.createElement('div')
  overlay.className = 'edit-page-zoom'
  overlay.innerHTML = `<div class="edit-page-zoom-inner"><img src="${img.src}" alt="Enlarged page"><button type="button" class="edit-page-zoom-close" aria-label="Close enlarged page">×</button></div>`
  const close = () => overlay.remove()
  overlay.querySelector('.edit-page-zoom-close').onclick = close
  overlay.onclick = event => { if (event.target === overlay) close() }
  document.body.appendChild(overlay)
}

addLargeEditStyles()
document.addEventListener('click', event => {
  const img = event.target.closest?.('.book-edit-card > img')
  if (!img) return
  event.preventDefault()
  event.stopPropagation()
  openPageZoom(img)
}, true)

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') document.querySelector('.edit-page-zoom')?.remove()
})
