const { Router } = require('express');
const {
  analyzeProfile,
  listProfiles,
  getProfile,
  removeProfile,
  compareProfiles,
  globalSummary,
} = require('../controllers/profileController');

const router = Router();

/**
 * @route   GET /api/profiles/stats/summary
 * @desc    Global aggregate stats across all stored profiles
 */
router.get('/stats/summary', globalSummary);

/**
 * @route   GET /api/profiles/compare
 * @desc    Compare multiple profiles side-by-side (?users=user1,user2)
 */
router.get('/compare', compareProfiles);

/**
 * @route   GET /api/profiles
 * @desc    List all analyzed profiles (paginated, sortable)
 * @query   page, limit, sortBy, order
 */
router.get('/', listProfiles);

/**
 * @route   POST /api/profiles/analyze/:username
 * @desc    Analyze a GitHub user profile and persist results
 */
router.post('/analyze/:username', analyzeProfile);

/**
 * @route   GET /api/profiles/:username
 * @desc    Get a single stored profile with full details
 */
router.get('/:username', getProfile);

/**
 * @route   DELETE /api/profiles/:username
 * @desc    Remove a profile and all its data from the database
 */
router.delete('/:username', removeProfile);

module.exports = router;
