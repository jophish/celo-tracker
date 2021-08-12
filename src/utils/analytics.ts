
import ReactGA from 'react-ga';

export function trackEvent(category: string, action: string, value?: number) {
  if (window.location.href.includes('localhost')) {
    return
  }
  ReactGA.event({
    category,
    action,
    value
  })
}