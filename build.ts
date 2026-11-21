// Builds the KLR Service Explorer with GGASS.
//
//   node build.ts            run the data checks, then write dist/
//   node build.ts --check    list the data checks, check the pages and links, write nothing
//   node build.ts --serve    build, serve on http://127.0.0.1:4650, rebuild and reload after each save
//
// The pages are YAML files in pagedef/, and the TSX templates in template/
// render them. The data checks in lib/checks.ts run first.
import { defineSite, run, type BuildContext, type Step } from "ggass";
import { dataChecks, printReport } from "./lib/checks.ts";

const root = import.meta.dirname;

// The checks run before the first build. In a watch build, this step runs
// them again on the first page of the build, and an error stops the build.
let seen: BuildContext | undefined;
const dataStep: Step = {
  name: "data checks",
  page(body, _page, ctx) {
    if (ctx !== seen) {
      if (seen) ctx.errors.push(...dataChecks(root).errors);
      seen = ctx;
    }
    return body;
  },
};

export const site = defineSite({
  name: "KLR Service Explorer",
  root,
  nav: [
    { href: "/maintenance.html", label: "Routine maintenance" },
    { href: "/repairs.html", label: "Common repairs" },
    { href: "/book/", label: "Full reference" },
    { href: "/tools.html", label: "Tool list" },
  ],
  footer: "For the first-generation Kawasaki KLR650 (KL650A). Sources: Clymer KLR650 1987-2006 manual (M474-2), Kawasaki KLR600 and KLR650 service manuals, klr650.net.",
  css: { entry: "style.css" },
  fonts: [
    { family: "TeX Gyre Heros", src: "fonts/texgyreheros-regular.otf", weight: 400, preload: true },
    { family: "TeX Gyre Heros", src: "fonts/texgyreheros-bold.otf", weight: 700 },
  ],
  // The photos are small crops, so two widths are enough.
  images: { widths: [400, 800] },
  // The site holds text taken from copyrighted manuals. It is for personal
  // use, so the server listens on this computer only.
  serve: { port: 4650, host: "127.0.0.1" },
  steps: [dataStep],
});

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.some((a) => a === "--host" || a.startsWith("--host="))) {
    console.error("The server of this site listens on 127.0.0.1 only, so --host is not available.");
    process.exit(2);
  }
  const check = args.includes("--check");
  const report = dataChecks(root);
  printReport(report, check);
  if (report.errors.length) {
    process.exitCode = 1;
    // With --check, GGASS still checks the pages and the links.
    if (!check) process.exit(1);
  }
  await run(site, args);
}
