import BigNumber from 'bignumber.js';
import React from 'react';
import { useAsync } from 'react-async-hook';
import { fetchLockedCelo } from '../fetchers/lockedCelo';
import { fetchTokenAmounts, fetchTokenPrices, getTripleRewardPool, getUbeswapPooledTokens, PooledToken, TokenAmount } from '../fetchers/tokenFetcher';
import { trackEvent } from '../utils/analytics';
import './App.css';


type Props = {
  address: string
  onClearAddress: () => void
}

function App({ address, onClearAddress }: Props) {  
  const { loading, error, result: tokensInfo } = useAsync(async () => {
    const tokenAmounts: TokenAmount[] = await fetchTokenAmounts(address)
    const ubeswapPooledTokens: PooledToken[] = await getUbeswapPooledTokens(address)
    const tripleRewardTokens: PooledToken[] = await getTripleRewardPool(address)
    const allPooledTokens = ubeswapPooledTokens.concat(tripleRewardTokens)
    const lockedCelo = await fetchLockedCelo(address)

    const allTokenAddresses = tokenAmounts.map(tokenAmount => tokenAmount.address)
      .concat(...allPooledTokens.map(pooledToken => pooledToken.tokens))
    
    const prices = await fetchTokenPrices(allTokenAddresses)
    for (const tokenInfo of tokenAmounts) {
      tokenInfo.usdPrice = tokenInfo.balance.multipliedBy(prices[tokenInfo.symbol])
    }
    for (const pooledToken of allPooledTokens) {
      pooledToken.usdPrice = Object.keys(pooledToken.balances)
        .map(tokenSymbol => new BigNumber(prices[tokenSymbol]).multipliedBy(pooledToken.balances[tokenSymbol]))
        .reduce((total, tokenPrice) => total.plus(tokenPrice), new BigNumber(0))
    }
    
    const tokensInfo = {
      tokenAmounts,
      ubeswapPooledTokens: allPooledTokens,
      lockedCelo: {
        available: lockedCelo?.total.gt(0) || lockedCelo?.nonvoting.gt(0),
        total: lockedCelo?.total,
        nonVoting: lockedCelo?.nonvoting,
        usdPrice: new BigNumber(prices['CELO']).multipliedBy(lockedCelo?.total ?? 0),
        nonVotingUsdPrice: new BigNumber(prices['CELO']).multipliedBy(lockedCelo?.nonvoting ?? 0)
      }
    }

    const total = tokensInfo.tokenAmounts.reduce((total, item) => total.plus(item.usdPrice!), new BigNumber(0)).dividedBy(1E18)
      .plus(tokensInfo.ubeswapPooledTokens.reduce((total, item) => total.plus(item.usdPrice!), new BigNumber(0)))
      .plus(tokensInfo.lockedCelo.usdPrice.dividedBy(1E18))
    
    trackEvent('Balance', { total: total.toNumber() })

    return {
      ...tokensInfo,
      total
    }
  }, [])

  return (
    <div className="container">
      <div className="header">
        <p>{address.slice(0, 8)}...{address.slice(-6)}</p>
        <button className="clear-address" onClick={onClearAddress}>Logout</button>
      </div>
      <h2 className="subtitle">Total</h2>
      <p className="balance">${!tokensInfo?.total ? '...' : tokensInfo?.total.toNumber().toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
      <p className="disclaimer">Note that dollar values are estimates based on exchange rates on Ubeswap and may be slightly off</p>
      <div className="details-container">
        <div className="details-column">
          <h2 className="detail-title">Tokens</h2>
          {tokensInfo?.tokenAmounts.filter(tokenInfo => tokenInfo.balance.gt(1E14)).map(token => (
            <div className="token-info" key={token.symbol}>
              <img className="token-logo" src={token.logoURI} alt="Logo"></img>
              <div className="token-symbol">{token.symbol}</div>
              <div className="token-amount-container">
                <div className="token-usd-price">${token.usdPrice!.dividedBy(1E18).toNumber().toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                <div className="token-balance">{token.balance.dividedBy(1E18).toNumber().toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="details-column">
          <h2 className="detail-title">DeFi</h2>
          {(tokensInfo?.ubeswapPooledTokens.length ?? 0) > 0 && (
            <div className="detail-section">
              <h3 className="detail-title">Ubeswap</h3>
              {tokensInfo?.ubeswapPooledTokens.map(pool => (
                <div className="token-info" key={Object.keys(pool.balances).join('-')}>
                  <div className="token-symbol">{Object.keys(pool.balances).join('-')}</div>
                  <div className="token-amount-container">
                    <div className="token-usd-price">${pool.usdPrice!.toNumber().toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {tokensInfo?.lockedCelo.available && (
            <div className="detail-section">
              <h3 className="detail-title">Locked CELO</h3>
              {(tokensInfo?.lockedCelo.total ?? 0) > 0 && (
                <div className="token-info">
                  <div className="token-symbol">Total</div>
                  <div className="token-amount-container">
                    <div className="token-usd-price">${tokensInfo?.lockedCelo.usdPrice!.dividedBy(1E18).toNumber().toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                    <div className="token-balance">{tokensInfo?.lockedCelo.total!.dividedBy(1E18).toNumber().toLocaleString()}</div>
                  </div>
                </div>
              )}
              {(tokensInfo?.lockedCelo.nonVoting ?? 0) > 0 && (
                <div className="token-info">
                  <div className="token-symbol">Non voting</div>
                  <div className="token-amount-container">
                    <div className="token-usd-price">${tokensInfo?.lockedCelo.nonVotingUsdPrice!.dividedBy(1E18).toNumber().toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                    <div className="token-balance">{tokensInfo?.lockedCelo.nonVoting!.dividedBy(1E18).toNumber().toLocaleString()}</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
