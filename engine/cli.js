#!/usr/bin/env node
/*
 * doc-to-ppt command line
 *   node engine/cli.js deck.json [style.json | theme-name] [out.pptx]
 * Needs: npm install   (pptxgenjs, jszip, sharp)
 */
const fs = require("fs"), path = require("path");
const D = require("./doc2ppt.js");
const PptxGenJS = require("pptxgenjs"), JSZip = require("jszip"), sharp = require("sharp");

function loadThemes() {
  const dir = path.join(__dirname, "..", "themes"), out = {};
  fs.readdirSync(dir).filter(f => f.endsWith(".json") && f !== "index.json").forEach(f => { const t = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); out[t.name] = t; });
  return out;
}
async function main() {
  const [deckPath, styleArg = "academic-blue-orange", out = "deck.pptx"] = process.argv.slice(2);
  if (!deckPath) { console.log("用法：node engine/cli.js deck.json [style.json|主题名] [out.pptx]\n主题：" + Object.keys(loadThemes()).join(", ")); process.exit(1); }
  const themes = loadThemes();
  const deck = JSON.parse(fs.readFileSync(deckPath, "utf8"));
  const spec = fs.existsSync(styleArg) ? JSON.parse(fs.readFileSync(styleArg, "utf8")) : styleArg;
  const style = D.resolveStyle(spec, themes);
  const buf = await D.buildPptx(deck, style, {
    PptxGenJS, JSZip, outputType: "nodebuffer",
    rasterize: async (svg, size) => "image/png;base64," + (await sharp(Buffer.from(svg)).resize(size).png().toBuffer()).toString("base64"),
  });
  fs.writeFileSync(out, buf);
  console.log(`已生成 ${out}（${deck.slides.length} 页，风格：${style.label}）`);
}
main().catch(e => { console.error(e); process.exit(1); });
