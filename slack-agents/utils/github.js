// utils/github.js — Poll jessestay/transkrybe for commits and PRs via Octokit

const { Octokit } = require('@octokit/rest');

const OWNER = 'jessestay';
const REPO = 'transkrybe';

let octokit = null;

function getOctokit() {
  if (!octokit) {
    octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN,
      userAgent: 'jesse-slack-agents/2.0',
    });
  }
  return octokit;
}

/**
 * Fetch the latest commit on the default branch.
 * Returns { sha, message, author, date, url } or null.
 */
async function getLatestCommit(branch = 'main') {
  try {
    const { data } = await getOctokit().repos.listCommits({
      owner: OWNER,
      repo: REPO,
      sha: branch,
      per_page: 1,
    });

    if (!data || data.length === 0) return null;

    const commit = data[0];
    return {
      sha: commit.sha.substring(0, 7),
      fullSha: commit.sha,
      message: commit.commit.message.split('\n')[0], // first line only
      author: commit.commit.author.name,
      date: commit.commit.author.date,
      url: commit.html_url,
    };
  } catch (err) {
    // Try 'master' if 'main' fails
    if (branch === 'main' && err.status === 404) {
      return getLatestCommit('master');
    }
    console.error('[github] Error fetching latest commit:', err.message);
    return null;
  }
}

/**
 * Fetch recent commits since a given SHA.
 * Returns array of { sha, message, author, date, url }.
 */
async function getCommitsSince(sinceDate) {
  try {
    const { data } = await getOctokit().repos.listCommits({
      owner: OWNER,
      repo: REPO,
      since: sinceDate,
      per_page: 10,
    });

    return data.map(commit => ({
      sha: commit.sha.substring(0, 7),
      fullSha: commit.sha,
      message: commit.commit.message.split('\n')[0],
      author: commit.commit.author.name,
      date: commit.commit.author.date,
      url: commit.html_url,
    }));
  } catch (err) {
    console.error('[github] Error fetching commits since date:', err.message);
    return [];
  }
}

/**
 * Fetch open pull requests.
 * Returns array of { number, title, author, state, url, createdAt }.
 */
async function getOpenPRs() {
  try {
    const { data } = await getOctokit().pulls.list({
      owner: OWNER,
      repo: REPO,
      state: 'open',
      per_page: 10,
    });

    return data.map(pr => ({
      number: pr.number,
      title: pr.title,
      author: pr.user.login,
      state: pr.state,
      url: pr.html_url,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
    }));
  } catch (err) {
    console.error('[github] Error fetching PRs:', err.message);
    return [];
  }
}

/**
 * Get recently merged PRs (last 24h).
 */
async function getRecentlyMergedPRs() {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data } = await getOctokit().pulls.list({
      owner: OWNER,
      repo: REPO,
      state: 'closed',
      sort: 'updated',
      direction: 'desc',
      per_page: 5,
    });

    return data
      .filter(pr => pr.merged_at && pr.merged_at > since)
      .map(pr => ({
        number: pr.number,
        title: pr.title,
        author: pr.user.login,
        mergedAt: pr.merged_at,
        url: pr.html_url,
      }));
  } catch (err) {
    console.error('[github] Error fetching merged PRs:', err.message);
    return [];
  }
}

/**
 * Format a new commit for a Slack message.
 */
function formatCommitNotification(commit) {
  return `🔀 *New commit on transkrybe*\n\`${commit.sha}\`  — ${commit.message}\n👤 ${commit.author} · ${new Date(commit.date).toLocaleString('en-US', { timeZone: 'America/Denver' })} MT\n${commit.url}`;
}

/**
 * Format a PR notification.
 */
function formatPRNotification(pr, action = 'opened') {
  const emoji = action === 'merged' ? '✝' : '🔇';
  return `${emoji} *PR #${pr.number} ${action}* ℔ ${pr.title}\n👤 ${pr.author}\n${pr.url}`;
}

module.exports = {
  getLatestCommit,
  getCommitsSince,
  getOpenPRs,
  getRecentlyMergedPRs,
  formatCommitNotification,
  formatPRNotification,
  OWNER,
  REPO,
};
