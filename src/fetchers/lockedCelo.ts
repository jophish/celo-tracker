import BigNumber from 'bignumber.js';
import { getContractKit } from '../helpers/contractKit';

export interface LockedCelo {
  total: BigNumber
  nonvoting: BigNumber
}

export async function fetchLockedCelo(address: string): Promise<LockedCelo | null> {
  const kit = await getContractKit()
  const lockedGold = await kit.contracts.getLockedGold()

  try {
    const accountSummary = await lockedGold.getAccountSummary(address)
    return accountSummary.lockedGold
  } catch(error) {
    console.error('Error fetching locked gold', error)
    return null
  }
}