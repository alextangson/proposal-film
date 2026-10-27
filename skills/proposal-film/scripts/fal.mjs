#!/usr/bin/env node
// Minimal fal.ai runner for a proposal film. Node 18+, no dependencies. The key comes ONLY from the FAL_KEY env var.
//
//   node scripts/fal.mjs shot    --first a.png --last b.png --prompt prompt.txt --duration 6 [--res 480p] --out clips/C01-t1.mp4
//   node scripts/fal.mjs upscale --video clips/C01-t1.mp4 [--factor 2.25] [--model "Starlight Precise 2.6"] --out up/C01.mp4
//   node scripts/fal.mjs sfx     --text "rain on a window at night" --seconds 8 [--loop] --out sfx/rain.mp3
//   node scripts/fal.mjs fetch   --endpoint <endpoint> --request-id <id> --out <file>   (recover a paid request)
//
// Every paid request prints an estimate first and needs --yes to submit. --out is never overwritten: give each new
// take its own name (C01-t2.mp4 ...). Before the paid POST the take is reserved in <out>.pending.json; the request_id
// goes there and into requests.jsonl before waiting, so a rerun refuses to pay twice and `fetch` collects the result.
// Uploaded inputs get a fal CDN URL that anyone holding the URL can open: do not upload real photos you want private.
import fs from "node:fs/promises";
import path from "node:path";

const MODES = {
  shot: { endpoint: "bytedance/seedance-2.5/image-to-video", price: (a) => (a.res === "480p" ? a.duration * 0.22 : a.res === "1080p" ? a.duration * 1.16 : null) },
  upscale: { endpoint: "topaz/upscale/video/generative", price: () => null },
  sfx: { endpoint: "fal-ai/elevenlabs/sound-effects/v2", price: (a) => a.seconds * 0.002 },
};

function parseArgs(argv) {
  const [mode, ...rest] = argv;
  const a = { mode };
  for (let i = 0; i < rest.length; i++) {
    const k = rest[i].replace(/^--/, "");
    if (["yes", "loop", "audio"].includes(k)) a[k] = true;
    else { if (rest[i + 1] === undefined) die(`--${k} needs a value`); a[k] = rest[++i]; }
  }
  return a;
}

function die(msg) { console.error(`error: ${msg}`); process.exit(1); }
const need = (a, ...keys) => keys.forEach((k) => a[k] ?? die(`--${k} is required for "${a.mode}"`));
const exists = (p) => fs.access(p).then(() => true, () => false);
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4" };

function client(key) {
  const auth = { Authorization: `Key ${key}` };
  async function http(url, init = {}) {
    const res = await fetch(url, { ...init, headers: { ...auth, ...init.headers } });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status} from ${url}: ${text.slice(0, 400)}`);
    return JSON.parse(text);
  }
  async function upload(file) {
    const type = MIME[path.extname(file).toLowerCase()] ?? die(`unsupported file type: ${file}`);
    const init = await http("https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content_type: type, file_name: path.basename(file) }),
    });
    const put = await fetch(init.upload_url, { method: "PUT", headers: { "Content-Type": type }, body: await fs.readFile(file) });
    if (!put.ok) throw new Error(`upload of ${file} failed: ${put.status}`);
    return init.file_url;
  }
  const submit = (endpoint, body) => http(`https://queue.fal.run/${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  async function wait(endpoint, id) {
    const base = `https://queue.fal.run/${endpoint.split("/").slice(0, 2).join("/")}/requests/${id}`;
    for (;;) {
      const st = await http(`${base}/status`);
      if (st.status === "COMPLETED") return http(base);
      if (!["IN_QUEUE", "IN_PROGRESS"].includes(st.status)) throw new Error(`request ${id} ended with ${JSON.stringify(st).slice(0, 300)}`);
      process.stderr.write(".");
      await new Promise((r) => setTimeout(r, 8000));
    }
  }
  return { upload, submit, wait };
}

