/**
 * Assets API Routes
 * Endpoints for Bank, NPS, BDM, EPF, PPF data
 */

import express from 'express';
import { getBankData, getNPSData, getBDMData, getEPFData, getPPFData, getMFData } from '../services/assetService.js';

const router = express.Router();

/**
 * GET /api/assets/bank
 * Fetch all bank transactions with summaries
 */
router.get('/bank', async (req, res, next) => {
  try {
    const data = await getBankData();
    res.json(data);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/assets/nps
 * Fetch all NPS transactions and fund master
 */
router.get('/nps', async (req, res, next) => {
  try {
    const data = await getNPSData();
    res.json(data);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/assets/bdm
 * Fetch all BDM transactions
 */
router.get('/bdm', async (req, res, next) => {
  try {
    const data = await getBDMData();
    res.json(data);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/assets/epf
 * Fetch all EPF transactions with company aggregation
 */
router.get('/epf', async (req, res, next) => {
  try {
    const data = await getEPFData();
    res.json(data);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/assets/ppf
 * Fetch all PPF transactions with account summaries
 */
router.get('/ppf', async (req, res, next) => {
  try {
    const data = await getPPFData();
    res.json(data);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/assets/mf
 * Fetch all mutual fund transactions, master data, and processed holdings
 */
router.get('/mf', async (req, res, next) => {
  try {
    const data = await getMFData();
    res.json(data);
  } catch (error) {
    next(error);
  }
});

export default router;