const fs = require('fs');
const Parser = require('rss-parser');
const cheerio = require('cheerio');

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

const CORE_FEEDS = [
  { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', category: 'World', source: 'BBC World' },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml', category: 'World', source: 'Al Jazeera' },
  { url: 'https://www.thehindu.com/news/national/feeder/default.rss', category: 'India National', source: 'The Hindu' },
  { url: 'https://feeds.feedburner.com/ndtvnews-india-news', category: 'India National', source: 'NDTV' },
  { url: 'https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms', category: 'India National', source: 'Times of India' },
  { url: 'https://www.thehindu.com/news/national/feeder/default.rss', category: 'Politics', source: 'The Hindu' },
  { url: 'https://feeds.feedburner.com/ndtvnews-india-news', category: 'Politics', source: 'NDTV Politics' },
  { url: 'https://news.google.com/rss/search?q=India+Politics+Parliament+Supreme+Court+Government+when:1d&hl=en-IN&gl=IN&ceid=IN:en', category: 'Politics', source: 'India Politics Desk' },
  { url: 'https://feeds.bbci.co.uk/sport/rss.xml', category: 'Sports', source: 'BBC Sport' },
  { url: 'https://feeds.feedburner.com/ndtvsports-latest', category: 'Sports', source: 'NDTV Sports' },
  { url: 'https://www.bollywoodhungama.com/rss/news.xml', category: 'Entertainment', source: 'Bollywood Hungama' },
  { url: 'https://timesofindia.indiatimes.com/rssfeeds/1081479906.cms', category: 'Entertainment', source: 'TOI Entertainment' }
];

const PODCAST_FEEDS = [
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCt4t-jeY85JegMlZ-E5UWtA', source: 'Aaj Tak Podcast' },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC6RJ7-PaXg6TIH2BzZfTV7w', source: 'Times Now Podcast' },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCYPvAwZP8pZhSMW8qs7cVCw', source: 'India Today Podcast' },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCSHZKyawb77ixDdsGog4iWA', source: 'Lex Fridman' },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC2D2CMWXMOVWx7giW1n3LIg', source: 'Huberman Lab' },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCGq-a57w-aPwyi3pW7XLiHw', source: 'Diary Of A CEO' },
  { url: 'https://news.google.com/rss/search?q="Raj+Shamani"+OR+"Nikhil+Kamath"+OR+"Ranveer+Allahbadia"+podcast+when:3d&hl=en-IN&gl=IN&ceid=IN:en', source: 'India Podcasts' }
];

function stripPublisherSuffix(text) {
  if (!text) return '';
  return String(text)
    .replace(/\s+[-–|]\s*(The Times of India|Times of India|India Today|The New Indian Express|NDTV|The Hindu|Hindustan Times|Indian Express|ANI|PTI|Deccan Chronicle|Telangana Today|The Hans India|News18|Firstpost|Mint|Business Standard|LiveMint)\.?\s*$/i, '')
    .replace(/\s+(The Times of India|Times of India|India Today|The New Indian Express|NDTV|The Hindu|Hindustan Times|Indian Express)\.?\s*$/i, '')
    .trim();
}

