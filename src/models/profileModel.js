const { pool } = require('../config/database');

/**
 * Upsert a profile and return its id
 */
async function upsertProfile(conn, ghUser) {
  const [existing] = await conn.query(
    'SELECT id FROM profiles WHERE username = ?',
    [ghUser.login]
  );

  const fields = {
    username: ghUser.login,
    name: ghUser.name || null,
    bio: ghUser.bio || null,
    location: ghUser.location || null,
    company: ghUser.company || null,
    blog: ghUser.blog || null,
    email: ghUser.email || null,
    twitter_handle: ghUser.twitter_username || null,
    avatar_url: ghUser.avatar_url || null,
    github_url: ghUser.html_url || null,
    account_type: ghUser.type || 'User',
    is_hireable: ghUser.hireable ? 1 : 0,
    created_at_gh: ghUser.created_at ? new Date(ghUser.created_at) : null,
    updated_at_gh: ghUser.updated_at ? new Date(ghUser.updated_at) : null,
  };

  if (existing.length > 0) {
    await conn.query(
      `UPDATE profiles SET name=?, bio=?, location=?, company=?, blog=?, email=?,
       twitter_handle=?, avatar_url=?, github_url=?, account_type=?, is_hireable=?,
       created_at_gh=?, updated_at_gh=?, analyzed_at=NOW()
       WHERE username=?`,
      [
        fields.name, fields.bio, fields.location, fields.company, fields.blog,
        fields.email, fields.twitter_handle, fields.avatar_url, fields.github_url,
        fields.account_type, fields.is_hireable, fields.created_at_gh, fields.updated_at_gh,
        fields.username,
      ]
    );
    return existing[0].id;
  } else {
    const [result] = await conn.query(
      `INSERT INTO profiles
       (username, name, bio, location, company, blog, email, twitter_handle,
        avatar_url, github_url, account_type, is_hireable, created_at_gh, updated_at_gh)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fields.username, fields.name, fields.bio, fields.location, fields.company,
        fields.blog, fields.email, fields.twitter_handle, fields.avatar_url,
        fields.github_url, fields.account_type, fields.is_hireable,
        fields.created_at_gh, fields.updated_at_gh,
      ]
    );
    return result.insertId;
  }
}

/**
 * Insert a stats snapshot
 */
async function insertStats(conn, profileId, ghUser, insights) {
  await conn.query(
    `INSERT INTO profile_stats
     (profile_id, public_repos, public_gists, followers, following,
      total_stars, total_forks, total_watchers, total_open_issues,
      original_repos, forked_repos, avg_stars_per_repo, most_used_language)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      profileId,
      ghUser.public_repos || 0,
      ghUser.public_gists || 0,
      ghUser.followers || 0,
      ghUser.following || 0,
      insights.totalStars,
      insights.totalForks,
      insights.totalWatchers,
      insights.totalOpenIssues,
      insights.originalRepos,
      insights.forkedRepos,
      insights.avgStarsPerRepo,
      insights.mostUsedLanguage,
    ]
  );
}

/**
 * Replace language breakdown for this profile
 */
async function replaceLanguages(conn, profileId, languages) {
  await conn.query('DELETE FROM profile_languages WHERE profile_id = ?', [profileId]);

  if (languages.length > 0) {
    const values = languages.map((l) => [profileId, l.language, l.repo_count, l.percentage]);
    await conn.query(
      'INSERT INTO profile_languages (profile_id, language, repo_count, percentage) VALUES ?',
      [values]
    );
  }
}

/**
 * Replace top repos for this profile
 */
async function replaceTopRepos(conn, profileId, topRepos) {
  await conn.query('DELETE FROM top_repositories WHERE profile_id = ?', [profileId]);

  if (topRepos.length > 0) {
    const values = topRepos.map((r) => [
      profileId, r.repo_name, r.description, r.language,
      r.stars, r.forks, r.watchers, r.open_issues,
      r.is_fork ? 1 : 0, r.repo_url, r.created_at_gh, r.pushed_at,
    ]);
    await conn.query(
      `INSERT INTO top_repositories
       (profile_id, repo_name, description, language, stars, forks, watchers,
        open_issues, is_fork, repo_url, created_at_gh, pushed_at) VALUES ?`,
      [values]
    );
  }
}

