import { fetchAllRows } from '../db/queries.js';
import { supabase } from '../db/supabaseClient.js';

const toNumber = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (value == null) return 0;
  const parsed = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeType = (value = '') => {
  const lowered = value.toLowerCase();
  const types = ['buy', 'purchase', 'sip', 'contribution', 'sell', 'redeem', 'switch out', 'switch in', 'withdraw', 'charges', 'interest'];
  return types.find((label) => lowered.includes(label)) || lowered;
};

const calculateXirr = (flows) => {
  if (!flows || flows.length < 2) return 0;
  const cashflows = flows
    .map((cf) => ({ amount: Number(cf.amount), date: new Date(cf.date) }))
    .filter((cf) => Number.isFinite(cf.amount) && cf.amount !== 0 && cf.date instanceof Date && !Number.isNaN(cf.date.valueOf()))
    .sort((a, b) => a.date - b.date);

  if (!cashflows.length) return 0;

  const baseDate = cashflows[0].date;
  const MS_PER_YEAR = 1000 * 60 * 60 * 24 * 365;
  const npv = (rate) =>
    cashflows.reduce(
      (acc, cf) => acc + cf.amount / Math.pow(1 + rate, (cf.date - baseDate) / MS_PER_YEAR),
      0,
    );

  let low = -0.9999;
  let high = 100;
  let mid = 0;

  for (let i = 0; i < 100; i += 1) {
    mid = (low + high) / 2;
    const value = npv(mid);
    if (Math.abs(value) < 1e-6) {
      return mid * 100;
    }
    if (value > 0) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return mid * 100;
};

export async function getAnalysisDashboard() {
  try {
    const [{ data: stockTxns }, { data: stockMaster }] = await Promise.all([
      fetchAllRows(supabase, 'stock_transactions', {
        select: 'stock_name, quantity, buy_price, sell_date, account_name, account_type, buy_date, sector, category',
      }),
      fetchAllRows(supabase, 'stock_master', {
        select: 'stock_name, cmp',
      }),
    ]);

    const cmpMap = new Map((stockMaster || []).map((m) => [m.stock_name, toNumber(m.cmp)]));

    // Account-wise stocks
    const accountMap = new Map();
    (stockTxns || []).forEach((txn) => {
      const accountName = (txn.account_name || 'UNKNOWN').trim();
      if (!accountMap.has(accountName)) {
        accountMap.set(accountName, []);
      }
      accountMap.get(accountName).push(txn);
    });

    const accountWise = [];
    accountMap.forEach((txns, accountName) => {
      let invested = 0;
      let marketValue = 0;

      const processLots = (list) => {
        const lots = new Map();
        list.forEach((txn) => {
          const key = txn.stock_name;
          if (!lots.has(key)) {
            lots.set(key, []);
          }
          lots.get(key).push(txn);
        });

        lots.forEach((entries) => {
          const fifo = [];
          entries
            .slice()
            .sort((a, b) => new Date(a.buy_date || a.sell_date || 0) - new Date(b.buy_date || b.sell_date || 0))
            .forEach((txn) => {
              const quantity = toNumber(txn.quantity);
              const price = toNumber(txn.buy_price);
              if (!txn.sell_date) {
                fifo.push({ units: quantity, price });
              } else {
                let remaining = Math.abs(quantity);
                while (remaining > 0 && fifo.length) {
                  const lot = fifo[0];
                  const consumed = Math.min(remaining, lot.units);
                  lot.units -= consumed;
                  remaining -= consumed;
                  if (lot.units <= 1e-6) fifo.shift();
                }
              }
            });

          fifo.forEach((lot) => {
            const cmp = cmpMap.get(entries[0].stock_name) || 0;
            invested += lot.units * lot.price;
            marketValue += lot.units * cmp;
          });
        });
      };

      const stocks = txns.filter((t) => t.account_type !== 'ETF');
      const etfs = txns.filter((t) => t.account_type === 'ETF');

      processLots(stocks);
      processLots(etfs);

      if (invested > 0 || marketValue > 0) {
        accountWise.push({
          accountName,
          invested,
          marketValue,
          profit: marketValue - invested,
          profitPercent: invested > 0 ? ((marketValue - invested) / invested) * 100 : 0,
        });
      }
    });

    // Top stocks
    const stockData = new Map();
    (stockTxns || []).forEach((txn) => {
      const stockName = txn.stock_name;
      if (!stockData.has(stockName)) {
        stockData.set(stockName, []);
      }
      stockData.get(stockName).push(txn);
    });

    const stocks = [];
    stockData.forEach((txns, stockName) => {
      const fifo = [];
      txns
        .slice()
        .sort((a, b) => new Date(a.buy_date || a.sell_date || 0) - new Date(b.buy_date || b.sell_date || 0))
        .forEach((txn) => {
          const quantity = toNumber(txn.quantity);
          const price = toNumber(txn.buy_price);
          if (!txn.sell_date) {
            fifo.push({ units: quantity, price });
          } else {
            let remaining = Math.abs(quantity);
            while (remaining > 0 && fifo.length) {
              const lot = fifo[0];
              const consumed = Math.min(remaining, lot.units);
              lot.units -= consumed;
              remaining -= consumed;
              if (lot.units <= 1e-6) fifo.shift();
            }
          }
        });

      let invested = 0;
      let marketValue = 0;
      const cmp = cmpMap.get(stockName) || 0;
      fifo.forEach((lot) => {
        invested += lot.units * lot.price;
        marketValue += lot.units * cmp;
      });

      if (fifo.length > 0) {
        const profit = marketValue - invested;
        const percent = invested > 0 ? (profit / invested) * 100 : 0;
        stocks.push({
          name: stockName,
          invested,
          marketValue,
          profit,
          percent,
        });
      }
    });

    const gainers = stocks.filter((s) => s.profit > 0).sort((a, b) => b.profit - a.profit).slice(0, 5);
    const losers = stocks.filter((s) => s.profit < 0).sort((a, b) => a.profit - b.profit).slice(0, 5);

    // Enrich stocks with absReturnPct for profit filter
    const enrichedStocks = stocks.map((stock) => ({
      ...stock,
      absReturnPct: stock.percent, // for backward compatibility with absReturnPct
    }));

    return {
      accountWise,
      topGainers: gainers,
      topLosers: losers,
      totalStocks: stocks.length,
      openEquityPositions: {
        stocks: enrichedStocks,
      },
    };
  } catch (error) {
    console.error('Analysis Dashboard error:', error);
    throw error;
  }
}

export async function getAnalysisSummary() {
  try {
    const [{ data: stockTxns }, { data: stockMaster }, { data: mfTxns }, { data: fundMaster }] = await Promise.all([
      fetchAllRows(supabase, 'stock_transactions', {
        select: 'stock_name, quantity, buy_price, sell_date, account_name, account_type, buy_date, sector, category, sell_price',
      }),
      fetchAllRows(supabase, 'stock_master', {
        select: 'stock_name, cmp',
      }),
      fetchAllRows(supabase, 'mf_transactions', {
        select: 'fund_short_name, account_name, units, transaction_type, nav, date, buy_date, sell_date, buy_price',
      }),
      fetchAllRows(supabase, 'fund_master', {
        select: 'fund_short_name, cmp, lcp',
      }),
    ]);

    const cmpMap = new Map((stockMaster || []).map((m) => [m.stock_name, toNumber(m.cmp)]));
    const fundPriceMap = new Map((fundMaster || []).map((m) => [m.fund_short_name, { cmp: toNumber(m.cmp), lcp: toNumber(m.lcp) }]));

    // Process Equity Transactions
    const equityActive = [];
    const equityClosed = [];

    const stockMap = new Map();
    (stockTxns || []).forEach((txn) => {
      const key = txn.stock_name;
      if (!stockMap.has(key)) {
        stockMap.set(key, []);
      }
      stockMap.get(key).push(txn);
    });

    stockMap.forEach((txns, stockName) => {
      const fifo = [];
      const processedTxns = [];

      txns
        .slice()
        .sort((a, b) => new Date(a.buy_date || a.sell_date || 0) - new Date(b.buy_date || b.sell_date || 0))
        .forEach((txn) => {
          const quantity = toNumber(txn.quantity);
          const price = toNumber(txn.buy_price);

          if (!txn.sell_date) {
            // Buy transaction - add to FIFO
            fifo.push({
              units: quantity,
              price,
              buyDate: txn.buy_date,
              txn,
            });
            processedTxns.push({
              ...txn,
              quantity,
              price,
              type: 'buy',
              status: 'active',
            });
          } else {
            // Sell transaction - process FIFO
            let remaining = Math.abs(quantity);
            const soldLots = [];

            while (remaining > 0 && fifo.length) {
              const lot = fifo[0];
              const consumed = Math.min(remaining, lot.units);
              lot.units -= consumed;
              remaining -= consumed;

              soldLots.push({
                units: consumed,
                costPrice: lot.price,
                salePrice: price,
              });

              if (lot.units <= 1e-6) fifo.shift();
            }

            processedTxns.push({
              ...txn,
              quantity,
              price,
              type: 'sell',
              status: 'closed',
              soldLots,
            });
          }
        });

      // Create active position
      if (fifo.length > 0) {
        const totalUnits = fifo.reduce((sum, lot) => sum + lot.units, 0);
        const totalInvested = fifo.reduce((sum, lot) => sum + lot.units * lot.price, 0);
        const cmp = cmpMap.get(stockName) || 0;
        const marketValue = totalUnits * cmp;

        equityActive.push({
          stock_name: stockName,
          account_name: txns[0]?.account_name || 'Unknown',
          account_type: txns[0]?.account_type || 'Stock',
          quantity: totalUnits,
          buy_price: totalInvested > 0 ? totalInvested / totalUnits : 0,
          buy_date: fifo[0]?.buyDate,
          invested_amount: totalInvested,
          market_value: marketValue,
          unrealized_gain: marketValue - totalInvested,
          sector: txns[0]?.sector || '',
          category: txns[0]?.category || '',
        });
      }

      // Create closed positions
      processedTxns
        .filter((t) => t.status === 'closed' && t.soldLots && t.soldLots.length > 0)
        .forEach((saleItem) => {
          saleItem.soldLots.forEach((lot) => {
            equityClosed.push({
              stock_name: stockName,
              account_name: saleItem.account_name || 'Unknown',
              quantity: lot.units,
              buy_price: lot.costPrice,
              buy_date: saleItem.buy_date, // First buy date
              sell_price: lot.salePrice,
              sell_date: saleItem.sell_date,
              invested_amount: lot.units * lot.costPrice,
              sale_amount: lot.units * lot.salePrice,
              charges_allocated: 0, // Would need more info to calculate
              realized_gain: lot.units * (lot.salePrice - lot.costPrice),
            });
          });
        });
    });

    // Process Mutual Fund Transactions
    const mfActive = [];
    const mfClosed = [];

    const fundMap = new Map();
    (mfTxns || []).forEach((txn) => {
      const key = String(txn.fund_short_name || '').trim();
      if (!fundMap.has(key)) {
        fundMap.set(key, []);
      }
      fundMap.get(key).push(txn);
    });

    fundMap.forEach((txns, fundName) => {
      let activeUnits = 0;
      let activeInvested = 0;
      const purchases = [];
      const redemptions = [];

      txns
        .slice()
        .sort((a, b) => new Date(a.buy_date || 0) - new Date(b.buy_date || 0))
        .forEach((txn) => {
          const quantity = toNumber(txn.quantity);
          const price = toNumber(txn.buy_price);

          if (txn.transaction_type && txn.transaction_type.toLowerCase().includes('redeem')) {
            // Redemption
            redemptions.push({
              units: quantity,
              price,
              date: txn.sell_date || txn.buy_date,
              txn,
            });
            activeUnits -= quantity;
            activeInvested -= quantity * price;
          } else {
            // Purchase or SIP
            purchases.push({
              units: quantity,
              price,
              date: txn.buy_date,
              txn,
            });
            activeUnits += quantity;
            activeInvested += quantity * price;
          }
        });

      // Active MF position
      if (activeUnits > 0) {
        const priceInfo = fundPriceMap.get(fundName) || { cmp: 0, lcp: 0 };
        const marketValue = activeUnits * priceInfo.cmp;

        mfActive.push({
          fund_short_name: fundName,
          account_name: txns[0]?.account_name || 'Unknown',
          quantity: activeUnits,
          buy_price: activeUnits > 0 ? activeInvested / activeUnits : 0,
          buy_date: purchases[0]?.date,
          invested_amount: activeInvested,
          market_value: marketValue,
          unrealized_gain: marketValue - activeInvested,
          category: txns[0]?.category || '',
        });
      }

      // Closed MF positions
      redemptions.forEach((redeem) => {
        mfClosed.push({
          fund_short_name: fundName,
          account_name: redeem.txn?.account_name || 'Unknown',
          quantity: redeem.units,
          buy_price: redeem.txn?.buy_price || 0,
          buy_date: redeem.txn?.buy_date,
          sell_price: redeem.price,
          sell_date: redeem.date,
          invested_amount: redeem.units * (redeem.txn?.buy_price || 0),
          sale_amount: redeem.units * redeem.price,
          charges_allocated: 0,
          realized_gain: redeem.units * (redeem.price - (redeem.txn?.buy_price || 0)),
        });
      });
    });

    return {
      equityActive,
      equityClosed,
      mfActive,
      mfClosed,
    };
  } catch (error) {
    console.error('Analysis Summary error:', error);
    throw error;
  }
}

export async function getAnalysisFreeStocks() {
  try {
    const [{ data: stockTxns }, { data: stockMaster }] = await Promise.all([
      fetchAllRows(supabase, 'stock_transactions', {
        select: 'stock_name, quantity, buy_price, sell_date, account_name, account_type, buy_date',
      }),
      fetchAllRows(supabase, 'stock_master', {
        select: 'stock_name, cmp',
      }),
    ]);

    const cmpMap = new Map((stockMaster || []).map((m) => [m.stock_name, toNumber(m.cmp)]));

    const freeStocks = [];
    const regularStocks = [];

    const stockData = new Map();
    (stockTxns || []).forEach((txn) => {
      const key = `${txn.stock_name}||${txn.account_name}`;
      if (!stockData.has(key)) {
        stockData.set(key, []);
      }
      stockData.get(key).push(txn);
    });

    stockData.forEach((txns, key) => {
      const [stockName, accountName] = key.split('||');
      const fifo = [];
      let invested = 0;
      let marketValue = 0;

      txns
        .slice()
        .sort((a, b) => new Date(a.buy_date || 0) - new Date(b.buy_date || 0))
        .forEach((txn) => {
          const quantity = toNumber(txn.quantity);
          const price = toNumber(txn.buy_price);
          if (!txn.sell_date) {
            fifo.push({ units: quantity, price, buyDate: txn.buy_date });
          } else {
            let remaining = Math.abs(quantity);
            while (remaining > 0 && fifo.length) {
              const lot = fifo[0];
              const consumed = Math.min(remaining, lot.units);
              lot.units -= consumed;
              remaining -= consumed;
              if (lot.units <= 1e-6) fifo.shift();
            }
          }
        });

      const cmp = cmpMap.get(stockName) || 0;
      fifo.forEach((lot) => {
        invested += lot.units * lot.price;
        marketValue += lot.units * cmp;
      });

      if (fifo.length > 0) {
        const profit = marketValue - invested;
        const profitPercent = invested > 0 ? (profit / invested) * 100 : 0;

        const stock = {
          stockName,
          accountName,
          invested,
          marketValue,
          profit,
          profitPercent,
          quantity: fifo.reduce((sum, lot) => sum + lot.units, 0),
          avgPrice: invested > 0 ? invested / fifo.reduce((sum, lot) => sum + lot.units, 0) : 0,
        };

        if (accountName && accountName.toLowerCase().includes('free')) {
          freeStocks.push(stock);
        } else {
          regularStocks.push(stock);
        }
      }
    });

    return { freeStocks, regularStocks };
  } catch (error) {
    console.error('Analysis Free Stocks error:', error);
    throw error;
  }
}