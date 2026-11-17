import fs from 'fs';
import Parser from 'rss-parser';
import * as cheerio from 'cheerio';

const parser = new Parser({
  timeout: 12000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  },
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail'],
      ['media:group', 'mediaGroup'],
      ['enclosure', 'enclosure']
    ]
  }
});

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'
];

const STATE_CITIES = {
  'Andhra Pradesh': ['amaravati', 'visakhapatnam', 'vijayawada', 'tirupati', 'guntur'],
  'Arunachal Pradesh': ['itanagar', 'tawang'],
  'Assam': ['guwahati', 'dispur', 'dibrugarh', 'silchar'],
  'Bihar': ['patna', 'gaya', 'muzaffarpur', 'bhagalpur'],
  'Chhattisgarh': ['raipur', 'bilaspur', 'bastar'],
  'Goa': ['panaji', 'margao', 'vasco'],
  'Gujarat': ['ahmedabad', 'gandhinagar', 'surat', 'vadodara', 'rajkot'],
  'Haryana': ['gurugram', 'faridabad', 'ambala', 'hisar'],
  'Himachal Pradesh': ['shimla', 'manali', 'dharamshala'],
  'Jharkhand': ['ranchi', 'jamshedpur', 'dhanbad'],
  'Karnataka': ['bengaluru', 'bangalore', 'mysuru', 'mangaluru', 'hubballi'],
  'Kerala': ['thiruvananthapuram', 'kochi', 'kozhikode', 'thrissur'],
  'Madhya Pradesh': ['bhopal', 'indore', 'gwalior', 'jabalpur'],
  'Maharashtra': ['mumbai', 'pune', 'nagpur', 'nashik', 'thane'],
  'Manipur': ['imphal'],
  'Meghalaya': ['shillong'],
  'Mizoram': ['aizawl'],
  'Nagaland': ['kohima', 'dimapur'],
  'Odisha': ['bhubaneswar', 'cuttack', 'puri', 'rourkela', 'sambalpur'],
  'Punjab': ['amritsar', 'ludhiana', 'jalandhar', 'patiala'],
  'Rajasthan': ['jaipur', 'jodhpur', 'udaipur', 'kota'],
  'Sikkim': ['gangtok'],
  'Tamil Nadu': ['chennai', 'coimbatore', 'madurai', 'trichy', 'salem'],
  'Telangana': ['hyderabad', 'warangal', 'nizamabad', 'karimnagar'],
  'Tripura': ['agartala'],
  'Uttar Pradesh': ['lucknow', 'varanasi', 'kanpur', 'agra', 'noida', 'prayagraj'],
  'Uttarakhand': ['dehradun', 'haridwar', 'nainital'],
  'West Bengal': ['kolkata', 'howrah', 'darjeeling', 'siliguri', 'durgapur']
};

