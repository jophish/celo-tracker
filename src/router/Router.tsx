import React, { useEffect, useState } from 'react';
import App from '../app/App';
import { clearSavedItem, readValue, saveValue, StorageKey } from '../helpers/storage';
import Landing from '../landing/Landing';
import { trackEvent } from '../utils/analytics';

function Router() {
  const [address, setAddress] = useState('')

  useEffect(() => {
    const urlSearchParams = new URLSearchParams(window.location.search);
    const params = Object.fromEntries(urlSearchParams.entries());
    if (params.address && params.address.length === 42 && params.address.startsWith('0x')) {
      setAddress(params.address)
      saveValue(StorageKey.Address, params.address)
      window.history.replaceState(null, '', window.location.pathname);
      return
    }
    const storedAddress = readValue(StorageKey.Address)
    if (storedAddress) {
      setAddress(storedAddress)
    }
  }, [])

  const clearAddress = () => {
    trackEvent('ClearAddress', { address });
    clearSavedItem(StorageKey.Address)
    setAddress('')
  }
  
  return (
    address ? <App address={address} onClearAddress={clearAddress} /> : <Landing onAddressSet={setAddress} />
  )
}

export default Router;
