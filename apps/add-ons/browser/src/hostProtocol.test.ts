import { describe, expect, it } from 'vitest'
import { parseFromHost } from './hostProtocol'

describe('parseFromHost', () => {
  it('reads the host page messages', () => {
    expect(parseFromHost({ imb: 'ready' })).toEqual({ imb: 'ready' })
    expect(parseFromHost({ imb: 'url', url: 'https://a.test/' })).toEqual({
      imb: 'url',
      url: 'https://a.test/',
    })
    expect(parseFromHost({ imb: 'jar', jar: '{}' })).toEqual({ imb: 'jar', jar: '{}' })
  })

  it('ignores anything else, including malformed fields', () => {
    for (const bad of [
      null,
      'ready',
      { imb: 'url', url: 5 },
      { imb: 'jar' },
      { imb: 'go', url: 'https://a.test/' },
      { type: 'ready' },
    ]) {
      expect(parseFromHost(bad)).toBeNull()
    }
  })
})
