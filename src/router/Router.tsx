import React, { useEffect, useState } from 'react';
import App from '../app/App';
import { clearSavedItem, readValue, StorageKey } from '../helpers/storage';
import Landing from '../landing/Landing';

function Router() {
  const [address, setAddress] = useState('')

  useEffect(() => {
    const storedAddress = readValue(StorageKey.Address)
    if (storedAddress) {
      setAddress(storedAddress)
    }
  }, [])

  const clearAddress = () => {
    clearSavedItem(StorageKey.Address)
    setAddress('')
  }
  
  return (
    address ? <App address={address} onClearAddress={clearAddress} /> : <Landing onAddressSet={setAddress} />
  )
}

export default Router;
