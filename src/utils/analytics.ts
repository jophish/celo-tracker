
export function trackEvent(name: string, payload?: any) {
  if (window.location.href.includes('localhost')) {
    return
  }
  // @ts-ignore
  window.splitbee.track(name, payload)
}