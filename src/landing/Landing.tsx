import React, { ChangeEvent, useState } from 'react';
import { saveValue, StorageKey } from '../helpers/storage';
import './Landing.css';

type Props = {
  onAddressSet: (address: string) => void
}

function Landing({ onAddressSet }: Props) {
  const [address, setAddress] = useState('')

  const updateAddress = (event: ChangeEvent<HTMLInputElement>) => {
    const newAddress = event.target.value
    setAddress(newAddress)
    if (newAddress.length === 42 && newAddress.startsWith('0x')) {
      onAddressSet(newAddress)
      saveValue(StorageKey.Address, newAddress)
    }
  }

  return (
    <div className="container">
      <div className="header-container">
        <h2 className="title">Celo Tracker</h2>
        <p className="subtitle">Track your holdings in the Celo ecosystem in one place.</p>
      </div>
      <p className="input-address-label">Paste your address to get started:</p>
      <input className="input-address" value={address} onChange={updateAddress} />
    </div>
  );
}

export default Landing;
