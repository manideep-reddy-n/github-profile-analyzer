/**
 * Integration tests using supertest.
 * These mock the GitHub service and DB layer so no live connections are needed.
 *
 * To run with a live DB:
 *   1. Copy .env.example → .env and fill in credentials
 *   2. npm run migrate
 *   3. npm test
 */

const request = require('supertest');

// ─── Mock dependencies before importing the app ──────────────────────────────
jest.mock('../src/config/database', () => ({
  pool: {
    query: jest.fn(),
    getConnection: jest.fn(),
  },
  testConnection: jest.fn().mockResolvedValue(true),
}));

jest.mock('../src/services/githubService', () => ({
  fetchUserProfile: jest.fn(),
  fetchUserRepos: jest.fn(),
  computeRepoInsights: jest.fn(),
}));

jest.mock('../src/models/profileModel', () => ({
  upsertProfile: jest.fn(),
  insertStats: jest.fn(),
  replaceLanguages: jest.fn(),
  replaceTopRepos: jest.fn(),
  logAnalysis: jest.fn(),
  getProfileByUsername: jest.fn(),
  getAllProfiles: jest.fn(),
  deleteProfile: jest.fn(),
}));

const app = require('../src/app');
const githubService = require('../src/services/githubService');
const profileModel = require('../src/models/profileModel');
const db = require('../src/config/database');

// ─── Test data ────────────────────────────────────────────────────────────────
const mockGhUser = {
  login: 'torvalds',
  name: 'Linus Torvalds',
  bio: 'Linux kernel creator',
  location: 'Portland, OR',
  company: null,
  blog: '',
  email: null,
  twitter_username: null,
  avatar_url: 'https://avatars.githubusercontent.com/u/1024025',
  html_url: 'https://github.com/torvalds',
  type: 'User',
  hireable: null,
  created_at: '2011-09-03T15:26:22Z',
  updated_at: '2024-01-01T00:00:00Z',
  public_repos: 6,
  public_gists: 0,
  followers: 220000,
  following: 0,
};

const mockInsights = {
  totalStars: 185000,
  totalForks: 51000,
  totalWatchers: 185000,
  totalOpenIssues: 0,
  originalRepos: 5,
  forkedRepos: 1,
  avgStarsPerRepo: 30833.33,
  mostUsedLanguage: 'C',
  languages: [{ language: 'C', repo_count: 4, percentage: 66.67 }],
  topRepos: [
    {
      repo_name: 'linux',
      description: 'Linux kernel source tree',
      language: 'C',
      stars: 183000,
      forks: 50000,
      watchers: 183000,
      open_issues: 0,
      is_fork: false,
      repo_url: 'https://github.com/torvalds/linux',
      created_at_gh: new Date('2011-09-04'),
      pushed_at: new Date('2024-01-01'),
    },
  ],
};

const mockStoredProfile = {
  profile: { id: 1, username: 'torvalds', name: 'Linus Torvalds', analyzed_at: new Date() },
  stats: { public_repos: 6, followers: 220000, total_stars: 185000 },
  languages: [{ language: 'C', repo_count: 4, percentage: 66.67 }],
  topRepos: [{ repo_name: 'linux', stars: 183000 }],
  history: [],
};

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('Health check', () => {
  it('GET /health → 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('POST /api/profiles/analyze/:username', () => {
  beforeEach(() => {
    githubService.fetchUserProfile.mockResolvedValue(mockGhUser);
    githubService.fetchUserRepos.mockResolvedValue([]);
    githubService.computeRepoInsights.mockReturnValue(mockInsights);

    const mockConn = {
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn(),
    };
    db.pool.getConnection.mockResolvedValue(mockConn);

    profileModel.upsertProfile.mockResolvedValue(1);
    profileModel.insertStats.mockResolvedValue();
    profileModel.replaceLanguages.mockResolvedValue();
    profileModel.replaceTopRepos.mockResolvedValue();
    profileModel.logAnalysis.mockResolvedValue();
    profileModel.getProfileByUsername.mockResolvedValue(mockStoredProfile);
  });

  it('analyzes a valid username and returns 200', async () => {
    const res = await request(app).post('/api/profiles/analyze/torvalds');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
  });

  it('returns 400 for invalid username format', async () => {
    const res = await request(app).post('/api/profiles/analyze/invalid user!');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 404 when GitHub user does not exist', async () => {
    const err = new Error('GitHub user "doesnotexist" not found');
    err.statusCode = 404;
    githubService.fetchUserProfile.mockRejectedValue(err);

    const res = await request(app).post('/api/profiles/analyze/doesnotexist');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/profiles', () => {
  it('returns paginated profile list', async () => {
    profileModel.getAllProfiles.mockResolvedValue({
      data: [{ username: 'torvalds' }],
      pagination: { total: 1, page: 1, limit: 20, totalPages: 1 },
    });

    const res = await request(app).get('/api/profiles');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('rejects limit > 100', async () => {
    const res = await request(app).get('/api/profiles?limit=200');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/profiles/:username', () => {
  it('returns a stored profile', async () => {
    profileModel.getProfileByUsername.mockResolvedValue(mockStoredProfile);
    const res = await request(app).get('/api/profiles/torvalds');
    expect(res.status).toBe(200);
    expect(res.body.data.profile.username).toBe('torvalds');
  });

  it('returns 404 for unstored profile', async () => {
    profileModel.getProfileByUsername.mockResolvedValue(null);
    const res = await request(app).get('/api/profiles/unknownxyz');
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/profiles/:username', () => {
  it('deletes an existing profile', async () => {
    profileModel.deleteProfile.mockResolvedValue(true);
    const res = await request(app).delete('/api/profiles/torvalds');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 404 when profile not found', async () => {
    profileModel.deleteProfile.mockResolvedValue(false);
    const res = await request(app).delete('/api/profiles/ghost');
    expect(res.status).toBe(404);
  });
});

describe('404 handler', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/api/unknown/route');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
