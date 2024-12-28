import ccxt from 'npm:ccxt';
import { promises as fs } from 'node:fs';

export type PriceRes = {
  exchangeName: string;
  price: number;
  isDex: boolean;
  buyFee: number;
  sellFee: number;
  withdrawFee: number;
};

export type SymbolDetails = {
  [symbol: string]: string[];
};

export type PriceDetails = {
  diff: number;
  ratio: number;
  profit: number;
  min: PriceRes;
  max: PriceRes;
};

export type Prices = { [symbol: string]: PriceDetails }

// Fetch exchange details for fees
export async function isDex(exchange: any): Promise<boolean> {
  return Boolean(exchange.options?.isDex);
}

export async function fetchPriceWithFees(exchange: any, symbol: string): Promise<PriceRes | null> {
  console.log('Checking', symbol, 'on', exchange.id);
  try {
    const ticker = await exchange.fetchTicker(symbol);
    const buyFee = exchange.fees?.trading?.taker || 0.002; // Fallback to 0.2%
    const sellFee = exchange.fees?.trading?.maker || 0.002;
    const withdrawFee = exchange.fees?.funding?.withdraw[symbol.split('/')[0]] || 0; // Base asset withdrawal fee

    return {
      exchangeName: exchange.name,
      price: ticker.last,
      isDex: await isDex(exchange),
      buyFee,
      sellFee,
      withdrawFee,
    };
  } catch (e) {
    console.error(e.constructor.name, e.message);
    return null;
  }
}

// Compare prices for arbitrage
export async function compareSymbol(exchanges: any[], symbol: string): Promise<[PriceRes, PriceRes] | null> {
  console.log('Comparing', symbol);
  const results = (await Promise.all(exchanges.map((exchange) => fetchPriceWithFees(exchange, symbol)))).filter(
    (result): result is PriceRes => result !== null && result.price !== null
  );

  if (results.length === 0) {
    console.log('No valid results for', symbol);
    return null;
  }

  return [
    results.reduce((min, res) => (res.price < min.price ? res : min)),
    results.reduce((max, res) => (res.price > max.price ? res : max)),
  ];
}

// Calculate profit with fees
export function calculateProfitWithFees(min: PriceRes, max: PriceRes, amount: number) {
  const { price: minPrice, buyFee: minBuyFee, withdrawFee: minWithdrawFee } = min;
  const { price: maxPrice, sellFee: maxSellFee } = max;

  const cost = minPrice * (1 + minBuyFee) * amount;
  const transferCost = minWithdrawFee;
  const revenue = maxPrice * (1 - maxSellFee) * amount;

  return revenue - cost - transferCost;
}

// Collect symbols from exchanges
export async function collectSymbols() {
  console.log('Started collecting symbols');

  const exchanges: any[] = [];
  const symbols: SymbolDetails = {};

  for (const exchangeId of ccxt.exchanges) {
    try {
      const exchange = new ccxt[exchangeId]();
      await exchange.loadMarkets();
      exchanges.push(exchange);
    } catch (e) {
      console.error(`Error processing exchange ${exchangeId}: ${e}`);
    }
  }

  for (const exchange of exchanges) {
    if (!Array.isArray(exchange.symbols)) continue;
    for (const sym of exchange.symbols) {
      if (!symbols[sym]) symbols[sym] = [];
      symbols[sym].push(exchange.id);
    }
  }

  await fs.writeFile('symbols.json', JSON.stringify(symbols, null, 2));
  console.log(symbols);
}

// Read symbols from file
export async function getSymbols(): Promise<SymbolDetails> {
  const data = await fs.readFile('symbols.json', 'utf-8');
  return JSON.parse(data);
}

// Execute trades for arbitrage
export async function executeTrade(opportunity: PriceDetails, amount: number) {
  const { min, max } = opportunity;
  const { exchangeName: minExchange, price: minPrice } = min;
  const { exchangeName: maxExchange, price: maxPrice } = max;

  console.log('Executing trade between', minExchange, 'and', maxExchange);

  try {
    const buyOrder = await min.createOrder('limit', 'buy', amount, minPrice);
    console.log('Bought:', buyOrder);

    const withdrawal = await min.withdraw('USDT', amount);
    console.log('Transferred:', withdrawal);

    const sellOrder = await max.createOrder('limit', 'sell', amount, maxPrice);
    console.log('Sold:', sellOrder);
  } catch (error) {
    console.error('Error during trade execution:', error);
  }
}


