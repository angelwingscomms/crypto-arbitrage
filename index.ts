import ccxt from 'npm:ccxt';
import { promises as fs } from 'node:fs';

type PriceRes = {
  exchangeName: string;
  price: number;
  isDex: boolean;
  buyFee: number;
  sellFee: number;
  withdrawFee: number;
};

type SymbolDetails = {
  [symbol: string]: string[];
};

type PriceDetails = {
  diff: number;
  ratio: number;
  profit: number;
  min: PriceRes;
  max: PriceRes;
};

// Fetch exchange details for fees
async function isDex(exchange: any): Promise<boolean> {
  return Boolean(exchange.options?.isDex);
}

async function fetchPriceWithFees(exchange: any, symbol: string): Promise<PriceRes | null> {
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
async function compareSymbol(exchanges: any[], symbol: string): Promise<[PriceRes, PriceRes] | null> {
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
function calculateProfitWithFees(min: PriceRes, max: PriceRes, amount: number) {
  const { price: minPrice, buyFee: minBuyFee, withdrawFee: minWithdrawFee } = min;
  const { price: maxPrice, sellFee: maxSellFee } = max;

  const cost = minPrice * (1 + minBuyFee) * amount;
  const transferCost = minWithdrawFee;
  const revenue = maxPrice * (1 - maxSellFee) * amount;

  return revenue - cost - transferCost;
}

// Collect symbols from exchanges
async function collectSymbols() {
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
async function getSymbols(): Promise<SymbolDetails> {
  const data = await fs.readFile('symbols.json', 'utf-8');
  return JSON.parse(data);
}

// Execute trades for arbitrage
async function executeTrade(opportunity: PriceDetails, amount: number) {
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

// Scan and identify arbitrage opportunities
async function scan() {
  console.log('Started scanning');

  const exchanges: { [id: string]: any } = {};
  let prices: { [symbol: string]: PriceDetails } = {};
  const symbols = await getSymbols();
  const baseCurrencies = ['USDC', 'USDT'];
  const targetSymbols = ['SOL/USDT'];

  const filteredSymbols = Object.entries(symbols)
    .filter(([symbol, value]) =>
      targetSymbols.some((s) => symbol.includes(s)) &&
      baseCurrencies.some((base) => symbol.includes(base)) &&
      value.length > 1 &&
      /^[^-]+$/.test(symbol)
    )
    .reduce((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {} as SymbolDetails);

  for (const [symbol, exchangeIds] of Object.entries(filteredSymbols)) {
    for (const exchangeId of exchangeIds) {
      if (!exchanges[exchangeId]) {
        try {
          const exchange = new ccxt[exchangeId]();
          await exchange.loadMarkets();
          exchanges[exchangeId] = exchange;
        } catch (e) {
          console.error('Error loading exchange', exchangeId, ':', e);
        }
      }
    }
  }

  for (const [symbol, exchangeIds] of Object.entries(filteredSymbols)) {
    console.log('Analyzing', symbol);
    const symbolExchanges = exchangeIds.map((id) => exchanges[id]).filter(Boolean);
    const minmax = await compareSymbol(symbolExchanges, symbol);
    if (!minmax) continue;

    const diff = calculateProfitWithFees(minmax[0], minmax[1], 1);
    const ratio = ((minmax[1].price / minmax[0].price) - 1) * 100;

    prices[symbol] = { diff, ratio, profit: diff, min: minmax[0], max: minmax[1] };
  }

  prices = Object.fromEntries(
    Object.entries(prices).sort(([, a], [, b]) => b.profit - a.profit)
  );

  console.log('Arbitrage Opportunities:', prices);
  await fs.writeFile('prices.json', JSON.stringify(prices, null, 2));

  // const minProfit = 1;
  // const userAmount = 36; // Example input amount

  // for (const symbol in prices) {
  //   const opportunity = prices[symbol];
  //   const profit = calculateProfitWithFees(opportunity.min, opportunity.max, userAmount);

  //   if (profit > minProfit) {
  //     await executeTrade(opportunity, userAmount);
  //   }
  // }
}

scan().catch(console.error);
