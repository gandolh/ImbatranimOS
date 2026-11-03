import { clientGroups, parseStat, SessionApps } from './session-apps';

describe("a session's app groups", () => {
  it('reads the groups from /proc/<pid>/stat, whatever the command is called', () => {
    expect(
      parseStat('4242 (Web Content) S 4200 4200 4200 0 -1 4194560 ...'),
    ).toEqual({
      pgrp: 4200,
      session: 4200,
      tty: 0,
    });
    expect(parseStat('17 (sh (x) y) S 1 17 17 34816 17 ...')).toEqual({
      pgrp: 17,
      session: 17,
      tty: 34816,
    });
    expect(parseStat('garbage')).toBeNull();
  });

  it("never names the backend's own group", () => {
    expect(clientGroups([process.pid])).toEqual([]);
  });

  it('keeps what Start launched for each session apart', () => {
    const apps = new SessionApps();
    apps.record('a', 10);
    apps.record('a', 11);
    apps.record('b', 12);
    expect(apps.groups('a')).toEqual([10, 11]);
    apps.forget('a');
    expect(apps.groups('a')).toEqual([]);
    expect(apps.groups('b')).toEqual([12]);
  });
});