const CATEGORY_FEEDS = [
  // Top Trending (General Front-Page Highlights)
  { url: 'https://feeds.feedburner.com/ndtvnews-top-stories', category: 'General', source: 'NDTV Top Stories', limit: 6, isTrending: true },
  { url: 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms', category: 'General', source: 'Times of India', limit: 6, isTrending: true },

  // India National
  { url: 'https://www.thehindu.com/news/national/feeder/default.rss', category: 'India National', source: 'The Hindu', limit: 10, isTrending: true },
  { url: 'https://feeds.feedburner.com/ndtvnews-india-news', category: 'India National', source: 'NDTV India', limit: 10, isTrending: false },
  { url: 'https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms', category: 'India National', source: 'Times of India', limit: 8, isTrending: false },

  // World
  { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', category: 'World', source: 'BBC World', limit: 10, isTrending: true },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml', category: 'World', source: 'Al Jazeera', limit: 10, isTrending: false },
  { url: 'https://feeds.feedburner.com/ndtvnews-world-news', category: 'World', source: 'NDTV World', limit: 8, isTrending: false },

  // Politics
  { url: 'https://news.google.com/rss/search?q=Indian+Politics+Parliament+Cabinet+Election+when:2d&hl=en-IN&gl=IN&ceid=IN:en', category: 'Politics', source: 'India Politics Desk', limit: 12, isTrending: true },
  { url: 'https://www.thehindu.com/news/national/feeder/default.rss', category: 'Politics', source: 'The Hindu Politics', limit: 8, isTrending: false },

  // Sports
  { url: 'https://feeds.bbci.co.uk/sport/rss.xml', category: 'Sports', source: 'BBC Sport', limit: 10, isTrending: true },
  { url: 'https://feeds.feedburner.com/ndtvsports-latest', category: 'Sports', source: 'NDTV Sports', limit: 10, isTrending: false },
  { url: 'https://timesofindia.indiatimes.com/rssfeeds/4719148.cms', category: 'Sports', source: 'TOI Sports', limit: 8, isTrending: false },

  // Entertainment
  { url: 'https://www.bollywoodhungama.com/rss/news.xml', category: 'Entertainment', source: 'Bollywood Hungama', limit: 10, isTrending: true },
  { url: 'https://timesofindia.indiatimes.com/rssfeeds/1081479906.cms', category: 'Entertainment', source: 'TOI Entertainment', limit: 10, isTrending: false },
  { url: 'https://feeds.feedburner.com/ndtvmovies-latest', category: 'Entertainment', source: 'NDTV Movies', limit: 8, isTrending: false }
];

// Genuine Long-Form Podcasts ONLY (No wire news Shorts)
const PODCAST_FEEDS = [
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCzwCEE_PchiBULMnAJqhGVg', source: 'Raj Shamani • Figuring Out' },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCneyi-aYq4VIBYIAQgWmk_w', source: 'Ranveer Allahbadia • TRS' },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCnC8SAZzQiB2XlFBwpMq17g', source: 'Nikhil Kamath • WTF is' },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCSHZKyawb77ixDdsGog4iWA', source: 'Lex Fridman Podcast' },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC2D2CMWXMOVWx7giW1n3LIg', source: 'Huberman Lab' },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCGq-a57w-aPwyi3pW7XLiHw', source: 'The Diary Of A CEO' }
];

function cleanRawNoise(text) {
  if (!text) return '';
  return String(text)
    .replace(/<[^>]*>/g, ' ')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
    .replace(/Account subscription benefits alongside Premium Stories[\s\S]*?Subscription/gi, '')
    .replace(/Updated\s*-\s*[A-Za-z]+\s+\d+,\s*\d{4}\s+\d+:\d+\s*(?:am|pm)\s*IST\s*-?/gi, '')
    .replace(/^[A-Z]{3,}\s+(?=The\s)/, '')
    .replace(/Email to:.*$/gis, '')
    .replace(/Copyrights?\s*©.*$/gis, '')
    .replace(/All Rights Reserved.*$/gis, '')
    .replace(/[-_=]{4,}/g, ' ')
    .replace(/#[\w]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function upgradeToHdImage(url) {
  if (!url || typeof url !== 'string') return '';
  const u = url.toLowerCase();
  if (!u.startsWith('http')) return '';
  if (u.includes('lh3.googleusercontent.com') || u.includes('gstatic.com')) return '';
  if (u.includes('th-online') || u.includes('default-article') || u.includes('placeholder') || u.includes('logo') || u.includes('1x1')) return '';

  return url
    .replace(/([?&])(w|width|h|height|quality|q)=\d+/gi, '')
    .replace(/resize=\d+[,x]\d+/gi, 'resize=1200,675')
    .replace(/-\d{2,3}x\d{2,3}(\.(?:jpg|jpeg|png|webp))/gi, '$1')
    .replace(/\/(sddefault|mqdefault|default)\.jpg/i, '/hqdefault.jpg')
    .replace(/[?&]+$/, '');
}

function extractRssImage(item) {
  const link = item.link || '';
  const ytMatch = link.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) {
    return `https://i.ytimg.com/vi/${ytMatch[1]}/hqdefault.jpg`;
  }
  if (item.enclosure && item.enclosure.url) {
    const hd = upgradeToHdImage(item.enclosure.url);
    if (hd) return hd;
  }
  if (Array.isArray(item.mediaContent)) {
    for (const m of item.mediaContent) {
      const hd = upgradeToHdImage(m?.$?.url || m?.url);
      if (hd) return hd;
    }
  }
  if (item.mediaThumbnail?.$?.url) {
    const hd = upgradeToHdImage(item.mediaThumbnail.$.url);
    if (hd) return hd;
  }
  if (item.mediaGroup?.['media:thumbnail']?.[0]?.$?.url) {
    const hd = upgradeToHdImage(item.mediaGroup['media:thumbnail'][0].$.url);
    if (hd) return hd;
  }
  const html = item['content:encoded'] || item.content || '';
  const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch) {
    const hd = upgradeToHdImage(imgMatch[1]);
    if (hd) return hd;
  }
  return '';
}

