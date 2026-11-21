// The tools of each procedure, found in the cited step text with the
// patterns of data/tools.yaml, and the tool list of the whole site.
import { findSpec, type Model, type Operation, type Part } from "../../lib/model.ts";

export type ToolDef = { id: string; name: string; group: string; torque?: boolean; re: RegExp[]; sizes: RegExp[]; kinds: [RegExp, string][]; specs?: RegExp };
// `variants` maps a size, a type or "spec:<ref>" to the titles of the procedures that need it.
export type ToolUse = { id: string; name: string; group: string; why: string[]; variants: Map<string, Set<string>> };
export type ToolIndexEntry = ToolUse & { ops: Operation[] };
export type Tools = {
  defs: ToolDef[];
  groups: string[];
  isToolPart(p: Part): boolean;
  toolsFor(op: Operation): ToolUse[];
  index: Map<string, ToolIndexEntry>;
};

export const KAW = "Kawasaki special tools";

const cache = new WeakMap<Model, Tools>();

export function tools(m: Model): Tools {
  const hit = cache.get(m);
  if (hit) return hit;
  const defs: ToolDef[] = [];
  const groups: string[] = [];
  for (const g of m.toolGroups) {
    groups.push(g.name);
    for (const t of g.tools)
      defs.push({
        id: t.id,
        name: t.name,
        group: g.name,
        torque: t.torque,
        re: t.match.map((x) => new RegExp(x, "i")),
        sizes: (t.sizes ?? []).map((x) => new RegExp(x, "gi")),
        kinds: Object.entries(t.kinds ?? {}).map(([k, v]) => [new RegExp(k, "i"), v] as [RegExp, string]),
        specs: t.specs ? new RegExp(t.specs, "i") : undefined,
      });
  }
  groups.push(KAW);
  const isTorqueRef = (ref?: string) => !!ref && findSpec(m, ref)?.table.format === "torque";
  // A "part" that is really a tool: a Kawasaki tool number, or a name that the
  // tool patterns know and that is not a material (grease for a puller is a material).
  const isToolPart = (p: Part): boolean => {
    if (/57001-\d{3,4}/.test(p.name)) return true;
    if (/grease|oil|sealant|compound|lubricant|cleaner|fluid|solvent/i.test(p.name)) return false;
    return defs.some((d) => d.re.some((r) => r.test(p.name)));
  };
  const specVariant = (ref: string): string | undefined => (findSpec(m, ref) ? `spec:${ref}` : undefined);

  function toolsFor(op: Operation): ToolUse[] {
    const found = new Map<string, ToolUse>();
    const add = (id: string, name: string, group: string, why: string) => {
      if (!found.has(id)) found.set(id, { id, name, group, why: [], variants: new Map() });
      const w = found.get(id)!.why;
      if (!w.includes(why) && w.length < 3) w.push(why);
      return found.get(id)!;
    };
    const variant = (u: ToolUse, v: string) => {
      if (!u.variants.has(v)) u.variants.set(v, new Set());
      u.variants.get(v)!.add(op.title);
    };
    for (const sec of op.sections)
      for (const st of sec.steps) {
        for (const d of defs) {
          if (d.re.some((r) => r.test(st.t))) {
            const u = add(d.id, d.name, d.group, st.t);
            // Sizes come from the step and from its cited page, where the page names the same tool.
            const src = st.cite.s ?? op.source;
            const pageText = src !== "forum" && st.cite.p ? (m.pageText(src, st.cite.p) ?? "").replace(/\s+/g, " ") : "";
            for (const r of d.sizes) for (const text of [st.t, pageText]) for (const x of text.matchAll(r)) variant(u, `${x[1]} mm`);
            for (const [r, label] of d.kinds) if (r.test(st.t)) variant(u, label);
            if (d.specs && st.spec_ref && d.specs.test(st.spec_ref)) {
              const v = specVariant(st.spec_ref);
              if (v) variant(u, v);
            }
            // The specs of the whole procedure count only for selective tools
            // (a feeler gauge: clearance or gap), never for catch-all ones.
            if (d.specs && d.specs.source !== ".")
              for (const ref of op.spec_refs ?? [])
                if (!isTorqueRef(ref) && d.specs.test(ref)) {
                  const v = specVariant(ref);
                  if (v) variant(u, v);
                }
          } else if (d.torque && isTorqueRef(st.spec_ref)) add(d.id, d.name, d.group, `${st.t} (torque value)`);
        }
        for (const x of st.t.matchAll(/57001-\d{3,4}/g)) add(`kaw-${x[0]}`, `Kawasaki special tool ${x[0]}`, KAW, st.t);
      }
    // Some writers listed special tools as parts. Those count as tools here.
    for (const p of op.parts ?? []) {
      if (!isToolPart(p)) continue;
      for (const x of p.name.matchAll(/57001-\d{3,4}/g)) add(`kaw-${x[0]}`, `Kawasaki special tool ${x[0]}`, KAW, p.name);
      for (const d of defs)
        if (d.re.some((r) => r.test(p.name))) {
          const u = add(d.id, d.name, d.group, p.name);
          for (const r of d.sizes) for (const x of p.name.matchAll(r)) variant(u, `${x[1]} mm`);
        }
    }
    const torqueDef = defs.find((d) => d.torque);
    if (torqueDef && op.spec_refs?.some(isTorqueRef)) add(torqueDef.id, torqueDef.name, torqueDef.group, "This procedure has torque specifications.");
    return [...found.values()].sort((a, b) => groups.indexOf(a.group) - groups.indexOf(b.group) || a.name.localeCompare(b.name));
  }

  const byOp = new Map<string, ToolUse[]>();
  const toolsOf = (op: Operation): ToolUse[] => {
    if (!byOp.has(op.id)) byOp.set(op.id, toolsFor(op));
    return byOp.get(op.id)!;
  };
  const index = new Map<string, ToolIndexEntry>();
  for (const op of m.ops.values())
    for (const t of toolsOf(op)) {
      if (!index.has(t.id)) index.set(t.id, { ...t, why: [...t.why], variants: new Map(), ops: [] });
      const agg = index.get(t.id)!;
      agg.ops.push(op);
      for (const [v, opsSet] of t.variants) {
        if (!agg.variants.has(v)) agg.variants.set(v, new Set());
        for (const o of opsSet) agg.variants.get(v)!.add(o);
      }
    }
  const out: Tools = { defs, groups, isToolPart, toolsFor: toolsOf, index };
  cache.set(m, out);
  return out;
}
