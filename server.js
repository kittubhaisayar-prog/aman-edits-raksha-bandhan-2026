import "dotenv/config";
import express from "express";
import multer from "multer";
import OpenAI, { toFile } from "openai";
import sharp from "sharp";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const GENERATED_DIR = path.join(PUBLIC_DIR, "generated");
const SHARES_FILE = path.join(__dirname, "shares.json");

await fs.mkdir(GENERATED_DIR, { recursive: true });
try { await fs.access(SHARES_FILE); } catch { await fs.writeFile(SHARES_FILE, "{}"); }

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 2 },
  fileFilter: (_req, file, cb) => {
    const ok = ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype);
    cb(ok ? null : new Error("Only JPG, JPEG, PNG and WebP are allowed."), ok);
  }
});
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

app.use(express.json({ limit: "20mb" }));
app.use(express.static(PUBLIC_DIR));

function absoluteBaseUrl(req) {
  return process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
}

async function makeReferenceComposite(brother, sister) {
  const width = 1600, height = 1000, gap = 40, panelW = (width - gap) / 2;
  const canvas = sharp({
    create: { width, height, channels: 4, background: { r: 255, g: 248, b: 232, alpha: 1 } }
  });
  const fit = async (buf) => sharp(buf).resize(panelW, 900, { fit: "cover", position: "centre" }).png().toBuffer();
  const [b, s] = await Promise.all([fit(brother.buffer), fit(sister.buffer)]);
  const labelSvg = (text) => Buffer.from(`<svg width="${panelW}" height="100"><rect width="100%" height="100%" fill="#5d0d1c"/><text x="50%" y="62" text-anchor="middle" font-family="Arial, sans-serif" font-size="38" font-weight="700" fill="#f4d889">${text}</text></svg>`);
  return canvas.composite([
    { input: b, left: 0, top: 0 }, { input: s, left: panelW + gap, top: 0 },
    { input: labelSvg("BROTHER"), left: 0, top: 900 }, { input: labelSvg("SISTER"), left: panelW + gap, top: 900 }
  ]).png().toBuffer();
}

async function addExactTypography(imageBuffer) {
  const svg = Buffer.from(`<svg width="1200" height="1500" viewBox="0 0 1200 1500">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5d0d1c" stop-opacity=".88"/><stop offset="1" stop-color="#5d0d1c" stop-opacity="0"/></linearGradient></defs>
    <rect x="0" y="0" width="1200" height="245" fill="url(#g)"/>
    <text x="600" y="78" text-anchor="middle" font-family="Noto Sans Devanagari, DejaVu Sans, sans-serif" font-size="54" font-weight="800" fill="#f4d889">रक्षा बंधन 2026</text>
    <text x="600" y="135" text-anchor="middle" font-family="Noto Sans Devanagari, DejaVu Sans, sans-serif" font-size="27" font-weight="600" fill="#fff7e8">भाई-बहन के पवित्र रिश्ते की हार्दिक शुभकामनाएं</text>
    <rect x="0" y="1410" width="1200" height="90" fill="#5d0d1c" fill-opacity=".82"/>
    <text x="600" y="1460" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="800" letter-spacing="4" fill="#f4d889">AMAN EDITS</text>
  </svg>`);
  return sharp(imageBuffer).resize(1200,1500,{fit:"cover"}).composite([{input:svg}]).jpeg({quality:94}).toBuffer();
}

app.post("/api/generate-raksha-bandhan", upload.fields([{name:"brother",maxCount:1},{name:"sister",maxCount:1}]), async (req,res) => {
  try {
    const brother = req.files?.brother?.[0], sister = req.files?.sister?.[0];
    if (!brother || !sister) return res.status(400).json({error:"Both brother and sister photos are required."});
    if (!openai) return res.status(503).json({error:"OPENAI_API_KEY is not configured on the server."});

    const reference = await makeReferenceComposite(brother, sister);
    const prompt = String(req.body.instructions || "Create a photorealistic Raksha Bandhan celebration using the reference image.").slice(0, 8000);

    const result = await openai.images.edit({
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
      image: await toFile(reference, "raksha-reference.png", { type: "image/png" }),
      prompt,
      size: "1024x1536",
      quality: process.env.OPENAI_IMAGE_QUALITY || "medium",
      output_format: "jpeg",
      n: 1
    });

    const b64 = result.data?.[0]?.b64_json;
    if (!b64) throw new Error("Image API returned no image data.");
    const finalBuffer = await addExactTypography(Buffer.from(b64, "base64"));
    const filename = `${crypto.randomUUID()}.jpg`;
    await fs.writeFile(path.join(GENERATED_DIR, filename), finalBuffer);
    res.json({ imageUrl: `${absoluteBaseUrl(req)}/generated/${filename}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({error: err?.message || "Image generation failed."});
  }
});

async function readShares(){ return JSON.parse(await fs.readFile(SHARES_FILE,"utf8")); }
async function writeShares(data){ await fs.writeFile(SHARES_FILE, JSON.stringify(data,null,2)); }

app.post("/api/create-greeting", async (req,res) => {
  try {
    const dataUrl = req.body?.imageData;
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) return res.status(400).json({error:"A generated image is required."});
    const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
    if (!match) return res.status(400).json({error:"Unsupported image data."});
    const buffer = Buffer.from(match[2], "base64");
    if (buffer.length > 15 * 1024 * 1024) return res.status(413).json({error:"Image is too large."});
    const id = crypto.randomBytes(8).toString("hex");
    const filename = `${id}.jpg`;
    await fs.writeFile(path.join(GENERATED_DIR, filename), await sharp(buffer).jpeg({quality:92}).toBuffer());
    const shares = await readShares();
    shares[id] = { filename, createdAt: new Date().toISOString() };
    await writeShares(shares);
    res.json({id, url:`${absoluteBaseUrl(req)}/g/${id}`});
  } catch (err) { console.error(err); res.status(500).json({error:"Could not create greeting link."}); }
});

app.get("/g/:id", async (req,res) => {
  const shares = await readShares();
  const item = shares[req.params.id];
  if (!item) return res.status(404).send("Greeting not found.");
  const safeImage = `/generated/${encodeURIComponent(item.filename)}`;
  res.type("html").send(`<!doctype html><html lang="hi"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#5d0d1c"><title>Happy Raksha Bandhan 2026 ❤️</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#5d0d1c;color:#fff7e8;font-family:Arial,sans-serif;padding:18px;box-sizing:border-box}main{text-align:center;width:min(720px,100%)}h1{font-size:clamp(28px,7vw,48px);margin:0 0 8px}p{color:#f4d889;margin:0 0 18px}img{width:100%;border-radius:22px;display:block;box-shadow:0 25px 70px #26030b}small{display:block;margin-top:16px;opacity:.8;letter-spacing:3px}</style></head><body><main><h1>आपके लिए एक खास Raksha Bandhan शुभकामना ❤️</h1><p>Happy Raksha Bandhan 2026!</p><img src="${safeImage}" alt="Raksha Bandhan 2026 greeting"><small>AMAN EDITS</small></main></body></html>`);
});

app.use((err,_req,res,_next) => {
  console.error(err);
  res.status(400).json({error: err?.message || "Request failed."});
});

app.listen(PORT,()=>console.log(`Aman Edits running at http://localhost:${PORT}`));
