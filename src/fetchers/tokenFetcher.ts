import { ContractKit } from '@celo/contractkit';
import DEFAULT_TOKEN_LIST from '@ubeswap/default-token-list';
import BigNumber from 'bignumber.js';
import erc20Abi from '../abis/ERC20.json';
import factoryContract from '../abis/Factory.json';
import pairContractInterface from '../abis/Pair.json';
import poolManagerInterface from '../abis/PoolManager.json';
import stakingRewardsInterface from '../abis/StakingRewards.json';
import { getContractKit } from '../helpers/contractKit';
import { range } from '../helpers/utils';

const UBE_FACTORY = '0x62d5b84bE28a183aBB507E125B384122D2C25fAE';
const POOL_MANAGER = '0x9Ee3600543eCcc85020D6bc77EB553d1747a65D2';
const USD_TOKEN_ADDRESS = '0x765DE816845861e75A25fCA122bb6898B8B1282a'
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
  return DEFAULT_TOKEN_LIST.tokens.find(tokenInfo => tokenInfo.address === tokenAddress)!.symbol;
}

export interface PooledToken {
  balances: { [token: string]: number }
  tokens: string[]
  usdPrice?: BigNumber
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

  const balancePartials = await Promise.all(
    pools.map(async (pool) => {
      const pair = contract(kit, pairContractInterface.abi, pool.stakingToken);
      
      const token0 = await pair.methods.token0().call()
      const token1 = await pair.methods.token1().call()
      const token0Name = getTokenName(token0);
      const token1Name = getTokenName(token1);
      if (!token0Name || !token1Name) {
        console.error('Something went wrong when finding Ubeswap pools')
        return null
      }

      const rewards = contract(kit, stakingRewardsInterface, pool.poolAddress);
      const own = await rewards.methods.balanceOf(address).call();
      
      if (own === '0') return null;
      const total = await rewards.methods.totalSupply().call();
      const share = own / total;

      const pairTotal = await pair.methods.totalSupply().call();
      const pairOwn = await pair.methods.balanceOf(pool.poolAddress).call();
      const pairShare = pairOwn / pairTotal;
      const { reserve0, reserve1 } = await pair.methods.getReserves().call();
      
      const ownReserve0 = share * (pairShare * reserve0);
      const ownReserve1 = share * (pairShare * reserve1);

      return {
        amounts: {
          [token0Name]: ownReserve0 / 1e18,
          [token1Name]: ownReserve1 / 1e18,
        },
        tokens: [token0, token1]
      };
    })
  );

  return balancePartials
    .filter(balances => !!balances)
    .map(balances => ({
      balances: balances!.amounts,
      tokens: balances!.tokens
    })) as PooledToken[]
  // const balances: { [token: string]: number } = balancePartials.reduce(
  //   (totalBalances, partialBalance) => {
  //     if (partialBalance) {
  //       for (const token of Object.keys(partialBalance)) {
  //         if (!totalBalances[token]) totalBalances[token] = 0;
  //         totalBalances[token] += partialBalance[token];
  //       }
  //     }
  //     return totalBalances;
  //   },
  //   {} as { [token: string]: number }
  // );

  // return balances
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

// TODO: It would be better to get prices from a third-party API like coingecko.
export async function fetchTokenPrices(tokenAddresses: string[]) {
  const prices: { [token: string]: number } = {};
  for (const tokenAddress of tokenAddresses) {
    const tokenName = getTokenName(tokenAddress)
    if (['cusd', 'mcusd'].includes(tokenName.toLowerCase())) {
      prices[tokenName] = 1
    } else {
      prices[tokenName] = await tokenUsdPrice(tokenAddress)
    }
  }
  return prices;
}