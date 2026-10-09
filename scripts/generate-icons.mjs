import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import sharp from "sharp";

const SOURCE = "public/parsleypantrylogov2.svg";
const VB = { w: 936, h: 1008 };

const inner = readFileSync(SOURCE, "utf8")
  .replace(/^[\s\S]*?<svg[^>]*>/, "")
  .replace(/<\/svg>\s*$/, "")
  .replace(/<text[\s\S]*?<\/text>/g, "");

const white = inner
  .replaceAll("#009444", "#ffffff")
  .replaceAll("#005926", "#dff0e6");

function iconSvg(size, { radius = 0, logoFrac }) {
  const scale = (size * logoFrac) / VB.h;
  const logoW = VB.w * scale;
  const logoH = size * logoFrac;
  const x = (size - logoW) / 2;
  const y = (size - logoH) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="#009444"/>
  <g transform="translate(${x} ${y}) scale(${scale})">${white}</g>
</svg>`;
}

const targets = [
  ["public/icon-192x192.png", iconSvg(192, { radius: 40, logoFrac: 0.72 })],
  ["public/icon-512x512.png", iconSvg(512, { radius: 104, logoFrac: 0.72 })],
  ["public/icon-maskable-512.png", iconSvg(512, { logoFrac: 0.6 })],
  ["app/apple-icon.png", iconSvg(180, { logoFrac: 0.78 })],
];

for (const [out, svg] of targets) {
  await sharp(Buffer.from(svg)).png().toFile(out);
  console.log("wrote", out);
}
