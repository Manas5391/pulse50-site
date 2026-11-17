import fs from 'fs';
import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import { GoogleGenAI } from '@google/genai';

const parser = new Parser({
  customFields: {
    item: ['media:group', 'media:description', 'media:content', 'media:thumbnail', 'enclosure', 'content:encoded', 'description']
  }
});

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const FEEDS = [
  { category: 'General', source: 'Times of India', url: 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms', type: 'news' },
  { category: 'India National', source: 'The Hindu National', url: 'https://www.thehindu.com/news/national/feeder/default.rss', type: 'news' },
  { category: 'India National', source: 'NDTV India', url: 'https://feeds.feedburner.com/ndtvnews-india-news', type: 'news' },
  { category: 'World', source: 'BBC World News', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', type: 'news' },
  { category: 'World', source: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', type: 'news' },
  { category: 'Sports', source: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/rss.xml', type: 'news' },
  { category: 'Sports', source: 'TOI Sports', url: 'https://timesofindia.indiatimes.com/rssfeeds/4719148.cms', type: 'news' },
  { category: 'Entertainment', source: 'TOI Entertainment', url: 'https://timesofindia.indiatimes.com/rssfeeds/1081479906.cms', type: 'news' },
  { category: 'Entertainment', source: 'Indian Express Entertainment', url: 'https://indianexpress.com/section/entertainment/feed/', type: 'news' },
  { category: 'Podcasts', source: 'Raj Shamani (Figuring Out)', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCzwCEE_PchiBULMnAJqhGVg', type: 'podcast' },
  { category: 'Podcasts', source: 'Nikhil Kamath (WTF is)', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCRvG4p8_8J1s-vG2h5q9h-Q', type: 'podcast' },
  { category: 'Podcasts', source: 'ANI Podcast with Smita Prakash', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCtFQDgA8J8_iiwc5-KoAQlg', type: 'podcast' },
  { category: 'Podcasts', source: 'Lex Fridman Podcast', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCSHZKyawb77ixDdsGog4iWA', type: 'podcast' },
  { category: 'Podcasts', source: 'The Diary Of A CEO', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCGq-a57w-aPwyi3pW7XLiHw', type: 'podcast' },
  { category: 'Podcasts', source: 'Huberman Lab', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC2D2CMWXMOVWx7giW1n3LIg', type: 'podcast' }
];

const INDIAN_STATES_28 = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'
];

for (const state of INDIAN_STATES_28) {
  FEEDS.push({
    category: 'India States',
    state,
    source: `${state} Desk`,
    url: `https://news.google.com/rss/search?q=${encodeURIComponent(state + ' India news')}&hl=en-IN&gl=IN&ceid=IN:en`,
    type: 'news'
  });
}

async function fetchFullArticleText(url, fallback) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5500);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Pulse50EditorialBot/1.0)' }
    });
    clearTimeout(timer);
    const html = await res.text();
    const $ = cheerio.load(html);
    $('script, style, nav, footer, header, aside, form').remove();
    const paragraphs = $('p')
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(p => p.length > 45 && !/subscribe|cookie|sign in|all rights reserved|advertisement/i.test(p))
      .slice(0, 6)
      .join(' ');
    return paragraphs.length > 120 ? paragraphs.slice(0, 2400) : fallback;
  } catch {
    return fallback;
  }
}

async function generate50WordCard(rawTitle, rawContext, source, type) {
  const cleanTitle = rawTitle.replace(/#\w+/g, '').replace(/\s+-\s+[^-]+$/, '').trim();

  const prompt = type === 'podcast'
    ? `You are the senior editor for Pulse50 News. Write a powerful, informative 45 to 50-word podcast gist summarizing the core discussion, guest insights, and key takeaway so a reader immediately understands what the episode covers before deciding to watch. Also write a clean, non-clickbait headline (8-12 words) with no hashtags or emojis.
       Raw Title: ${cleanTitle}
       Podcast Details: ${rawContext}
       Rules:
       - Summary MUST be strictly 45 to 50 words and end with a complete sentence.
       - Do NOT repeat the headline inside the summary.
       - Never write generic filler like "Full details available below".
       Return ONLY valid JSON: {"headline": "...", "summary": "..."}`
    : `You are the senior editor for Pulse50 News. Rewrite this news report into an original, factual, standalone 45 to 50-word summary in crisp journalistic English.
       Headline: ${cleanTitle}
       Source: ${source}
       Raw Article Text: ${rawContext}
       Rules:
       - Summary MUST be strictly 45 to 50 words and end with a complete grammatical sentence.
       - Do NOT repeat the headline or mention "${source}" inside the summary.
       - Never use placeholder text like "Full details, official statements, and complete coverage...".
       Return ONLY valid JSON: {"headline": "${cleanTitle}", "summary": "..."}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });
    const parsed = JSON.parse(response.text);
    const wordCount = (parsed.summary || '').trim().split(/\s+/).filter(Boolean).length;
    if (wordCount < 38 || wordCount > 54) return null;
    return {
      headline: (parsed.headline || cleanTitle).trim(),
      summary: parsed.summary.trim()
    };
  } catch {
    return null;
  }
}

function extractMedia(item) {
  const link = item.link || '';
  const ytMatch = link.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch && ytMatch[1]) {
    return {
      image: `https://i.ytimg.com/vi/${ytMatch[1]}/sddefault.jpg`,
      video: `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1`
    };
  }

  const rawImg =
    item['media:content']?.['$']?.url ||
    item['media:thumbnail']?.['$']?.url ||
    item.enclosure?.url ||
    null;

  const validImg =
    rawImg &&
    rawImg.startsWith('http') &&
    !/logo|icon|pixel|1x1|googleusercontent|gstatic/i.test(rawImg)
      ? rawImg
      : '';

  return { image: validImg, video: '' };
}

async function run() {
  const allStories = [];
  const seenIds = new Set();

  for (const feedCfg of FEEDS) {
    try {
      const feed = await parser.parseURL(feedCfg.url);
      const limit = feedCfg.category === 'India States' ? 3 : 8;
      const items = feed.items.slice(0, limit);

      for (const item of items) {
        const cleanTitle = (item.title || '').replace(/\s+-\s+[^-]+$/, '').trim();
        const id = Buffer.from(cleanTitle.toLowerCase()).toString('base64').slice(0, 28);
        if (!cleanTitle || seenIds.has(id)) continue;

        const snippet =
          item['media:group']?.['media:description']?.[0] ||
          item.contentSnippet ||
          item.description ||
          '';

        const richContext =
          feedCfg.type === 'podcast'
            ? snippet
            : await fetchFullArticleText(item.link, snippet);

        const rewritten = await generate50WordCard(cleanTitle, richContext, feedCfg.source, feedCfg.type);
        if (!rewritten) continue;

        seenIds.add(id);
        const media = extractMedia(item);
        const tags = ['General', feedCfg.category];
        if (feedCfg.state) tags.push('India National');

        allStories.push({
          id,
          primaryCategory: feedCfg.category,
          tags: Array.from(new Set(tags)),
          stateTags: feedCfg.state ? [feedCfg.state] : [],
          title: rewritten.headline,
          summary: rewritten.summary,
          source: feedCfg.source,
          image: media.image,
          video: media.video,
          link: item.link,
          pubDate: item.isoDate || new Date().toISOString()
        });
      }
    } catch (err) {
      console.error(`Skipped ${feedCfg.source}:`, err.message);
    }
  }

  allStories.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  const capped = allStories.slice(0, 600);

  fs.writeFileSync('./news.json', JSON.stringify(capped, null, 2));
  console.log(`Successfully generated ${capped.length} 50-word news & podcast stories.`);
}

run();