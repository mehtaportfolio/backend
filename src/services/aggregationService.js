/**
 * Asset Aggregation Service
 * Combines all asset types into a unified portfolio view
 */

const toNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value == null) return 0;
  const parsed = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Calculate bank holdings from latest month
 */
export function calculateBankHoldings(transactions = []) {
  if (!transactions.length) {
    return { savings: 0, demat: 0, total: 0 };
  }

  const filtered = transactions.filter((txn) => {
    const type = String(txn?.account_type || '').toLowerCase();
    return type === 'savings' || type === 'demat';
  });

  if (!filtered.length) {
    return { savings: 0, demat: 0, total: 0 };
  }

  let latestMonthNumeric = -Infinity;
  filtered.forEach((txn) => {
    if (!txn?.txn_date) return;
    const date = new Date(txn.txn_date);
    if (Number.isNaN(date.getTime())) return;
    const monthNumeric = date.getFullYear() * 100 + (date.getMonth() + 1);
    if (monthNumeric > latestMonthNumeric) {
      latestMonthNumeric = monthNumeric;
    }
  });

  if (!Number.isFinite(latestMonthNumeric) || latestMonthNumeric < 0) {
    return { savings: 0, demat: 0, total: 0 };
  }

  const groups = new Map();
  filtered.forEach((txn) => {
    const key = `${txn.account_name || ''}||${txn.bank_name || ''}||${txn.account_type || ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(txn);
  });

  let savingsSum = 0;
  let dematSum = 0;

  groups.forEach((list) => {
    const match = [...list]
      .filter((txn) => txn?.txn_date)
      .sort((a, b) => new Date(b.txn_date || 0) - new Date(a.txn_date || 0))
      .find((txn) => {
        const date = new Date(txn.txn_date);
        if (Number.isNaN(date.getTime())) return false;
        const monthNumeric = date.getFullYear() * 100 + (date.getMonth() + 1);
        return monthNumeric === latestMonthNumeric;
      });

    if (!match) return;

    const type = String(match.account_type || '').toLowerCase();
    const amount = toNumber(match.amount);

    if (type === 'savings') {
      savingsSum += amount;
    } else if (type === 'demat') {
      dematSum += amount;
    }
  });

  return { savings: savingsSum, demat: dematSum, total: savingsSum + dematSum };
}

/**
 * Calculate PPF holdings
 */
export function calculatePPFHoldings(transactions = []) {
  const grouped = transactions.reduce((acc, txn) => {
    const key = txn.account_name || 'unknown';
    if (!acc[key]) acc[key] = [];
    acc[key].push(txn);
    return acc;
  }, {});

  let totalInvested = 0;
  let totalInterest = 0;

  Object.values(grouped).forEach((accountTxns) => {
    accountTxns.sort((a, b) => new Date(a.txn_date) - new Date(b.txn_date));

    let invested = 0;
    let interest = 0;

    accountTxns.forEach((txn) => {
      const amount = toNumber(txn.amount);
      const type = String(txn.transaction_type || '').toLowerCase();

      if (type === 'deposit') {
        invested += amount;
      } else if (type === 'interest') {
        interest += amount;
      } else if (type === 'withdrawal') {
        let remaining = amount;
        const reduceInterest = Math.min(remaining, interest);
        interest -= reduceInterest;
        remaining -= reduceInterest;
        const reduceDeposit = Math.min(remaining, invested);
        invested -= reduceDeposit;
      }
    });

    totalInvested += invested;
    totalInterest += interest;
  });

  return {
    invested: totalInvested,
    interest: totalInterest,
    total: totalInvested + totalInterest,
  };
}

/**
 * Calculate EPF holdings
 */
export function calculateEPFHoldings(transactions = []) {
  let totalInvested = 0;
  let totalInterest = 0;

  (transactions || []).forEach((txn) => {
    const amount = toNumber(txn.employee_share) + toNumber(txn.employer_share) + toNumber(txn.pension_share);
    if (amount <= 0) return;

    const type = String(txn.invest_type || '').toLowerCase();

    if (type.includes('withdraw')) {
      let remaining = amount;
      const reduceInterest = Math.min(remaining, totalInterest);
      totalInterest -= reduceInterest;
      remaining -= reduceInterest;
      const reduceDeposit = Math.min(remaining, totalInvested);
      totalInvested -= reduceDeposit;
    } else if (type.includes('interest')) {
      totalInterest += amount;
    } else {
      totalInvested += amount;
    }
  });

  return {
    invested: Math.max(totalInvested, 0),
    interest: totalInterest,
    total: Math.max(totalInvested, 0) + totalInterest,
  };
}

/**
 * Calculate NPS holdings
 */
export function calculateNPSHoldings(transactions = [], cmpMap = new Map()) {
  const lotsByScheme = new Map();

  const preparedTransactions = (transactions || [])
    .map((txn, index) => {
      const schemeName = String(txn.scheme_name || '').trim();
      if (!schemeName) return null;
      const accountName = String(txn.account_name || '').trim();
      const type = String(txn.transaction_type || '').toLowerCase();
      const units = toNumber(txn.units);
      const nav = toNumber(txn.nav);

      const date = txn.date || txn.txn_date || txn.created_at;
      const effectiveDate = date ? new Date(date) : null;

      return {
        schemeName,
        accountName,
        type,
        units,
        nav,
        effectiveDate,
        index,
      };
    })
    .filter((tx) => tx && Number.isFinite(tx.units) && Math.abs(tx.units) > 1e-8)
    .sort((a, b) => {
      const aTime = a.effectiveDate ? a.effectiveDate.getTime() : Number.POSITIVE_INFINITY;
      const bTime = b.effectiveDate ? b.effectiveDate.getTime() : Number.POSITIVE_INFINITY;
      if (aTime !== bTime) return aTime - bTime;
      return a.index - b.index;
    });

  preparedTransactions.forEach((txn) => {
    const { schemeName, accountName, type, units, nav, effectiveDate, index } = txn;
    const key = `${schemeName}||${accountName}`;
    if (!lotsByScheme.has(key)) {
      lotsByScheme.set(key, []);
    }
    const lots = lotsByScheme.get(key);

    const FIFO_KEYWORDS = ['sell', 'redeem', 'withdraw', 'switch out', 'exit'];
    const isSaleType = units < 0 || FIFO_KEYWORDS.some((kw) => type.includes(kw));

    if (type.includes('buy') && units > 0) {
      lots.push({
        units,
        cost: units * nav,
        date: effectiveDate,
        order: effectiveDate ? effectiveDate.getTime() : Number.POSITIVE_INFINITY,
        sequence: index,
      });
    } else if (isSaleType) {
      let remaining = Math.abs(units);
      while (remaining > 1e-8 && lots.length) {
        const lot = lots[0];
        const deduction = Math.min(remaining, lot.units);
        lot.units -= deduction;
        remaining -= deduction;
        if (lot.units <= 1e-8) {
          lots.shift();
        }
      }
    }
  });

  let totalMarketValue = 0;
  let totalInvested = 0;
  const holdings = [];

  lotsByScheme.forEach((lots, key) => {
    const [schemeName, accountName] = key.split('||');
    const openLots = lots.filter((lot) => lot.units > 1e-8);
    if (!openLots.length) return;

    const totalUnits = openLots.reduce((sum, lot) => sum + lot.units, 0);
    const totalCost = openLots.reduce((sum, lot) => sum + Math.max(lot.cost, 0), 0);
    const cmp = cmpMap.get(schemeName) || 0;
    const marketValue = totalUnits * cmp;

    holdings.push({
      schemeName,
      accountName,
      units: totalUnits,
      invested: totalCost,
      marketValue,
      cmp,
    });

    totalMarketValue += marketValue;
    totalInvested += totalCost;
  });

  return {
    marketValue: totalMarketValue,
    invested: totalInvested,
    holdings,
  };
}

/**
 * Calculate FD holdings (placeholder - no transactions, manual entry)
 */
export function calculateFDHoldings() {
  return {
    invested: 0,
    marketValue: 0,
    total: 0,
  };
}

export default {
  calculateBankHoldings,
  calculatePPFHoldings,
  calculateEPFHoldings,
  calculateNPSHoldings,
  calculateFDHoldings,
};