import { describe, expect, it } from 'vitest'
import { SEARCH_URL, isWebUrl, toAddress } from './address'

describe('toAddress', () => {
  it('keeps http and https URLs', () => {
    expect(toAddress('https://example.com/a?b=1')).toBe('https://example.com/a?b=1')
    expect(toAddress('  http://example.com ')).toBe('http://example.com/')
  })

  it('turns a bare host into https', () => {
    expect(toAddress('example.com')).toBe('https://example.com/')
    expect(toAddress('en.wikipedia.org/wiki/Romania')).toBe('https://en.wikipedia.org/wiki/Romania')
    expect(toAddress('example.com:8443/x')).toBe('https://example.com:8443/x')
  })

  it('searches for words', () => {
    expect(toAddress('old romanian proverbs')).toBe(
      SEARCH_URL + encodeURIComponent('old romanian proverbs')
    )
    expect(toAddress('hello')).toBe(SEARCH_URL + 'hello')
  })

  it('never navigates to another scheme', () => {
    for (const text of ['javascript:alert(1)', 'data:text/html,hi', 'file:///etc/passwd']) {
      expect(toAddress(text)).toBe(SEARCH_URL + encodeURIComponent(text))
    }
  })

  it('has nothing to open for blank input', () => {
    expect(toAddress('   ')).toBeNull()
  })
})

describe('isWebUrl', () => {
  it('accepts http(s) only', () => {
    expect(isWebUrl('https://example.com')).toBe(true)
    expect(isWebUrl('http://example.com')).toBe(true)
    expect(isWebUrl('javascript:alert(1)')).toBe(false)
    expect(isWebUrl('example.com')).toBe(false)
    expect(isWebUrl(42)).toBe(false)
  })
})
