// The site model for the templates, made once for each build.
import type { Site } from "ggass";
import { makeModel, type Model } from "../../lib/model.ts";

const DATA = ["sources", "schedule", "tools", "substitutes", "common-repairs", "diagrams", "figures"];

let memo: { key: unknown[]; model: Model } | undefined;

// Each call reads all pages and the data files, so GGASS records them as
// inputs of the page, and a watch build renders the page again after a
// change to any of them. GGASS makes new page objects in each build, so the
// first page tells one build from the next.
export function siteModel(site: Site): Model {
  const pages = site.pages();
  const key = [pages[0], ...DATA.map((name) => site.data[name])];
  if (memo && memo.key.every((k, i) => k === key[i])) return memo.model;
  const data = Object.fromEntries(DATA.map((name, i) => [name, key[i + 1]]));
  const model = makeModel({ root: site.config.root, data, pages: pages as never });
  memo = { key, model };
  return model;
}
