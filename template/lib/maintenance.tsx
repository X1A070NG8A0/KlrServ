// The routine maintenance page and its service checklist pages. Each tab
// of a checklist is a real page. With JavaScript, <section-tabs> gets that
// page and swaps only the section that holds the tabs.
import { raw, type Html } from "ggass";
import { serviceMiles, taskCats, type Model, type Task } from "../../lib/model.ts";
import { FilterBox, lower, opLink } from "./render.tsx";

export type Prose = { intro: Html; by_interval: Html; new_bike: Html };

type Binder = { id: string; label: string; tabs: number[]; url: (mi: number) => string; tab: (mi: number) => string; key: (mi: number) => string };

const miles = (mi: number) => mi.toLocaleString("en-US");

const NEW_BIKE = (milestones: number[]): Binder => ({ id: "new-bike", label: "New bike services", tabs: milestones, url: (mi) => `/maintenance/${mi}.html`, tab: (mi) => `First ${miles(mi)} miles`, key: (mi) => `${mi}` });
const GENERAL = (every: number[]): Binder => ({ id: "general", label: "Services by interval", tabs: every, url: (mi) => `/maintenance/every-${mi}.html`, tab: (mi) => `Every ${miles(mi)} miles`, key: (mi) => `every-${mi}` });

// The boxes of the service at odometer reading `mi`: its own category first,
// then the shorter intervals that also come due. At 500 miles, only the
// initial tasks.
function serviceBoxes(m: Model, every: number[], mi: number): { cat: number; tasks: Task[] }[] {
  const cats = mi === 500 ? [500] : every.filter((c) => mi % c === 0).reverse();
  const done = new Set<Task>();
  return cats
    .map((cat) => {
      const tasks = m.schedule.tasks.filter((t) => !done.has(t) && taskCats(m.schedule, t).includes(cat));
      tasks.forEach((t) => done.add(t));
      return { cat, tasks };
    })
    .filter((b) => b.tasks.length);
}

const taskName = (m: Model, t: Task): Html | string => (t.op ? opLink(m, t.op, t.task) : t.task);

const DUE = raw('<span aria-hidden="true">×</span><span class="vh">due</span>');

function BinderHtml({ m, b, current, every }: { m: Model; b: Binder; current: number; every: number[] }): Html {
  const boxes = serviceBoxes(m, every, current);
  return (
    <section id={b.id} class="binder">
      <section-tabs>
        <nav aria-label={b.label}>
          {b.tabs.map((mi) => (
            <a href={b.url(mi)} aria-current={mi === current ? "true" : undefined}>
              {b.tab(mi)}
            </a>
          ))}
        </nav>
      </section-tabs>
      <div class="tab-page">
        <h3 data-notoc>{b.tab(current)}</h3>
        {boxes.map((box, i) => {
          const own = i === 0;
          const h = box.cat === 500 ? "Initial 500 mile tasks" : own ? `Every ${miles(box.cat)} mile tasks` : `Also do: every ${miles(box.cat)} mile tasks`;
          return (
            <div class={`task-box${own ? " own" : ""}`}>
              <h4>{h}</h4>
              <check-list>
                <ol class="due checklist">
                  {box.tasks.map((t) => (
                    <li>
                      <input type="checkbox" data-done-key={`${b.key(current)}:task:${t.task}`} aria-label={`Done: ${t.task}`} /> <span class="name">{taskName(m, t)}</span>
                    </li>
                  ))}
                </ol>
              </check-list>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// `newBike` and `general` are the current tabs of the two checklists.
export function MaintenanceBody({ m, prose, newBike, general }: { m: Model; prose: Prose; newBike?: number; general?: number }): Html {
  const { every, milestones } = serviceMiles(m.schedule);
  const iv = m.schedule.intervals;
  return (
    <>
      <h1>Routine maintenance</h1>
      <p>{prose.intro}</p>
      <FilterBox items="tr.task" label="Filter the tasks" placeholder="for example chain, valve, coolant" />
      <div class="table-scroll">
        <table class="schedule">
          <thead>
            <tr>
              <th scope="col">Task</th>
              {iv.map((i) => (
                <th scope="col">{i.label}</th>
              ))}
              <th scope="col">Other interval</th>
            </tr>
          </thead>
          <tbody>
            {m.schedule.tasks.map((t) => (
              <tr class="task" data-search={lower(`${t.task} ${t.op ? (m.ops.get(t.op)?.title ?? "") : ""}`)}>
                <th scope="row">{taskName(m, t)}</th>
                {iv.map((i) => (
                  <td class="x">{t.at.includes(i.id) && DUE}</td>
                ))}
                <td>{t.other ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {Object.entries(m.schedule.footnotes ?? {}).map(([k, v]) => (
        <p class="meta">
          {k} {v}
        </p>
      ))}
      <h2>Service by interval</h2>
      <p>{prose.by_interval}</p>
      <BinderHtml m={m} b={GENERAL(every)} current={general ?? every[0]} every={every} />
      <h2>New bike services</h2>
      <p>{prose.new_bike}</p>
      <BinderHtml m={m} b={NEW_BIKE(milestones)} current={newBike ?? milestones[0]} every={every} />
      <h2>Tasks by time</h2>
      <ul>
        {m.schedule.tasks
          .filter((t) => !t.at.length && !t.every_mi)
          .map((t) => (
            <li>
              {taskName(m, t)}: {t.other}
            </li>
          ))}
      </ul>
    </>
  );
}