async function fetchArticleDetails(url) {
  if (!url || url.includes('news.google.com') || url.includes('youtube.com')) {
    return { text: '', image: '' };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6500);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36' }
    });
    clearTimeout(timer);
    if (!res.ok) return { text: '', image: '' };
    const html = await res.text();
    const $ = cheerio.load(html);

    const rawOg = $('meta[property="og:image"]').attr('content') || $('meta[name="twitter:image"]').attr('content') || '';
    const image = upgradeToHdImage(rawOg);

    const paragraphs = [];
    $('article p, .story-element-text p, .articlebodycontent p, main p').each((_, el) => {
      const t = cleanRawNoise($(el).text());
      if (t.length > 55 && !/subscribe|cookie|sign in|copyright|advertisement/i.test(t)) {
        paragraphs.push(t);
      }
    });

    return { text: paragraphs.slice(0, 5).join(' '), image };
  } catch {
    return { text: '', image: '' };
  }
}

function enforceCleanCompleteSummary(rawText, headline) {
  let text = cleanRawNoise(rawText);
  if (!text) return '';

  const cleanHead = headline.replace(/[^\w\s]/g, '').toLowerCase().trim();
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const filtered = sentences.filter((s) => {
    const cleanS = s.replace(/[^\w\s]/g, '').toLowerCase().trim();
    return cleanS && cleanS !== cleanHead && !cleanHead.includes(cleanS);
  });

  let result = '';
  let wordCount = 0;
  for (const s of filtered) {
    const trimmed = s.trim();
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (wordCount + words.length <= 50) {
      result += (result ? ' ' : '') + trimmed;
      wordCount += words.length;
    } else if (wordCount === 0) {
      const slice = words.slice(0, 47).join(' ').replace(/[,;:-]+$/, '');
      result = slice + '.';
      wordCount = 47;
      break;
    } else {
      break;
    }
  }

  result = result.trim();
  if (result && !/[.!?]$/.test(result)) result += '.';
  return result;
}

