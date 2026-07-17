import { HttpException } from '@nestjs/common';
import { ThrottleService } from './throttle.service';

describe('ThrottleService', () => {
  let throttle: ThrottleService;

  beforeEach(() => {
    throttle = new ThrottleService();
  });

  it('allows attempts up to the threshold without locking', () => {
    for (let i = 0; i < throttle.FAIL_THRESHOLD; i++) {
      throttle.recordFailure('1.2.3.4');
    }
    expect(() => throttle.assertNotLocked('1.2.3.4')).not.toThrow();
  });

  it('locks out after exceeding the threshold', () => {
    for (let i = 0; i <= throttle.FAIL_THRESHOLD; i++) {
      throttle.recordFailure('1.2.3.4');
    }
    expect(() => throttle.assertNotLocked('1.2.3.4')).toThrow(HttpException);
  });

  it('surfaces a retryAfterSeconds hint', () => {
    for (let i = 0; i <= throttle.FAIL_THRESHOLD; i++) {
      throttle.recordFailure('1.2.3.4');
    }
    try {
      throttle.assertNotLocked('1.2.3.4');
      fail('expected lockout');
    } catch (e) {
      const body = (e as HttpException).getResponse() as {
        retryAfterSeconds: number;
      };
      expect(body.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it('backs off exponentially: more failures => longer lock', () => {
    const key = '1.2.3.4';
    for (let i = 0; i <= throttle.FAIL_THRESHOLD; i++)
      throttle.recordFailure(key);
    const first = lockRemaining(throttle, key);
    throttle.recordFailure(key);
    const second = lockRemaining(throttle, key);
    expect(second).toBeGreaterThan(first);
  });

  it('isolates keys — one IP lockout does not affect another', () => {
    for (let i = 0; i <= throttle.FAIL_THRESHOLD; i++)
      throttle.recordFailure('attacker');
    expect(() => throttle.assertNotLocked('attacker')).toThrow();
    expect(() => throttle.assertNotLocked('owner')).not.toThrow();
  });

  it('reset clears the lock (successful login self-heals)', () => {
    const key = '1.2.3.4';
    for (let i = 0; i <= throttle.FAIL_THRESHOLD; i++)
      throttle.recordFailure(key);
    throttle.reset(key);
    expect(() => throttle.assertNotLocked(key)).not.toThrow();
  });
});

function lockRemaining(throttle: ThrottleService, key: string): number {
  try {
    throttle.assertNotLocked(key);
    return 0;
  } catch (e) {
    return ((e as HttpException).getResponse() as { retryAfterSeconds: number })
      .retryAfterSeconds;
  }
}
