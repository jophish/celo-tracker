import { ContractKit } from '@celo/contractkit';
import DEFAULT_TOKEN_LIST from '@ubeswap/default-token-list';
import BigNumber from 'bignumber.js';
import erc20Abi from '../abis/ERC20.json';
import factoryContract from '../abis/Factory.json';
import pairContractInterface from '../abis/Pair.json';
import poolManagerInterface from '../abis/PoolManager.json';
import moolaStakingRewardsInterface from '../abis/MoolaStakingRewards.json';
import stakingRewardsInterface from '../abis/StakingRewards.json';
import { getContractKit } from '../helpers/contractKit';
import { range } from '../helpers/utils';

const UBE_FACTORY = '0x62d5b84bE28a183aBB507E125B384122D2C25fAE';
const POOL_MANAGER = '0x9Ee3600543eCcc85020D6bc77EB553d1747a65D2';
const USD_TOKEN_ADDRESS = '0x765DE816845861e75A25fCA122bb6898B8B1282a'
const CELO_TOKEN_ADDRESS = '0x471EcE3750Da237f93B8E339c536989b8978a438'
const mcUSD_TOKEN_ADDRESS = '0x64dEFa3544c695db8c535D289d843a189aa26b98';

function contract(kit: ContractKit, contractAbi: any, address: string) {
  return new kit.web3.eth.Contract(contractAbi, address);
}

export interface TokenAmount {
  balance: BigNumber
  name: string
  symbol: string
  logoURI: string
  address: string
  usdPrice?: BigNumber
}

export async function fetchTokenAmounts(address: string): Promise<TokenAmount[]> {
  const kit = await getContractKit()
  const tokens = DEFAULT_TOKEN_LIST.tokens
  const tokenInfos = await Promise.all(tokens.map(async token => {
    const erc20 = contract(kit, erc20Abi, token.address);
    const balance = await erc20.methods.balanceOf(address).call();
    return {
      balance: new BigNumber(balance),
      name: token.name,
      symbol: token.symbol,
      logoURI: token.logoURI,
      address: token.address
    }
  }))

  return tokenInfos.filter(tokenInfo => tokenInfo.balance.gt(1E14))
}

function getTokenName(tokenAddress: string) {
  return DEFAULT_TOKEN_LIST.tokens.find(tokenInfo => tokenInfo.address === tokenAddress)?.symbol;
}

export interface PooledToken {
  balances: { [token: string]: number }
  tokens: string[]
  usdPrice?: BigNumber
}

async function getShareOfStakingRewards(kit: ContractKit, contractAddress: string, owner: string) {
  const rewards = contract(kit, stakingRewardsInterface, contractAddress);
  const own = await rewards.methods.balanceOf(owner).call();
  if (own === '0') return 0;
  const total = await rewards.methods.totalSupply().call();
  return own / total;
}

async function getTokensInPool(kit: ContractKit, pairContractAddress: string, share: number) {
  const pair = contract(kit, pairContractInterface.abi, pairContractAddress);
  const { reserve0, reserve1 } = await pair.methods.getReserves().call();
    
  const ownReserve0 = share * reserve0;
  const ownReserve1 = share * reserve1;

  const token0 = await pair.methods.token0().call()
  const token1 = await pair.methods.token1().call()
  const token0Name = getTokenName(token0);
  const token1Name = getTokenName(token1);

  if (!token0Name || !token1Name || ownReserve0 === 0 || ownReserve1 === 0) {
    return null
  }
  return {
    balances: {
      [token0Name]: ownReserve0 / 1e18,
      [token1Name]: ownReserve1 / 1e18,
    },
    tokens: [token0, token1]
  };
}

export async function getTripleRewardPool(address: string): Promise<PooledToken[]> {
  const poolsInfo = [
    {
      // mcUSD-mcEUR
      poolAddress: '0x27616d3DBa43f55279726c422daf644bc60128a8',
      simpleStaking: '0xaf13437122cd537C5D8942f17787cbDBd787fE94',
      doubleStaking: '0xb030882BfC44e223FD5e20d8645C961BE9b30BB3',
      tripleStaking: '0x3d823f7979bB3af846D8F1a7d98922514eA203fC'
    }, {
      // mCELO-MOO
      poolAddress: '0x69d5646e63C7cE63171F76EBA89348b52c1D552c',
      simpleStaking: '0xC087aEcAC0a4991f9b0e931Ce2aC77a826DDdaf3',
      doubleStaking: '0x8f309dF7527F16dff49065D3338ea3F3c12B5d09',
      tripleStaking: '0x3c7beeA32A49D96d72ce45C7DeFb5b287479C2ba'
    }
  ]
  const kit = await getContractKit()
  const tokensInfo = await Promise.all(poolsInfo.map(async poolInfo => {
    const tripleShare = await getShareOfStakingRewards(kit, poolInfo.tripleStaking, address)
    const doubleShare = await getShareOfStakingRewards(kit, poolInfo.doubleStaking, poolInfo.tripleStaking)
    const singleShare = await getShareOfStakingRewards(kit, poolInfo.simpleStaking, poolInfo.doubleStaking)
    const baseShare = await getShareOfStakingRewards(kit, poolInfo.poolAddress, poolInfo.simpleStaking)
    const overallShare = tripleShare * doubleShare * singleShare * baseShare
    const q = await getTokensInPool(kit, poolInfo.poolAddress, overallShare)
    return getTokensInPool(kit, poolInfo.poolAddress, overallShare)
  }))
  return tokensInfo.filter(tokensInfo => tokensInfo !== null) as PooledToken[]
}