/**
 * Log an analysis attempt
 */
async function logAnalysis(username, status, message, ip) {
  try {
    await pool.query(
      'INSERT INTO analysis_logs (username, status, message, ip_address) VALUES (?, ?, ?, ?)',
      [username, status, message, ip]
    );
  } catch (_) {
    // non-critical
  }
}

/**
 * Get a full profile with latest stats, languages, and top repos
 */
async function getProfileByUsername(username) {
  const [profiles] = await pool.query(
    'SELECT * FROM profiles WHERE username = ?',
    [username]
  );
  if (profiles.length === 0) return null;

  const profile = profiles[0];
  const profileId = profile.id;

  const [stats] = await pool.query(
    'SELECT * FROM profile_stats WHERE profile_id = ? ORDER BY snapshot_at DESC LIMIT 1',
    [profileId]
  );

  const [languages] = await pool.query(
    'SELECT language, repo_count, percentage FROM profile_languages WHERE profile_id = ? ORDER BY repo_count DESC',
    [profileId]
  );

  const [topRepos] = await pool.query(
    `SELECT repo_name, description, language, stars, forks, watchers,
     open_issues, is_fork, repo_url, created_at_gh, pushed_at
     FROM top_repositories WHERE profile_id = ? ORDER BY stars DESC`,
    [profileId]
  );

  const [history] = await pool.query(
    `SELECT public_repos, followers, following, total_stars, snapshot_at
     FROM profile_stats WHERE profile_id = ? ORDER BY snapshot_at DESC LIMIT 10`,
    [profileId]
  );

  return {
    profile,
    stats: stats[0] || null,
    languages,
    topRepos,
    history,
  };
}

/**
 * Get all analyzed profiles (summary list)
 */
async function getAllProfiles({ page = 1, limit = 20, sortBy = 'analyzed_at', order = 'DESC' } = {}) {
  const allowedSorts = ['analyzed_at', 'username', 'followers', 'public_repos', 'total_stars'];
  const allowedOrders = ['ASC', 'DESC'];
  const safeSort = allowedSorts.includes(sortBy) ? sortBy : 'analyzed_at';
  const safeOrder = allowedOrders.includes(order.toUpperCase()) ? order.toUpperCase() : 'DESC';

  const offset = (page - 1) * limit;

  // Join with latest stats
  const [rows] = await pool.query(
    `SELECT
       p.id, p.username, p.name, p.bio, p.location, p.avatar_url, p.github_url,
       p.account_type, p.analyzed_at,
       ps.public_repos, ps.followers, ps.following, ps.total_stars,
       ps.total_forks, ps.most_used_language, ps.avg_stars_per_repo
     FROM profiles p
     LEFT JOIN profile_stats ps ON ps.id = (
       SELECT id FROM profile_stats WHERE profile_id = p.id ORDER BY snapshot_at DESC LIMIT 1
     )
     ORDER BY ${safeSort === 'followers' || safeSort === 'public_repos' || safeSort === 'total_stars' ? `ps.${safeSort}` : `p.${safeSort}`} ${safeOrder}
     LIMIT ? OFFSET ?`,
    [parseInt(limit), offset]
  );

  const [[{ total }]] = await pool.query('SELECT COUNT(*) as total FROM profiles');

  return {
    data: rows,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Delete a profile and all its related data
 */
async function deleteProfile(username) {
  const [result] = await pool.query('DELETE FROM profiles WHERE username = ?', [username]);
  return result.affectedRows > 0;
}

module.exports = {
  upsertProfile,
  insertStats,
  replaceLanguages,
  replaceTopRepos,
  logAnalysis,
  getProfileByUsername,
  getAllProfiles,
  deleteProfile,
};
