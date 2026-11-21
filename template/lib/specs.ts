// A spec table from its page, without the whole site model, so that a watch
// build renders a table page again only when its own pagedef changes.
import type { AnyPage, PageMeta } from "ggass";
import type { SpecTable } from "../../lib/model.ts";

export const specTableOf = (page: PageMeta | AnyPage, group: PageMeta | AnyPage): SpecTable =>
  ({ ...(page as AnyPage), chapter: group.title, groupUrl: group.url }) as unknown as SpecTable;
