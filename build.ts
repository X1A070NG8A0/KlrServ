// Builds the KLR Service Explorer with GGASS.
// First lib/pages.ts writes the pages from data/ and doc/ into content/.
// Then GGASS builds the site from content/ into dist/.
//
//   node build.ts            write dist/
//   node build.ts --check    list the data checks, check the links, write nothing
//   node build.ts --serve    build, then serve on http://127.0.0.1:4650
import { join } from "node:path";
import { build, defineSite, serve } from "ggass";
import { generate } from "./lib/pages.ts";

const check = process.argv.includes("--check");

export const site = defineSite({
  name: "KLR Service Explorer",
  root: import.meta.dirname,
  nav: [
    { href: "/maintenance.html", label: "Routine maintenance" },
    { href: "/repairs.html", label: "Common repairs" },
    { href: "/book/", label: "Full reference" },
    { href: "/tools.html", label: "Tool list" },
  ],
  footer: "For the first-generation Kawasaki KLR650 (KL650A). Sources: Clymer KLR650 1987-2006 manual (M474-2), Kawasaki KLR600 and KLR650 service manuals, klr650.net. Each step names its source page.",
  css: { entry: "style.css" },
  fonts: [
    { family: "TeX Gyre Heros", src: "fonts/texgyreheros-regular.otf", weight: 400, preload: true },
    { family: "TeX Gyre Heros", src: "fonts/texgyreheros-bold.otf", weight: 700 },
  ],
  // The photos are small crops, so two widths are enough.
  images: { widths: [400, 800] },
});

if (!generate({ content: join(import.meta.dirname, "content"), check })) process.exit(1);
const result = await build(site, { check });
// The site holds text taken from copyrighted manuals. It is for personal
// use, so the server listens on this computer only.
if (result.ok && process.argv.includes("--serve")) serve(site, { port: 4650, host: "127.0.0.1" });
