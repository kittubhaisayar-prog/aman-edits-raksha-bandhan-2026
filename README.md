# Aman Edits – Raksha Bandhan 2026

Production-style vanilla HTML/CSS/JS + Node/Express backend.

## 1) Requirements
- Node.js 20+
- An OpenAI API key with access to an image-generation/editing model

## 2) Folder structure
aman-edits-raksha-bandhan-2026/
  index.html
  server.js
  package.json
  .env.example

The server serves `index.html` from the `public/` folder. For the simplest setup, put `index.html` inside a folder named `public/`.

Recommended structure:
  server.js
  package.json
  .env
  public/
    index.html
    generated/

## 3) Setup
Move `index.html` into `public/`.

Then:
```bash
npm install
```

Copy `.env.example` to `.env` and put the API key ONLY in `.env`:
```env
OPENAI_API_KEY=sk-...
```

Never commit `.env` to GitHub.

Run:
```bash
npm start
```

Open:
http://localhost:3000

## 4) How the AI flow works
1. Browser validates and previews the two photos.
2. Browser sends both photos to `POST /api/generate-raksha-bandhan`.
3. Server creates a single labeled reference composite from the two photos.
4. Server calls the OpenAI image editing endpoint with the reference image and the festive prompt.
5. Server adds exact Hindi typography and the AMAN EDITS watermark.
6. Server stores the result in `public/generated/` and returns its URL.
7. Browser displays and downloads the final image.

The browser never receives the OpenAI secret key.

## 5) Demo without backend/API
If the page is opened directly as a standalone `file://.../index.html`, the upload UI still works. Clicking Generate falls back to a local canvas demo poster. It is NOT AI-generated.

For real AI generation, run the Node server.

## 6) Greeting links
`POST /api/create-greeting` stores a generated image and returns:
```json
{
  "id": "abc123...",
  "url": "http://localhost:3000/g/abc123..."
}
```

Local links work on the same machine/network context. For links that other people can open from their phones, deploy the server to a public HTTPS host and set:
```env
PUBLIC_BASE_URL=https://your-domain.com
```

For serious production use, replace `shares.json` and local image storage with a proper database/object-storage system.

## 7) Security notes
- API key is server-side only.
- Uploads are memory-buffered and size/type limited.
- User prompt text is length-limited.
- Share IDs use cryptographically secure random bytes.
- Do not expose `.env`.
- Add authentication/rate limiting, moderation, retention rules and persistent storage before public launch.
