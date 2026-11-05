import {
  LINUX_APP_OOM_SCORE_ADJ,
  OomKills,
  parseOomKills,
  raiseOomScore,
} from './oom';

describe('who goes first when memory runs out', () => {
  it("raises a Linux app's score above the backend's", () => {
    const writes: [string, string][] = [];
    raiseOomScore(4242, (path, data) => writes.push([path, data]));
    expect(writes).toEqual([['/proc/4242/oom_score_adj', '1000']]);
    expect(LINUX_APP_OOM_SCORE_ADJ).toBeGreaterThan(0);
  });

  it('skips a process already gone', () => {
    expect(() =>
      raiseOomScore(1, () => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }),
    ).not.toThrow();
  });

  it("reads the cgroup's out-of-memory kills", () => {
    expect(
      parseOomKills(
        'low 0\nhigh 0\nmax 3\noom 2\noom_kill 2\noom_group_kill 0\n',
      ),
    ).toBe(2);
    expect(parseOomKills('low 0\n')).toBeNull();
  });

  it('says whether a kill happened since the last look', () => {
    let text = 'oom 0\noom_kill 0\n';
    const kills = new OomKills(() => text);
    expect(kills.happened()).toBe(false);
    text = 'oom 1\noom_kill 1\n';
    expect(kills.happened()).toBe(true);
    expect(kills.happened()).toBe(false);
  });

  it('never reports one outside a cgroup v2 container', () => {
    const kills = new OomKills(() => {
      throw new Error('ENOENT');
    });
    expect(kills.happened()).toBe(false);
  });
});