function cleanRawNoise(text) {
  if (!text) return '';
  return String(text)
    .replace(/<[^>]*>/g, ' ')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
    .replace(/Account subscription benefits alongside Premium Stories[\s\S]*?Subscription/gi, '')
    .replace(/Updated\s*-\s*[A-Za-z]+\s+\d+,\s*\d{4}\s+\d+:\d+\s*(?:am|pm)\s*IST\s*-?/gi, '')
    .replace(/Get your hand-picked playbook[\s\S]*?(?=Disclaimer:|$)/gi, '')
    .replace(/Guest Suggestion Form:[\s\S]*?(?=Disclaimer:|$)/gi, '')
    .replace(/Design Your Own Podcast Episode:[\s\S]*?(?=Disclaimer:|$)/gi, '')
    .replace(/Disclaimer:\s*This video is intended solely[\s\S]*$/gi, '')
    .replace(/Email to:.*$/gis, '')
    .replace(/Copyrights?\s*©.*$/gis, '')
    .replace(/All Rights Reserved.*$/gis, '')
    .replace(/[-_=]{4,}/g, ' ')
    .replace(/#[\w]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isValidPhotoUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const u = url.toLowerCase();
  if (!u.startsWith('http')) return false;
  if (u.includes('lh3.googleusercontent.com') || u.includes('gstatic.com')) return false;
  if (u.includes('th-online') || u.includes('default-article') || u.includes('placeholder') || u.includes('logo')) return false;
  return true;
}

function extractRssImage(item) {
  if (item.enclosure && item.enclosure.url && isValidPhotoUrl(item.enclosure.url)) {
    return item.enclosure.url;
  }
  if (Array.isArray(item.mediaContent)) {
    for (const m of item.mediaContent) {
      const u = m?.$?.url || m?.url;
      if (isValidPhotoUrl(u)) return u;
    }
  }
  if (item.mediaThumbnail?.$?.url && isValidPhotoUrl(item.mediaThumbnail.$.url)) {
    return item.mediaThumbnail.$.url;
  }
  if (item.mediaGroup?.['media:thumbnail']?.[0]?.$?.url) {
    return item.mediaGroup['media:thumbnail'][0].$.url;
  }
  const link = item.link || '';
  const ytMatch = link.match(/(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) {
    // Use 16:9 widescreen maxresdefault (fallback handled in index.html onerror to hqdefault)
    return `https://i.ytimg.com/vi/${ytMatch[1]}/maxresdefault.jpg`;
  }
  const html = item['content:encoded'] || item.content || '';
  const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch && isValidPhotoUrl(imgMatch[1])) return imgMatch[1];
  return '';
}

async function fetchArticleDetails(url) {
  if (!url || url.includes('news.google.com') || url.includes('youtube.com')) {
    return { text: '', image: '' };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Pulse50Bot/1.0)' }
    });
    clearTimeout(timer);
    if (!res.ok) return { text: '', image: '' };
    const html = await res.text();
    const $ = cheerio.load(html);

    let ogImg = $('meta[property="og:image"]').attr('content') || $('meta[name="twitter:image"]').attr('content') || '';
    if (!isValidPhotoUrl(ogImg)) ogImg = '';

    const paragraphs = [];
    $('article p, .story-element-text p, .articlebodycontent p, main p').each((_, el) => {
      const t = cleanRawNoise($(el).text());
      if (t.length > 55 && !/subscribe|cookie|sign in|copyright|advertisement/i.test(t)) {
        paragraphs.push(t);
      }
    });

    return { text: paragraphs.slice(0, 5).join(' '), image: ogImg };
  } catch {
    return { text: '', image: '' };
  }
}

