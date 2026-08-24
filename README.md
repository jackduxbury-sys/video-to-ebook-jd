# Video → eBook (Netlify)

A Netlify-ready React/Vite app that turns a local video into a picture-based eBook.

## What Version 1 does

- Upload a video in the browser (the raw video is not sent to Netlify).
- Extract a still frame every 0.5 / 1 / 2 / 3 / 5 seconds.
- Compress frames before upload.
- Delete unwanted frames.
- Drag frames to reorder pages.
- Add optional captions.
- Publish selected frames to Netlify Blobs.
- Store a persistent book manifest in Netlify Blobs.
- Show all published books in a library.
- Read books in a large, touch-friendly reader with keyboard arrows and swipe navigation.
- Delete a book and its stored pages.

## Run locally

```bash
npm install
npm run dev
```

The project includes `@netlify/vite-plugin`, so Vite can emulate Netlify Functions and Blobs locally.

## Deploy to Netlify

1. Put this folder in a GitHub repository.
2. In Netlify, choose **Add new project → Import an existing project**.
3. Select the GitHub repository.
4. Netlify should detect:
   - Build command: `npm run build`
   - Publish directory: `dist`
5. Deploy.

The `netlify.toml` file is already included.

## Storage design

Netlify Blobs store: `video-books`

- `manifests/<book-id>.json`
- `pages/<book-id>/<page-id>`

The raw uploaded video remains on the user's device. Only the final selected page images are uploaded.

## Important Version 1 notes

- This version does **not** include user login/password protection yet. Anyone who can access the editor page can create/delete books.
- Browser video decoding depends on the browser supporting the uploaded video codec. MP4/H.264 is the safest general choice.
- Page images are compressed client-side and the server rejects any individual page above 4 MB.
- The book cover is currently the first retained frame.

## Good next upgrades

1. Password-protected teacher/admin editor.
2. Public/private books.
3. Edit existing published books.
4. Pick any page as the cover.
5. Automatic scene-change detection.
6. Thumbnail strip in the reader.
7. Download/print a book as PDF.
8. Share/QR-code button for each book.
9. Collections/categories and search.