async function rewriteWithGemini(headline, contextText, isPodcast) {
  if (!GEMINI_API_KEY) return enforceCleanCompleteSummary(contextText, headline);

  const prompt = isPodcast
    ? `Summarize the core topic, guest perspective, and key takeaway of this podcast episode in 45 to 50 words. Do NOT write a generic bio or include emails, links, or channel promos. End with a complete sentence and period.\nEpisode Title: ${headline}\nNotes: ${contextText.slice(0, 900)}`
    : `Rewrite this news report into a neutral, informative, complete 45 to 50 word gist. Do NOT repeat the headline word-for-word, do NOT include publisher names, and end with a complete sentence and period.\nHeadline: ${headline}\nArticle: ${contextText.slice(0, 1200)}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 140 }
        })
      }
    );
    if (!res.ok) return enforceCleanCompleteSummary(contextText, headline);
    const data = await res.json();
    const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const finalized = enforceCleanCompleteSummary(aiText, headline);
    return finalized.split(/\s+/).length >= 18 ? finalized : enforceCleanCompleteSummary(contextText, headline);
  } catch {
    return enforceCleanCompleteSummary(contextText, headline);
  }
}

function matchesActualState(text, targetState) {
  const lower = text.toLowerCase();
  if (lower.includes(targetState.toLowerCase())) return true;
  const cities = STATE_CITIES[targetState] || [];
  return cities.some((c) => new RegExp(`\\b${c}\\b`, 'i').test(lower));
}

async function main() {
  const stories = [];
  const seenTitles = new Set();

  function isDuplicate(title) {
    const key = title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 48);
    if (!key || seenTitles.has(key)) return true;
    seenTitles.add(key);
    return false;
  }

  // 1. Deep Category Feeds + Top Trending Front-Page Selection
  for (const feed of CATEGORY_FEEDS) {
    try {
      const parsed = await parser.parseURL(feed.url);
      let addedForFeed = 0;
      for (const item of (parsed.items || []).slice(0, feed.limit)) {
        const title = cleanRawNoise((item.title || '').replace(/\s+-\s+[^-]+$/, ''));
        if (!title || title.length < 15 || isDuplicate(title)) continue;

        let image = extractRssImage(item);
        const rssSnippet = cleanRawNoise(item.contentSnippet || item.content || '');
        const scraped = await fetchArticleDetails(item.link);
        if (scraped.image) image = scraped.image;

        const sourceText = scraped.text || rssSnippet;
        const summary = await rewriteWithGemini(title, sourceText, false);
        if (!summary || summary.split(/\s+/).length < 15) continue;

        const isTrending = feed.isTrending && addedForFeed < 3;
        addedForFeed++;

        stories.push({
          id: Buffer.from(title).toString('base64').slice(0, 24),
          title,
          summary,
          source: feed.source,
          category: feed.category,
          isTrending,
          state: '',
          image,
          url: item.link || '',
          videoUrl: '',
          pubDate: item.isoDate ? new Date(item.isoDate).getTime() : Date.now()
        });
        await sleep(1200);
      }
    } catch (e) {
      console.error('Category feed error:', feed.url, e.message);
    }
  }

  // 2. Genuine Long-Form Podcasts ONLY (Block YouTube Shorts & LIVE wire clips)
  for (const pod of PODCAST_FEEDS) {
    try {
      const parsed = await parser.parseURL(pod.url);
      let podCount = 0;
      for (const item of parsed.items || []) {
        if (podCount >= 3) break;
        const link = item.link || '';
        const rawTitle = item.title || '';
        if (link.includes('/shorts/') || /#shorts|\blive:/i.test(rawTitle)) continue;

        const title = cleanRawNoise(rawTitle.replace(/\s+-\s+[^-]+$/, ''));
        if (!title || title.length < 15 || isDuplicate(title)) continue;

        const image = extractRssImage(item);
        const rawDesc = cleanRawNoise(item.mediaGroup?.['media:description']?.[0] || item.contentSnippet || '');
        const summary = await rewriteWithGemini(title, rawDesc || title, true);
        if (!summary || summary.split(/\s+/).length < 15) continue;

        podCount++;
        stories.push({
          id: Buffer.from(title).toString('base64').slice(0, 24),
          title,
          summary,
          source: pod.source,
          category: 'Podcasts',
          isTrending: false,
          state: '',
          image,
          url: link,
          videoUrl: link,
          pubDate: item.isoDate ? new Date(item.isoDate).getTime() : Date.now()
        });
        await sleep(1200);
      }
    } catch (e) {
      console.error('Podcast error:', pod.url, e.message);
    }
  }

  // 3. Dedicated Domestic News for All 28 Indian States (Strict Content Verification)
  for (const stateName of INDIAN_STATES) {
    const q = encodeURIComponent(`"${stateName}" government OR chief minister OR news`);
    const stateUrl = `https://news.google.com/rss/search?q=${q}+when:3d&hl=en-IN&gl=IN&ceid=IN:en`;
    try {
      const parsed = await parser.parseURL(stateUrl);
      let stateCount = 0;
      for (const item of (parsed.items || []).slice(0, 5)) {
        if (stateCount >= 3) break;
        const rawTitle = item.title || '';
        const sourceMatch = rawTitle.match(/\s+-\s+([^-]+)$/);
        const pubSource = sourceMatch ? sourceMatch[1].trim() : `${stateName} Desk`;
        const title = cleanRawNoise(rawTitle.replace(/\s+-\s+[^-]+$/, ''));
        if (!title || title.length < 15 || isDuplicate(title)) continue;

        const snippet = cleanRawNoise(item.contentSnippet || item.content || '');
        if (!matchesActualState(`${title} ${snippet}`, stateName)) continue;

        const summary = await rewriteWithGemini(title, snippet || `${title} in ${stateName}.`, false);
        if (!summary || summary.split(/\s+/).length < 12) continue;

        stateCount++;
        stories.push({
          id: Buffer.from(title).toString('base64').slice(0, 24),
          title,
          summary,
          source: pubSource,
          category: 'India States',
          isTrending: false,
          state: stateName,
          image: extractRssImage(item),
          url: item.link || '',
          videoUrl: '',
          pubDate: item.isoDate ? new Date(item.isoDate).getTime() : Date.now()
        });
        await sleep(1100);
      }
    } catch (e) {
      console.error('State error:', stateName, e.message);
    }
  }

  if (stories.length >= 30) {
    fs.writeFileSync('news.json', JSON.stringify(stories, null, 2));
    console.log(`Saved ${stories.length} stories across General Trending, Categories, Podcasts & 28 States.`);
  } else {
    console.error(`Too few stories (${stories.length}); preserving existing news.json`);
    process.exit(1);
  }
}

main();
