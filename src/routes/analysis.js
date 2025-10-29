import express from 'express';
import { getAnalysisDashboard, getAnalysisSummary, getAnalysisFreeStocks } from '../services/analysisService.js';

const router = express.Router();

// Analysis Dashboard - Account-wise stocks, top gainers/losers
router.get('/dashboard', async (req, res, next) => {
  try {
    const data = await getAnalysisDashboard();
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Analysis Summary - Active/Closed equity and MF positions
router.get('/summary', async (req, res, next) => {
  try {
    const data = await getAnalysisSummary();
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Free Stocks Analysis
router.get('/free-stocks', async (req, res, next) => {
  try {
    const data = await getAnalysisFreeStocks();
    res.json(data);
  } catch (error) {
    next(error);
  }
});

export default router;