// All checks run before the price estimate, so a bad argument never reaches a paid request.
async function validate(a) {
  if (a.mode === "shot") {
    need(a, "first", "last", "prompt", "duration");
    a.res = (a.res ?? "480p").toLowerCase();
    if (!["480p", "720p", "1080p"].includes(a.res)) die("--res must be 480p, 720p or 1080p");
    a.duration = Number(a.duration);
    if (!Number.isInteger(a.duration) || a.duration < 4 || a.duration > 30) die("--duration must be a whole number of seconds, 4-30");
    for (const f of [a.first, a.last, a.prompt]) if (!(await exists(f))) die(`${f} not found`);
  } else if (a.mode === "upscale") {
    need(a, "video");
    a.factor = Number(a.factor ?? 2.25);
    if (!Number.isFinite(a.factor) || a.factor <= 1 || a.factor > 4) die("--factor must be a number above 1 and at most 4");
    if (!(await exists(a.video))) die(`${a.video} not found`);
  } else {
    need(a, "text", "seconds");
    a.seconds = Number(a.seconds);
    if (!Number.isFinite(a.seconds) || a.seconds < 0.5 || a.seconds > 22) die("--seconds must be a number from 0.5 to 22");
  }
}

async function buildBody(fal, a) {
  if (a.mode === "shot") {
    return { prompt: await fs.readFile(a.prompt, "utf8"), image_url: await fal.upload(a.first), end_image_url: await fal.upload(a.last),
      resolution: a.res, duration: String(a.duration), generate_audio: Boolean(a.audio) };
  }
  if (a.mode === "upscale") return { video_url: await fal.upload(a.video), model: a.model ?? "Starlight Precise 2.6", upscale_factor: a.factor, H264_output: true };
  return { text: a.text, duration_seconds: a.seconds, prompt_influence: 0.5, output_format: "mp3_44100_192", ...(a.loop ? { loop: true } : {}) };
}

async function download(result, out) {
  const url = result.video?.url ?? result.audio?.url ?? result.audio_file?.url;
  if (!url) throw new Error(`no output url in result: ${JSON.stringify(result).slice(0, 300)}`);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download failed: ${r.status}`);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, Buffer.from(await r.arrayBuffer()), { flag: "wx" });
  console.log(`saved ${out}`);
}

async function run() {
  const a = parseArgs(process.argv.slice(2));
  if (!["shot", "upscale", "sfx", "fetch"].includes(a.mode)) die("mode must be shot | upscale | sfx | fetch (see the header of this file)");
  need(a, "out");
  if (await exists(a.out)) die(`${a.out} already exists - never overwrite a take, pick a new name`);
  const pending = `${a.out}.pending.json`;
  const key = process.env.FAL_KEY ?? die("set FAL_KEY in your environment (https://fal.ai/dashboard/keys)");
  const fal = client(key);
  if (a.mode === "fetch") {
    need(a, "endpoint", "request-id");
    await download(await fal.wait(a.endpoint, a["request-id"]), a.out);
    return fs.rm(pending, { force: true });
  }
  if (await exists(pending)) {
    die(`${a.out} already has a paid request in flight or unresolved:\n${await fs.readFile(pending, "utf8")}\n` +
      "Collect it with `fetch` (if it has a request_id) or check the fal dashboard. Delete that file only once you are sure nothing was billed.");
  }

  await validate(a);
  const { endpoint, price } = MODES[a.mode];
  const est = price(a);
  console.log(`${endpoint}: estimated ${est == null ? "unknown here - check the price on the fal model page" : `$${est.toFixed(3)}`}${a.mode === "upscale" ? " (Starlight was about $0.12 per output second in 2026-10)" : ""}`);
  if (!a.yes) return console.log("dry run - add --yes to submit and pay");

  const body = await buildBody(fal, a);
  await fs.mkdir(path.dirname(a.out), { recursive: true });
  // Reserve the take before the paid POST: a second run, or a crash during submit, can never silently pay twice.
  await fs.writeFile(pending, JSON.stringify({ at: new Date().toISOString(), endpoint, request_id: null, note: "submitting; if request_id stays null, check the fal dashboard" }, null, 1), { flag: "wx" });
  const sub = await fal.submit(endpoint, body);
  console.log(`submitted ${sub.request_id}`);
  const record = { at: new Date().toISOString(), endpoint, request_id: sub.request_id, out: a.out };
  await fs.writeFile(pending, JSON.stringify(record, null, 1));
  await fs.appendFile("requests.jsonl", JSON.stringify(record) + "\n");
  await download(await fal.wait(endpoint, sub.request_id), a.out);
  await fs.rm(pending, { force: true });
}

run().catch((e) => {
  console.error(`\nerror: ${e.message}`);
  console.error("Do NOT resubmit a paid request: if a request_id was printed (also in <out>.pending.json), run `fetch` with it; otherwise check the fal dashboard.");
  process.exit(1);
});
