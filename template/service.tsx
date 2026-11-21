// One tab of a service checklist: a child page of pagedef/maintenance.yaml.
// The id "500" is the new bike service at 500 miles, and "every-3000" is the
// service every 3000 miles.
import { template } from "ggass";
import { MaintenanceBody, type Prose } from "./lib/maintenance.tsx";
import { siteModel } from "./lib/site.ts";

export default template({
  fields: {},
  render: (page, site) => {
    const every = page.id?.match(/^every-(\d+)$/);
    return (
      <MaintenanceBody
        m={siteModel(site)}
        prose={site.parent(page) as unknown as Prose}
        newBike={every ? undefined : Number(page.id)}
        general={every ? Number(every[1]) : undefined}
      />
    );
  },
});
