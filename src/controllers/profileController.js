const { pool } = require('../config/database');
const { fetchUserProfile, fetchUserRepos, computeRepoInsights } = require('../services/githubService');
const {
  upsertProfile,
  insertStats,
  replaceLanguages,
  replaceTopRepos,
  logAnalysis,
  getProfileByUsername,
  getAllProfiles,
  deleteProfile,
} = require('../models/profileModel');

/**
 * POST /api/profiles/analyze/:username
 * Fetch from GitHub, analyze, and store
 */
async function analyzeProfile(req, res) {
  const { username } = req.params;
  const ip = req.ip || req.connection?.remoteAddress;

  if (!username || !/^[a-zA-Z0-9_-]{1,39}$/.test(username)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid GitHub username format',
    });
  }

  let conn;
  try {
    // 1. Fetch data from GitHub
    const [ghUser, repos] = await Promise.all([
      fetchUserProfile(username),
      fetchUserRepos(username),
    ]);

    // 2. Compute insights from repos
    const insights = computeRepoInsights(repos);

    // 3. Persist everything in a transaction
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const profileId = await upsertProfile(conn, ghUser);
    await insertStats(conn, profileId, ghUser, insights);
    await replaceLanguages(conn, profileId, insights.languages);
    await replaceTopRepos(conn, profileId, insights.topRepos);

    await conn.commit();

    // 4. Log success
    await logAnalysis(username, 'success', 'Analysis completed', ip);

    // 5. Return the freshly stored profile
    const result = await getProfileByUsername(username);

    return res.status(200).json({
      success: true,
      message: `Profile "${username}" analyzed and stored successfully`,
      data: result,
    });
  } catch (err) {
    if (conn) await conn.rollback().catch(() => {});
    await logAnalysis(username, 'failed', err.message, ip);

    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message,
    });
  } finally {
    if (conn) conn.release();
  }
}

/**
 * GET /api/profiles
 * List all analyzed profiles with pagination and sorting
 */
async function listProfiles(req, res) {
  try {
    const { page = 1, limit = 20, sortBy = 'analyzed_at', order = 'DESC' } = req.query;

    if (limit > 100) {
      return res.status(400).json({ success: false, message: 'limit cannot exceed 100' });
    }

    const result = await getAllProfiles({ page, limit, sortBy, order });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * GET /api/profiles/:username
 * Fetch a single stored profile with full details
 */
async function getProfile(req, res) {
  try {
    const { username } = req.params;
    const result = await getProfileByUsername(username);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: `Profile "${username}" not found. Use POST /api/profiles/analyze/${username} to analyze it first.`,
      });
    }

    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * DELETE /api/profiles/:username
 * Remove a profile from the database
 */
async function removeProfile(req, res) {
  try {
    const { username } = req.params;
    const deleted = await deleteProfile(username);

    if (!deleted) {
      return res.status(404).json({ success: false, message: `Profile "${username}" not found` });
    }

    return res.status(200).json({ success: true, message: `Profile "${username}" deleted` });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * GET /api/profiles/compare?users=user1,user2
 * Side-by-side comparison of two analyzed profiles
 */
async function compareProfiles(req, res) {
  try {
    const { users } = req.query;
    if (!users) {
      return res.status(400).json({ success: false, message: 'Provide ?users=user1,user2' });
    }

    const usernames = users.split(',').map((u) => u.trim()).slice(0, 5);
    if (usernames.length < 2) {
      return res.status(400).json({ success: false, message: 'Provide at least 2 usernames' });
    }

    const results = await Promise.all(usernames.map(getProfileByUsername));
    const missing = usernames.filter((_, i) => !results[i]);

    if (missing.length > 0) {
      return res.status(404).json({
        success: false,
        message: `These profiles have not been analyzed yet: ${missing.join(', ')}`,
      });
    }

    return res.status(200).json({ success: true, data: results });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * GET /api/profiles/stats/summary
 * Aggregate stats across all stored profiles
 */
async function globalSummary(req, res) {
  try {
    const [[counts]] = await pool.query(`
      SELECT
        COUNT(DISTINCT p.id)                           AS total_profiles,
        SUM(ps.followers)                              AS total_followers,
        SUM(ps.public_repos)                           AS total_repos,
        SUM(ps.total_stars)                            AS total_stars,
        AVG(ps.followers)                              AS avg_followers,
        AVG(ps.total_stars)                            AS avg_stars,
        MAX(ps.followers)                              AS max_followers,
        MAX(ps.total_stars)                            AS max_stars
      FROM profiles p
      LEFT JOIN profile_stats ps ON ps.id = (
        SELECT id FROM profile_stats WHERE profile_id = p.id ORDER BY snapshot_at DESC LIMIT 1
      )
    `);

    const [topLanguages] = await pool.query(`
      SELECT language, SUM(repo_count) AS total_repos
      FROM profile_languages
      GROUP BY language
      ORDER BY total_repos DESC
      LIMIT 10
    `);

    const [topByStars] = await pool.query(`
      SELECT p.username, p.avatar_url, ps.total_stars, ps.followers
      FROM profiles p
      JOIN profile_stats ps ON ps.id = (
        SELECT id FROM profile_stats WHERE profile_id = p.id ORDER BY snapshot_at DESC LIMIT 1
      )
      ORDER BY ps.total_stars DESC
      LIMIT 5
    `);

    return res.status(200).json({
      success: true,
      data: { counts, topLanguages, topByStars },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = {
  analyzeProfile,
  listProfiles,
  getProfile,
  removeProfile,
  compareProfiles,
  globalSummary,
};