export async function getUbeswapPooledTokens(address: string): Promise<PooledToken[]> {
  const kit = await getContractKit()
  const poolManager = contract(kit, poolManagerInterface, POOL_MANAGER);

  const poolsCount = await poolManager.methods.poolsCount().call();
  const pools = await Promise.all(
    range(poolsCount).map(async (i) => {
      const stakingAddress = await poolManager.methods.poolsByIndex(i).call();
      return poolManager.methods.pools(stakingAddress).call();
    })
  );

  const balancePartials = await Promise.all(pools.map(async (pool) => {
    const poolShare = await getShareOfStakingRewards(kit, pool.poolAddress, address)
    const baseShare = await getShareOfStakingRewards(kit, pool.stakingToken, pool.poolAddress)
    return getTokensInPool(kit, pool.stakingToken, poolShare * baseShare)
  }));

  return balancePartials.filter(balances => !!balances) as PooledToken[]
}

async function exchangeRateBetweenTokens(token1: string, token2: string) {
  const kit = await getContractKit()
  const contract = new kit.web3.eth.Contract(
    factoryContract.abi as any,
    UBE_FACTORY
  );
  const pairAddress = await contract.methods
    .getPair(token1, token2)
    .call();

  const pairContract = new kit.web3.eth.Contract(
    pairContractInterface.abi as any,
    pairAddress
  );
  const { reserve0, reserve1 } = await pairContract.methods.getReserves().call();

  const numerator = 997 * reserve0;
  const denominator = reserve1 * 1000 + 997;
  const exchangeRate = numerator / denominator;

  return token1 < token2 ? 1 / exchangeRate : exchangeRate
}

async function tokenUsdPrice(tokenAddress: string) {
  const exchangeRate = await exchangeRateBetweenTokens(tokenAddress, mcUSD_TOKEN_ADDRESS)
  if (exchangeRate) {
    return exchangeRate
  }
  return await exchangeRateBetweenTokens(tokenAddress, USD_TOKEN_ADDRESS)
}

const POOF_ADDRESS = '0x00400FcbF0816bebB94654259de7273f4A05c762'
const rCELO_ADDRESS = '0x1a8Dbe5958c597a744Ba51763AbEBD3355996c3e'
const MOO_ADDRESS = '0x17700282592D6917F6A73D0bF8AcCf4D578c131e'
const mCELO_ADDRESS = '0x7037F7296B2fc7908de7b57a89efaa8319f0C500'
const MCO2_ADDRESS = '0x32A9FE697a32135BFd313a6Ac28792DaE4D9979d'
const NTMX_ADDRESS = '0x123ED050805E0998EBEf43671327139224218e50'
const LAPIS_ADDRESS = '0x18414Ce6dAece0365f935F3e78A7C1993e77d8Cd'

const UBE_ADDRESS = '0x00Be915B9dCf56a3CBE739D9B9c202ca692409EC'
const DEFAULT_ADDRESSES = [CELO_TOKEN_ADDRESS, UBE_ADDRESS]

interface Prices {
  [token: string]: number
}

async function addPriceOf(prices: Prices, tokenName: string, tokenAddress: string, baseToken: string, baseAddress: string) {
  const priceInBaseToken = await exchangeRateBetweenTokens(tokenAddress, baseAddress)
  console.log('Z', tokenName, priceInBaseToken, prices[baseToken])
  prices[tokenName] = priceInBaseToken * prices[baseToken]
}

// TODO: It would be better to get prices from a third-party API like coingecko.
export async function fetchTokenPrices(tokenAddresses: string[]) {
  const prices: Prices = {};
  const addressesWithPaths = [POOF_ADDRESS, rCELO_ADDRESS, MOO_ADDRESS, mCELO_ADDRESS, MCO2_ADDRESS, NTMX_ADDRESS, LAPIS_ADDRESS]
  const addressesToFetch = Array.from(new Set(tokenAddresses.concat(DEFAULT_ADDRESSES)))
  await Promise.all(addressesToFetch.map(async tokenAddress => {
    const tokenName = getTokenName(tokenAddress)
    if (!tokenName || addressesWithPaths.includes(tokenAddress)) return
    if (['cusd', 'mcusd'].includes(tokenName.toLowerCase())) {
      prices[tokenName] = 1
    } else {
      prices[tokenName] = await tokenUsdPrice(tokenAddress)
    }
  }))
  prices['mCELO'] = prices['CELO']
  if (tokenAddresses.includes(POOF_ADDRESS)) await addPriceOf(prices, 'POOF', POOF_ADDRESS, 'CELO', CELO_TOKEN_ADDRESS)
  if (tokenAddresses.includes(rCELO_ADDRESS)) await addPriceOf(prices, 'rCELO', rCELO_ADDRESS, 'CELO', CELO_TOKEN_ADDRESS)
  if (tokenAddresses.includes(MOO_ADDRESS)) await addPriceOf(prices, 'MOO', MOO_ADDRESS, 'mCELO', mCELO_ADDRESS)
  if (tokenAddresses.includes(MCO2_ADDRESS)) await addPriceOf(prices, 'cMCO2', MCO2_ADDRESS, 'UBE', UBE_ADDRESS)
  if (tokenAddresses.includes(NTMX_ADDRESS)) await addPriceOf(prices, 'NTMX', NTMX_ADDRESS, 'CELO', CELO_TOKEN_ADDRESS)
  if (tokenAddresses.includes(LAPIS_ADDRESS)) await addPriceOf(prices, 'LAPIS', LAPIS_ADDRESS, 'CELO', CELO_TOKEN_ADDRESS)
  return prices;
}