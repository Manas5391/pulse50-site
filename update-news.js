import fs from 'fs';
import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const parser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
  },
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail', { keepArray: true }],
      ['media:group', 'mediaGroup'],
      ['yt:videoId', 'ytVideoId']
    ]
  }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ALL_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"
];

const CORE_FEEDS = [
  { url: 'https://feeds.feedburner.com/ndtvnews-top-stories', category: 'General', source: 'NDTV', limit: 6 },
  { url: 'https://www.thehindu.com/news/national/feeder/default.rss', category: 'India National', source: 'The Hindu', limit: 6 },
  { url: 'https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms', category: 'India National', source: 'Times of India', limit: 5 },
  { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', category: 'World', source: 'BBC News', limit: 6 },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml', category: 'World', source: 'Al Jazeera', limit: 5 },
  { url: 'https://www.thehindu.com/news/national/politics/feeder/default.rss', category: 'Politics', source: 'The Hindu', limit: 5 },
  { url: 'https://timesofindia.indiatimes.com/rssfeeds/1898055.cms', category: 'Politics', source: 'Times of India', limit: 5 },
  { url: 'https://feeds.bbci.co.uk/sport/rss.xml', category: 'Sports', source: 'BBC Sport', limit: 5 },
  { url: 'https://timesofindia.indiatimes.com/rssfeeds/4719148.cms', category: 'Sports', source: 'Times of India', limit: 5 },
  { url: 'https://timesofindia.indiatimes.com/rssfeeds/1081479906.cms', category: 'Entertainment', source: 'Times of India', limit: 5 },
  { url: 'https://www.bollywoodhungama.com/rss/news.xml', category: 'Entertainment', source: 'Bollywood Hungama', limit: 5 }
];

const PODCAST_FEEDS = [
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCneyi-aYq4VIBYIAQgWmk_w', source: 'Raj Shamani (Figuring Out)' },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCRvG4p0G_R-i69K6qB_dK8w', source: 'Nikhil Kamath (WTF is)' },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCt4t-jeY85JegMlZ-E5UWtA', source: 'ANI Podcast with Smita Prakash' },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCSHZKyawb77ixDdsGog4iWA', source: 'Lex Fridman Podcast' },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCGq-a57w-aPwyi3pW7XLiHw', source: 'The Diary Of A CEO' },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC2D2CMWXMOVWx7giW1n3LIg', source: 'Huberman Lab' }
];

function cleanHtml(raw = '') {
  return String(raw)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&amp;|&quot;|&#39;|&apos;|&lt;|&gt;/g, ' ')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\S+@\S+\.\S+/g, '')
    .replace(/#[a-zA-Z0-9_]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isBadImage(url = '') {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) return true;
  const low = url.toLowerCase();
  return (
    low.includes('logo') ||
    low.includes('icon') ||
    low.includes('favicon') ||
    low.includes('placeholder') ||
    low.includes('default') ||
    low.includes('1x1') ||
    low.includes('googleusercontent.com/proxy') ||
    low.includes('gstatic.com')
  );
}

function upgradeImageUrl(url = '') {
  if (!url) return '';
  return url
    .replace(/([?&])(w|width|h|height|size|resize)=\d+/gi, '')
    .replace(/\/thumb\//gi, '/');
}

function extractRssImage(item) {
  if (item.enclosure?.url && !isBadImage(item.enclosure.url)) {
    return upgradeImageUrl(item.enclosure.url);
  }
  if (Array.isArray(item.mediaContent)) {
    for (const m of item.mediaContent) {
      const u = m?.$?.url || m?.url;
      if (u && !isBadImage(u)) return upgradeImageUrl(u);
    }
  }
  if (Array.isArray(item.mediaThumbnail)) {
    for (const t of item.mediaThumbnail) {
      const u = t?.$?.url || t?.url;
      if (u && !isBadImage(u)) return upgradeImageUrl(u);
    }
  }
  const html = item['content:encoded'] || item.content || item.description || '';
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (match && !isBadImage(match[1])) return upgradeImageUrl(match[1]);
  return '';
}

function extractYouTubeId(item) {
  if (item.ytVideoId) return String(item.ytVideoId).trim();
  const link = item.link || '';
  const m = link.match(/(?:v=|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : '';
}

async function scrapeArticleDetails(url) {
  if (!url || url.includes('news.google.com') || url.includes('youtube.com')) {
    return { image: '', text: '' };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36'
      }
    });
    clearTimeout(timer);
    if (!res.ok) return { image: '', text: '' };
    const html = await res.text();
    const $ = cheerio.load(html);

    let ogImg =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      '';
    if (ogImg.startsWith('//')) ogImg = 'https:' + ogImg;
    if (isBadImage(ogImg)) ogImg = '';

    const paragraphs = [];
    $('article p, .story-content p, .article-body p, main p, p').each((_, el) => {
      const t = $(el).text().replace(/\s+/g, ' ').trim();
      if (
        t.length > 55 &&
        !t.toLowerCase().includes('subscription') &&
        !t.toLowerCase().includes('cookie') &&
        !t.toLowerCase().includes('copyright') &&
        !t.toLowerCase().includes('sign in')
      ) {
        paragraphs.push(t);
      }
    });

    return {
      image: upgradeImageUrl(ogImg),
      text: paragraphs.slice(0, 5).join(' ')
    };
  } catch {
    return { image: '', text: '' };
  }
}

function sanitizePodcastDescription(raw = '') {
  const lines = String(raw)
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => {
      if (!l || l.length < 25) return false;
      const low = l.toLowerCase();
      return !(
        low.includes('http://') ||
        low.includes('https://') ||
        low.includes('@') ||
        low.includes('copyright') ||
        low.includes('all rights reserved') ||
        low.includes('subscribe') ||
        low.includes('disclaimer') ||
        low.includes('follow us') ||
        low.includes('instagram') ||
        low.includes('spotify') ||
        low.includes('guest suggestion') ||
        low.includes('---')
      );
    });
  return cleanHtml(lines.slice(0, 4).join(' '));
}