function isSnippetJustHeadline(snippet, headline) {
  const norm = (s) => stripPublisherSuffix(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const a = norm(snippet);
  const b = norm(headline);
  if (!a || !b) return true;
  return a === b || a.startsWith(b) || b.startsWith(a);
}

function enforceCleanCompleteSummary(rawText, headline) {
  let text = stripPublisherSuffix(cleanRawNoise(rawText));
  if (!text || isSnippetJustHeadline(text, headline)) return '';

  const cleanHead = stripPublisherSuffix(headline).replace(/[^\w\s]/g, '').toLowerCase().trim();
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const filtered = sentences.filter((s) => {
    const cleanS = stripPublisherSuffix(s).replace(/[^\w\s]/g, '').toLowerCase().trim();
    return cleanS && cleanS !== cleanHead && !cleanHead.includes(cleanS) && !cleanS.startsWith(cleanHead);
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

async function rewriteWithGemini(headline, contextText, isPodcast, regionHint = '') {
  const titleOnly = isSnippetJustHeadline(contextText, headline);
  if (!GEMINI_API_KEY) {
    return titleOnly ? '' : enforceCleanCompleteSummary(contextText, headline);
  }

  let prompt = '';
  if (isPodcast) {
    prompt = `Write a sharp, informative 45 to 50 word summary explaining the core topic, guest insights, and key takeaway of this podcast episode. Never include YouTube links, playbooks, forms, emails, hashtags, or disclaimers. Write complete grammatical sentences ending with a period.\nEpisode Title: ${headline}\nNotes: ${contextText.slice(0, 800)}`;
  } else if (titleOnly) {
    prompt = `You are a senior Indian news editor. Based on this verified news headline${regionHint ? ` from ${regionHint}` : ''}, write a clear, factual, meaningful 45 to 50 word news brief explaining the policy/political background, key stakeholders, and impact. CRITICAL: Do NOT repeat or copy the headline text, and do NOT append publisher names like "The Times of India" or "India Today". End with a complete sentence and period.\nHeadline: ${headline}`;
  } else {
    prompt = `Rewrite this news report into a clear, factual, meaningful 45 to 50 word news brief. CRITICAL: Do NOT copy or repeat the headline word-for-word, and do NOT include publisher names, subscription prompts, or cut-off sentences. End with a complete sentence and period.\nHeadline: ${headline}\nArticle Details: ${contextText.slice(0, 1200)}`;
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.35, maxOutputTokens: 150 }
          })
        }
      );
      if (res.status === 429) {
        await sleep(3500);
        continue;
      }
      if (!res.ok) break;
      const data = await res.json();
      const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const finalized = enforceCleanCompleteSummary(aiText, headline);
      if (finalized && finalized.split(/\s+/).length >= 22) return finalized;
    } catch {
      await sleep(1500);
    }
  }

  return titleOnly ? '' : enforceCleanCompleteSummary(contextText, headline);
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

  // 1. Core News Categories
  for (const feed of CORE_FEEDS) {
    try {
      const parsed = await parser.parseURL(feed.url);
      for (const item of (parsed.items || []).slice(0, 6)) {
        const title = stripPublisherSuffix(cleanRawNoise(item.title || ''));
        if (!title || title.length < 15 || isDuplicate(title)) continue;

        let image = extractRssImage(item);
        const rssSnippet = cleanRawNoise(item.contentSnippet || item.content || '');
        const scraped = await fetchArticleDetails(item.link);
        if (!image && scraped.image) image = scraped.image;

        const sourceText = scraped.text || rssSnippet;
        const summary = await rewriteWithGemini(title, sourceText, false, 'India');
        if (!summary || summary.split(/\s+/).length < 20) continue;

        stories.push({
          id: Buffer.from(title).toString('base64').slice(0, 24),
          title,
          summary,
          source: feed.source,
          category: feed.category,
          tags: ['General', feed.category],
          state: '',
          image,
          url: item.link || '',
          videoUrl: '',
          pubDate: item.isoDate ? new Date(item.isoDate).getTime() : Date.now()
        });
        await sleep(1400);
      }
    } catch (e) {
      console.error('Feed error:', feed.url, e.message);
    }
  }

  // 2. Podcasts
  for (const pod of PODCAST_FEEDS) {
    try {
      const parsed = await parser.parseURL(pod.url);
      for (const item of (parsed.items || []).slice(0, 3)) {
        const title = stripPublisherSuffix(cleanRawNoise(item.title || ''));
        if (!title || title.length < 15 || isDuplicate(title)) continue;

        const image = extractRssImage(item);
        const rawDesc = cleanRawNoise(item.mediaGroup?.['media:description']?.[0] || item.contentSnippet || '');
        const summary = await rewriteWithGemini(title, rawDesc || title, true, 'Podcast');
        if (!summary || summary.split(/\s+/).length < 20) continue;

        stories.push({
          id: Buffer.from(title).toString('base64').slice(0, 24),
          title,
          summary,
          source: pod.source,
          category: 'Podcasts',
          tags: ['Podcasts'],
          state: '',
          image,
          url: item.link || '',
          videoUrl: item.link || '',
          pubDate: item.isoDate ? new Date(item.isoDate).getTime() : Date.now()
        });
        await sleep(1400);
      }
    } catch (e) {
      console.error('Podcast error:', pod.url, e.message);
    }
  }

  // 3. All 28 Indian States (Title-aware Gemini expansion prevents headline copy-paste)
  for (const stateName of INDIAN_STATES) {
    const q = encodeURIComponent(`${stateName} government OR chief minister OR news`);
    const stateUrl = `https://news.google.com/rss/search?q=${q}+when:3d&hl=en-IN&gl=IN&ceid=IN:en`;
    try {
      const parsed = await parser.parseURL(stateUrl);
      for (const item of (parsed.items || []).slice(0, 2)) {
        const rawTitle = item.title || '';
        const sourceMatch = rawTitle.match(/\s+[-–|]\s+([^-–|]+)$/);
        const pubSource = sourceMatch ? sourceMatch[1].trim() : `${stateName} Desk`;
        const title = stripPublisherSuffix(cleanRawNoise(rawTitle));
        if (!title || title.length < 15 || isDuplicate(title)) continue;

        const snippet = cleanRawNoise(item.contentSnippet || item.content || '');
        const summary = await rewriteWithGemini(title, snippet, false, stateName);
        if (!summary || summary.split(/\s+/).length < 20) continue;

        stories.push({
          id: Buffer.from(title).toString('base64').slice(0, 24),
          title,
          summary,
          source: pubSource,
          category: 'India States',
          tags: ['India States'],
          state: stateName,
          image: extractRssImage(item),
          url: item.link || '',
          videoUrl: '',
          pubDate: item.isoDate ? new Date(item.isoDate).getTime() : Date.now()
        });
        await sleep(1400);
      }
    } catch (e) {
      console.error('State error:', stateName, e.message);
    }
  }

  if (stories.length >= 25) {
    fs.writeFileSync('news.json', JSON.stringify(stories, null, 2));
    console.log(`Saved ${stories.length} clean stories to news.json`);
  } else {
    console.error(`Too few stories (${stories.length}); preserving existing news.json`);
    process.exit(1);
  }
}

main();
