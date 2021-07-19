import BigNumber from 'bignumber.js';
import React from 'react';
import { useAsync } from 'react-async-hook';
import { fetchTokenAmounts, fetchTokenPrices, getUbeswapPooledTokens, PooledToken, TokenAmount } from '../fetchers/tokenFetcher';
import './App.css';


type Props = {
  address: string
  onClearAddress: () => void
}

function App({ address, onClearAddress }: Props) {  
  const { loading, error, result: tokensInfo } = useAsync(async () => {
    const tokenAmounts: TokenAmount[] = await fetchTokenAmounts(address)
    const pooledTokens: PooledToken[] = await getUbeswapPooledTokens(address)
    const allTokenAddresses = tokenAmounts.map(tokenAmount => tokenAmount.address)
      .concat(...pooledTokens.map(pooledToken => pooledToken.tokens))
    const prices = await fetchTokenPrices(Array.from(new Set(allTokenAddresses)))
    for (const tokenInfo of tokenAmounts) {
      tokenInfo.usdPrice = tokenInfo.balance.multipliedBy(prices[tokenInfo.symbol])
    }
    for (const pooledToken of pooledTokens) {
      pooledToken.usdPrice = Object.keys(pooledToken.balances)
        .map(tokenSymbol => new BigNumber(prices[tokenSymbol]).multipliedBy(pooledToken.balances[tokenSymbol]))
        .reduce((total, tokenPrice) => total.plus(tokenPrice), new BigNumber(0))
    }
    return {
      tokenAmounts,
      pooledTokens
    }
  }, [])

  const total = tokensInfo?.tokenAmounts.reduce((total, item) => total.plus(item.usdPrice!), new BigNumber(0)).dividedBy(1E18)
    .plus(tokensInfo?.pooledTokens.reduce((total, item) => total.plus(item.usdPrice!), new BigNumber(0)))

  return (
    <div className="container">
      <div className="header">
        <p>{address}</p>
        <button className="clear-address" onClick={onClearAddress}>Logout</button>
      </div>
      <h2 className="title">Total</h2>
      <p className="subtitle">${!total ? '...' : total.toFixed(2)}</p>
      <div className="details-container">
        <div className="details-column">
          <h2 className="detail-title">Tokens</h2>
          {tokensInfo?.tokenAmounts.filter(tokenInfo => tokenInfo.balance.gt(1E14)).map(token => (
            <div className="token-info" key={token.symbol}>
              <img className="token-logo" src={token.logoURI} alt="Logo"></img>
              <div className="token-symbol">{token.symbol}</div>
              <div className="token-amount-container">
                <div className="token-usd-price">${token.usdPrice!.dividedBy(1E18).toFixed(2)}</div>
                <div className="token-balance">{token.balance.dividedBy(1E18).toFixed(2)}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="details-column">
          <h2 className="detail-title">DeFi</h2>
          {tokensInfo?.pooledTokens.map(pool => (
            <div className="token-info" key={Object.keys(pool.balances).join('-')}>
              <div className="token-symbol">{Object.keys(pool.balances).join('-')}</div>
              <div className="token-amount-container">
                <div className="token-usd-price">${pool.usdPrice!.toFixed(2)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
