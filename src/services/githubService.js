const axios = require('axios');
require('dotenv').config();

const githubClient = axios.create({
  baseURL: 'https://api.github.com',
  timeout: 15000,
  headers: {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(process.env.GITHUB_TOKEN && {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    }),
  },
});

/**
 * Fetch a user's public profile from GitHub
 */
async function fetchUserProfile(username) {
  try {
    const { data } = await githubClient.get(`/users/${username}`);
    return data;
  } catch (err) {
    if (err.response?.status === 404) {
      const error = new Error(`GitHub user "${username}" not found`);
      error.statusCode = 404;
      throw error;
    }
    if (err.response?.status === 403) {
      const error = new Error('GitHub API rate limit exceeded. Provide a GITHUB_TOKEN to increase limits.');
      error.statusCode = 429;
      throw error;
    }
    throw new Error(`GitHub API error: ${err.message}`);
  }
}

/**
 * Fetch all public repos (handles pagination automatically)
 */
async function fetchUserRepos(username) {
  const repos = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const { data } = await githubClient.get(`/users/${username}/repos`, {
      params: { per_page: perPage, page, sort: 'updated' },
    });
    repos.push(...data);
    if (data.length < perPage) break;
    page++;
    if (page > 10) break; // cap at 1000 repos
  }

  return repos;
}

/**
 * Compute derived insights from repos array
 */
function computeRepoInsights(repos) {
  const languageMap = {};
  let totalStars = 0;
  let totalForks = 0;
  let totalWatchers = 0;
  let totalOpenIssues = 0;
  let originalRepos = 0;
  let forkedRepos = 0;

  for (const repo of repos) {
    totalStars += repo.stargazers_count || 0;
    totalForks += repo.forks_count || 0;
    totalWatchers += repo.watchers_count || 0;
    totalOpenIssues += repo.open_issues_count || 0;

    if (repo.fork) {
      forkedRepos++;
    } else {
      originalRepos++;
    }

    if (repo.language) {
      languageMap[repo.language] = (languageMap[repo.language] || 0) + 1;
    }
  }

  // Sort languages by usage
  const sortedLanguages = Object.entries(languageMap)
    .sort(([, a], [, b]) => b - a)
    .map(([language, count]) => ({
      language,
      repo_count: count,
      percentage: repos.length > 0 ? parseFloat(((count / repos.length) * 100).toFixed(2)) : 0,
    }));

  const mostUsedLanguage = sortedLanguages[0]?.language || null;

  // Top 5 repos by stars (excluding forks for quality signal)
  const topRepos = [...repos]
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 5)
    .map((r) => ({
      repo_name: r.name,
      description: r.description,
      language: r.language,
      stars: r.stargazers_count,
      forks: r.forks_count,
      watchers: r.watchers_count,
      open_issues: r.open_issues_count,
      is_fork: r.fork,
      repo_url: r.html_url,
      created_at_gh: r.created_at ? new Date(r.created_at) : null,
      pushed_at: r.pushed_at ? new Date(r.pushed_at) : null,
    }));

  return {
    totalStars,
    totalForks,
    totalWatchers,
    totalOpenIssues,
    originalRepos,
    forkedRepos,
    avgStarsPerRepo: repos.length > 0 ? parseFloat((totalStars / repos.length).toFixed(2)) : 0,
    mostUsedLanguage,
    languages: sortedLanguages,
    topRepos,
  };
}

module.exports = { fetchUserProfile, fetchUserRepos, computeRepoInsights };
