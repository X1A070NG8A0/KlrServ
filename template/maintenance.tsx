// The routine maintenance page. Its child pages are the tabs of the service checklists.
import { children, html, template } from "ggass";
import { MaintenanceBody } from "./lib/maintenance.tsx";
import { siteModel } from "./lib/site.ts";

export default template({
  fields: {
    intro: html(),
    by_interval: html(),
    new_bike: html(),
    pages: children("service"),
  },
  render: (page, site) => <MaintenanceBody m={siteModel(site)} prose={page} />,
});
