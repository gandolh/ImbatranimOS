import {
  execFile,
  spawn,
  spawnSync,
  type ChildProcess,
} from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { BUS, DbusConnection } from './connection';
import {
  CLOSED_BY_CALL,
  NOTIFICATIONS,
  NotificationsServer,
  type ShownNotification,
} from './notifications';
import { APPEARANCE, SETTINGS, SettingsServer } from './settings';
import type { Message } from './wire';

/**
 * The client against the reference bus: a real `dbus-daemon`, and GLib's
 * `gdbus` calling the service, so marshalling is checked by an
 * implementation that isn't ours. Skipped where either is missing.
 */
const has = (cmd: string) =>
  spawnSync('sh', ['-c', `command -v ${cmd}`]).status === 0;
const withBus = has('dbus-daemon') && has('gdbus') ? describe : describe.skip;
const run = promisify(execFile);

withBus('the notification service on a real session bus', () => {
  let dir: string;
  let path: string;
  let daemon: ChildProcess;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'imb-bus-'));
    path = join(dir, 'bus');
    daemon = spawn(
      'dbus-daemon',
      [
        '--session',
        `--address=unix:path=${path}`,
        '--nofork',
        '--nopidfile',
        '--print-address=1',
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );
    await once(daemon.stdout!, 'data');
  });

  afterAll(() => {
    daemon.kill();
    rmSync(dir, { recursive: true, force: true });
  });

  it("answers GLib's calls, and tells listeners when one closes", async () => {
    const shown: ShownNotification[] = [];
    const closed: number[] = [];
    const bus = await DbusConnection.open(path, process.getuid!());
    const server = new NotificationsServer(
      (m) => bus.signal(m),
      { show: (n) => shown.push(n), close: (id) => closed.push(id) },
      'test',
    );
    bus.onMethodCall((call) => server.handle(call));
    const owned = await bus.call({
      destination: BUS.name,
      path: BUS.path,
      interface: BUS.interface,
      member: 'RequestName',
      signature: 'su',
      body: [NOTIFICATIONS.name, 4],
    });
    expect(owned.body).toEqual([1]);

    const listener = await DbusConnection.open(path, process.getuid!());
    const signals: Message[] = [];
    listener.onSignal((m) => signals.push(m));
    await listener.call({
      destination: BUS.name,
      path: BUS.path,
      interface: BUS.interface,
      member: 'AddMatch',
      signature: 's',
      body: ["type='signal',interface='org.freedesktop.Notifications'"],
    });

    const env = {
      ...process.env,
      DBUS_SESSION_BUS_ADDRESS: `unix:path=${path}`,
    };
    const gdbus = (method: string, ...args: string[]) =>
      run(
        'gdbus',
        [
          'call',
          '--session',
          '--dest',
          NOTIFICATIONS.name,
          '--object-path',
          NOTIFICATIONS.path,
          '--method',
          `${NOTIFICATIONS.interface}.${method}`,
          ...args,
        ],
        { env },
      ).then((r) => r.stdout.trim());

    expect(await gdbus('GetServerInformation')).toBe(
      "('ImbatranimOS', 'imbatranim', 'test', '1.2')",
    );
    expect(await gdbus('GetCapabilities')).toBe("(['actions', 'body'],)");
    expect(
      await gdbus(
        'Notify',
        'Firefox',
        '0',
        'firefox',
        'Hi ș',
        'from GLib',
        '[]',
        "{'urgency': <byte 1>, 'desktop-entry': <'firefox'>, 'image-data': <(1, 1, 4, true, 8, 4, [byte 1, 2, 3, 4])>}",
        '5000',
      ),
    ).toBe('(uint32 1,)');
    expect(shown).toEqual([
      {
        id: 1,
        app: 'Firefox',
        summary: 'Hi ș',
        body: 'from GLib',
        hasDefault: false,
      },
    ]);

    expect(await gdbus('CloseNotification', '1')).toBe('()');
    expect(closed).toEqual([1]);
    for (let i = 0; i < 50 && signals.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(signals.map((m) => [m.member, ...m.body])).toEqual([
      ['NotificationClosed', 1, CLOSED_BY_CALL],
    ]);

    // A click: a notification with a default action reaches the listener.
    signals.length = 0;
    expect(
      await gdbus(
        'Notify',
        'Firefox',
        '0',
        '',
        'Click',
        '',
        "['default', 'Open']",
        '{}',
        '0',
      ),
    ).toBe('(uint32 2,)');
    expect(shown[1].hasDefault).toBe(true);
    server.actionByUser(2, 'default');
    for (let i = 0; i < 50 && signals.length < 2; i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(signals.map((m) => [m.member, ...m.body])).toEqual([
      ['ActionInvoked', 2, 'default'],
      ['NotificationClosed', 2, 2],
    ]);

    await expect(gdbus('Frobnicate')).rejects.toThrow(/UnknownMethod/);
    bus.close();
    listener.close();
  });

  it("answers GLib's Settings reads, and signals a change", async () => {
    const bus = await DbusConnection.open(path, process.getuid!());
    const server = new SettingsServer((m) => bus.signal(m), null);
    bus.onMethodCall((call) => server.handle(call));
    const owned = await bus.call({
      destination: BUS.name,
      path: BUS.path,
      interface: BUS.interface,
      member: 'RequestName',
      signature: 'su',
      body: [SETTINGS.name, 4],
    });
    expect(owned.body).toEqual([1]);

    const listener = await DbusConnection.open(path, process.getuid!());
    const signals: Message[] = [];
    listener.onSignal((m) => signals.push(m));
    await listener.call({
      destination: BUS.name,
      path: BUS.path,
      interface: BUS.interface,
      member: 'AddMatch',
      signature: 's',
      body: ["type='signal',interface='org.freedesktop.portal.Settings'"],
    });

    const env = {
      ...process.env,
      DBUS_SESSION_BUS_ADDRESS: `unix:path=${path}`,
    };
    const gdbus = (method: string, ...args: string[]) =>
      run(
        'gdbus',
        [
          'call',
          '--session',
          '--dest',
          SETTINGS.name,
          '--object-path',
          SETTINGS.path,
          '--method',
          `${SETTINGS.interface}.${method}`,
          ...args,
        ],
        { env },
      ).then((r) => r.stdout.trim());

    expect(await gdbus('ReadOne', APPEARANCE, 'color-scheme')).toBe(
      '(<uint32 2>,)',
    );
    expect(await gdbus('ReadOne', APPEARANCE, 'accent-color')).toMatch(
      /^\(<\(0\.62\d*, 0\.29\d*, 0\.13\d*\)>,\)$/,
    );
    expect(await gdbus('Read', APPEARANCE, 'contrast')).toBe('(<<uint32 0>>,)');
    expect(await gdbus('ReadAll', '[]')).toContain(
      "'color-scheme': <uint32 2>",
    );
    expect(await gdbus('ReadAll', "['org.gnome.*']")).toBe('(@a{sa{sv}} {},)');

    server.update(
      JSON.stringify({
        state: { theme: 'apricot', mode: 'dark', accents: {} },
      }),
    );
    for (let i = 0; i < 50 && signals.length < 2; i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(signals.map((m) => [m.member, m.body[0], m.body[1]])).toEqual([
      ['SettingChanged', APPEARANCE, 'color-scheme'],
      ['SettingChanged', APPEARANCE, 'accent-color'],
    ]);
    bus.close();
    listener.close();
  });
});
