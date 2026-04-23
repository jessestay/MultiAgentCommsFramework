// utils/gofundme.js — Poll a GoFundMe campaign for donation total changes
// GoFundMe doesn't have a public API, so we fetch the page and parse the total.
// Configure via env vars:
//   GOFUNDME_URL  — full campaign URL (if not set, polling is disabled)
//   GOFUNDME_GOAL — numeric goal in USD (default 0)

const fetch = (...args) => import('node-fetch').then(m => m.default(...args));
const cheerio = require('cheerio');

const GOFUNDME_URL = process.env.GOFUNDME_URL || null;
const GOAL = parseInt(process.env.GOFUNDME_GOAL || '0', 10);

/**
 * Fetch current donation total from GoFundMe page.
 * Returns { amount, currency, percentFunded, goal, url } or null on failure/disabled.
 */
async function fetchDonationTotal() {
  if (!GOFUNDME_URL) {
    console.log('[gofundme] No GOFUNDME_URL configured — polling disabled');
    return null;
  }
  try {
    const res = await fetch(GOFUNDME_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; JesseOpsBot/2.0)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 15000,
    });

    if (!res.ok) {
      console.warn(`[gofundme] HTTP ${res.status} when fetching page`);
      return null;
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    // GoFundMe embeds JSON-LD schema.org data — most reliable extraction method
    let amount = null;

    // Try JSON-LD first
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html());
        if (data && data.totalPaymentsDue) {
          const val = parseFloat(data.totalPaymentsDue.replace(/[^0-9.]/g, ''));
          if (!isNaN(val)) amount = val;
        }
        if (data && data.fundedAmount) {
          const val = parseFloat(String(data.fundedAmount).replace(/[^0-9.]/g, ''));
          if (!isNaN(val)) amount = val;
        }
      } catch (_) {}
    });

    // Fallback: look for the raised amount in meta tags
    if (amount === null) {
      const metaAmount = $('meta[property="og:description"]').attr('content');
      if (metaAmount) {
        const match = metaAmount.match(/\$([0-9,]+(?:\.[0-9]{2})?)\s*(?:raised|of)/i);
        if (match) {
          amount = parseFloat(match[1].replace(/,/g, ''));
        }
      }
    }

    // Fallback: scan page text for dollar amounts near "raised"
    if (amount === null) {
      const pageText = $.text();
      const raisedMatch = pageText.match(/\$([0-9,]+(?:\.[0-9]{2})?)\s*raised/i);
      if (raisedMatch) {
        amount = parseFloat(raisedMatch[1].replace(/,/g, ''));
      }
    }

    if (amount === null) {
      console.warn('[gofundme] Could not parse donation total from page');
      return null;
    }

    return {
      amount,
      currency: 'USD',
      percentFunded: GOAL > 0 ? Math.round((amount / GOAL) * 100) : 0,
      goal: GOAL,
      url: GOFUNDME_URL,
    };
  } catch (err) {
    console.error('[gofundme] Fetch error:', err.message);
    return null;
  }
}

/**
 * Format a donation total for a Slack message.
 */
function formatDonationUpdate(prev, current) {
  const delta = current.amount - prev;
  const sign = delta >= 0 ? '+' : '';
  return `\u{1F49A} *GoFundMe update* \u2014 $${current.amount.toLocaleString()} raised of $${GOAL.toLocaleString()} (${current.percentFunded}%)\n${sign}$${Math.abs(delta).toFixed(2)} since last check\n${current.url}`;
}

module.exports = { fetchDonationTotal, formatDonationUpdate, GOFUNDME_URL, GOAL };
