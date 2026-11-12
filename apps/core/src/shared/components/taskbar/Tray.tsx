import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import dayjs from "dayjs";
import { Popover } from "@imbatranim/ui";
import { cn } from "../../../lib/cn";
import { api } from "../../../lib/axios";
import { notify, useNotificationStore } from "../../store/notificationStore";
import { NotificationPanel } from "../notifications/NotificationPanel";
import { readTrayStats } from "./trayStats";
import { TrayVolume } from "./TrayVolume";

/** Warn once the volume passes this. */
const DISK_WARN_PERCENT = 90;

const toGb = (bytes: number) => (bytes / 1024 ** 3).toFixed(1);

function MiniCalendar() {
  const today = dayjs();
  const startOfMonth = today.startOf("month");
  const daysInMonth = today.daysInMonth();
  const startDow = startOfMonth.day();

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <div className="font-ui p-3" style={{ minWidth: 208 }}>
      <div className="text-on-surface text-control mb-2 text-center font-semibold">{today.format("MMMM YYYY")}</div>
      <table className="text-label w-full border-collapse">
        <thead>
          <tr>
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
              <th key={d} className="text-on-surface-variant pb-1 text-center font-medium" style={{ width: "14.28%" }}>
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, wi) => (
            <tr key={wi}>
              {week.map((day, di) => (
                <td
                  key={di}
                  className={cn(
                    "py-0.5 text-center",
                    day === today.date() ? "bg-primary text-on-primary font-semibold" : "text-on-surface",
                    !day && "opacity-0",
                  )}
                >
                  {day ?? ""}
                </td>
              ))}
              {Array.from({ length: 7 - week.length }).map((_, di) => (
                <td key={`pad-${di}`} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const unread = useNotificationStore((s) => s.notifications.reduce((n, x) => n + (x.read ? 0 : 1), 0));
  const dnd = useNotificationStore((s) => s.dnd);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button
          type="button"
          aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
          className={cn(
            "relative flex h-full cursor-pointer items-center px-2.5 outline-none",
            "text-on-surface hover:bg-surface-container-high",
            "focus-visible:ring-primary focus-visible:ring-2 focus-visible:ring-inset",
          )}
        >
          <Bell size={15} strokeWidth={1.75} className={cn(dnd && "opacity-50")} />
          {unread > 0 && (
            <span
              className="bg-primary text-on-primary text-micro absolute top-1.5 right-1 flex h-3.5 min-w-3.5 items-center justify-center px-0.5 leading-none font-semibold tabular-nums"
              aria-hidden
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      }
    >
      <NotificationPanel onClose={() => setOpen(false)} />
    </Popover>
  );
}

export function Tray() {
  const [now, setNow] = useState(() => dayjs());

  useEffect(() => {
    const id = setInterval(() => setNow(dayjs()), 15_000);
    return () => clearInterval(id);
  }, []);

  // A failed request leaves `data` undefined, which reads as nothing too.
  const { data } = useQuery<unknown>({
    queryKey: ["system-stats"],
    queryFn: () => api.get("/system/stats").then((r) => r.data),
    refetchInterval: 60_000,
    staleTime: 55_000,
  });
  const { load, diskPercent } = readTrayStats(data);

  // Warn once per session when the volume is nearly full. Driven off the poll
  // the Tray already runs — the percentage was being fetched every minute and
  // thrown away, while a full volume showed up to the user only as saves
  // mysteriously failing. A second poller would be waste.
  const warnedRef = useRef(false);
  useEffect(() => {
    if (diskPercent === null || diskPercent < DISK_WARN_PERCENT) return;
    if (warnedRef.current) return;
    warnedRef.current = true;
    notify({
      title: "Disk almost full",
      body: `The volume is ${Math.round(diskPercent)}% full. Free some space — Settings › Storage shows what is using it.`,
      level: "warning",
    });
  }, [diskPercent]);

  return (
    <div className="flex h-full items-center gap-1 pr-1">
      {load && (
        <span
          className="text-on-surface-variant text-label hidden px-2 tabular-nums sm:inline"
          style={{ whiteSpace: "nowrap" }}
          title="CPU / RAM"
          data-tray-load=""
        >
          {Math.round(load.cpuPercent)}% · {toGb(load.memUsedBytes)}/{toGb(load.memTotalBytes)} GB
        </span>
      )}

      <div className="bg-outline-variant h-5 w-px" />

      <TrayVolume />
      <NotificationBell />

      <div className="bg-outline-variant h-5 w-px" />

      <Popover
        trigger={
          <button
            type="button"
            className={cn(
              "flex h-full cursor-pointer flex-col items-end justify-center px-3 leading-tight outline-none",
              "text-on-surface hover:bg-surface-container-high",
              "focus-visible:ring-primary focus-visible:ring-2 focus-visible:ring-inset",
            )}
          >
            <span className="text-control font-semibold tabular-nums">{now.format("HH:mm")}</span>
            <span className="text-on-surface-variant text-tiny tabular-nums">{now.format("ddd, DD MMM")}</span>
          </button>
        }
      >
        <MiniCalendar />
      </Popover>
    </div>
  );
}