function ensureCompleteSummary(text, fallbackTitle) {
  let cleaned = cleanHtml(text)
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned || cleaned.split(/\s+/).length < 18) {
    cleaned = `Latest verified developments report on ${fallbackTitle.replace(/\.$/, '')}, outlining key official updates, stakeholder responses, and immediate regional impact.`;
  }

  const words = cleaned.split(/\s+/);
  if (words.length > 52) {
    cleaned = words.slice(0, 50).join(' ');
  }

  const lastDot = Math.max(cleaned.lastIndexOf('.'), cleaned.lastIndexOf('!'), cleaned.lastIndexOf('?'));
  if (lastDot > 40) {
    cleaned = cleaned.slice(0, lastDot + 1);
  } else if (!/[.!?]$/.test(cleaned)) {
    cleaned += '.';
  }
  return cleaned;
}

async function rewriteTo50Words({ title, rawText, source, category, stateName = '', isPodcast = false }) {
  const contextText = (rawText || '').slice(0, 1400);
  const prompt = isPodcast
    ? `You are an editorial writer for Pulse50. Write a crisp, engaging 45 to 50 word summary of this podcast episode in complete, grammatically correct sentences.
Rules:
- Explain what the host and guest discuss and the core takeaway.
- NEVER include URLs, emails, hashtags, sponsor promos, subscribe prompts, or copyright lines.
- NEVER repeat the exact title word-for-word.
- Must be strictly 44 to 50 words and end with a full stop.

Podcast Channel: ${source}
Episode Title: ${title}
Episode Notes: ${contextText}`
    : `You are a senior news editor for Pulse50. Rewrite this news story into an informative, factual 45 to 50 word gist in complete, grammatically correct sentences.
Rules:
- Include concrete facts (who, what, where, why/impact).
- NEVER repeat the headline verbatim or copy-paste the headline + source name.
- NEVER mention "${source}" or add filler like "Read the full article below".
- Must be strictly 44 to 50 words and end with a period.
${stateName ? `- Focus clearly on the domestic impact in ${stateName}.` : ''}

Headline: ${title}
Category: ${category}
Source Material: ${contextText || title}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });
    const out = response?.text?.trim() || '';
    if (out && out.split(/\s+/).length >= 32) {
      return ensureCompleteSummary(out, title);
    }
  } catch (err) {
    console.warn(`Gemini fallback for "${title.slice(0, 40)}":`, err?.status || err?.message || 'error');
  }

  return ensureCompleteSummary(contextText, title);
}

async function run() {
  const allStories = [];
  const seenTitles = new Set();

  const addUnique = (story) => {
    const key = story.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 65);
    if (!key || seenTitles.has(key)) return;
    seenTitles.add(key);
    allStories.push(story);
  };

  console.log('1. Fetching core category feeds...');
  for (const feed of CORE_FEEDS) {
    try {
      const parsed = await parser.parseURL(feed.url);
      const items = (parsed.items || []).slice(0, feed.limit);
      for (const item of items) {
        const rawTitle = cleanHtml(item.title || '').replace(/\s+-\s+[^-]+$/, '').trim();
        if (!rawTitle) continue;

        let img = extractRssImage(item);
        let bodyText = cleanHtml(item['content:encoded'] || item.contentSnippet || item.description || '');

        if (!img || bodyText.split(/\s+/).length < 30) {
          const scraped = await scrapeArticleDetails(item.link);
          if (!img && scraped.image) img = scraped.image;
          if (scraped.text.length > bodyText.length) bodyText = scraped.text;
        }

        const summary = await rewriteTo50Words({
          title: rawTitle,
          rawText: bodyText,
          source: feed.source,
          category: feed.category
        });

        addUnique({
          id: Buffer.from(rawTitle).toString('base64').slice(0, 24),
          category: feed.category,
          primaryCategory: feed.category,
          tags: [feed.category, 'General'],
          stateTags: [],
          title: rawTitle,
          summary,
          source: feed.source,
          image: img,
          video: '',
          link: item.link || '',
          pubDate: item.isoDate || item.pubDate || new Date().toISOString()
        });

        await sleep(1400);
      }
    } catch (e) {
      console.warn(`Feed error (${feed.source} - ${feed.category}):`, e.message);
    }
  }

  console.log('2. Fetching domestic news for all 28 Indian States...');
  for (const state of ALL_STATES) {
    try {
      const query = encodeURIComponent(`"${state}" (government OR CM OR district OR cabinet OR assembly OR police OR development) when:2d`);
      const stateUrl = `https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`;
      const parsed = await parser.parseURL(stateUrl);
      const items = (parsed.items || []).slice(0, 2);

      for (const item of items) {
        const parts = cleanHtml(item.title || '').split(' - ');
        const sourceName = parts.length > 1 ? parts.pop().trim() : `${state} Desk`;
        const rawTitle = parts.join(' - ').trim();
        if (!rawTitle) continue;

        const summary = await rewriteTo50Words({
          title: rawTitle,
          rawText: rawTitle,
          source: sourceName,
          category: 'India States',
          stateName: state
        });

        addUnique({
          id: Buffer.from(`${state}-${rawTitle}`).toString('base64').slice(0, 24),
          category: 'India States',
          primaryCategory: 'India States',
          tags: ['India States', 'India National'],
          stateTags: [state],
          title: rawTitle,
          summary,
          source: sourceName,
          image: '',
          video: '',
          link: item.link || '',
          pubDate: item.isoDate || item.pubDate || new Date().toISOString()
        });

        await sleep(1400);
      }
    } catch (e) {
      console.warn(`State feed error (${state}):`, e.message);
    }
  }

  console.log('3. Fetching Podcasts...');
  for (const pod of PODCAST_FEEDS) {
    try {
      const parsed = await parser.parseURL(pod.url);
      const items = (parsed.items || []).slice(0, 2);
      for (const item of items) {
        const rawTitle = cleanHtml(item.title || '');
        if (!rawTitle) continue;

        const videoId = extractYouTubeId(item);
        const thumb = videoId ? `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg` : extractRssImage(item);
        const rawDesc = sanitizePodcastDescription(item.mediaGroup?.['media:description']?.[0] || item.contentSnippet || item.description || '');

        const summary = await rewriteTo50Words({
          title: rawTitle,
          rawText: rawDesc || rawTitle,
          source: pod.source,
          category: 'Podcasts',
          isPodcast: true
        });

        addUnique({
          id: Buffer.from(`pod-${videoId || rawTitle}`).toString('base64').slice(0, 24),
          category: 'Podcasts',
          primaryCategory: 'Podcasts',
          tags: ['Podcasts'],
          stateTags: [],
          title: rawTitle,
          summary,
          source: pod.source,
          image: thumb,
          video: videoId ? `https://www.youtube.com/watch?v=${videoId}` : (item.link || ''),
          link: item.link || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : ''),
          pubDate: item.isoDate || item.pubDate || new Date().toISOString()
        });

        await sleep(1400);
      }
    } catch (e) {
      console.warn(`Podcast feed error (${pod.source}):`, e.message);
    }
  }

  console.log(`Total stories generated: ${allStories.length}`);
  if (allStories.length >= 15) {
    fs.writeFileSync('news.json', JSON.stringify(allStories, null, 2), 'utf-8');
    console.log('Successfully wrote news.json');
  } else {
    console.error('Too few stories generated; preserving existing news.json');
    process.exit(1);
  }
}

run();
