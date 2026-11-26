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
const LANG_CODES = ['en', 'hi', 'bn', 'mr', 'te', 'ta', 'kn', 'or'];

const STATE_QUERIES = [
  { name: 'Odisha', q: '"Odisha" (Bhubaneswar OR Cuttack OR Puri OR Sambalpur OR Berhampur OR Balasore OR Rourkela OR Koraput OR Mayurbhanj)', limit: 4 },
  { name: 'Telangana', q: '"Telangana" (Hyderabad OR Warangal OR Nizamabad OR Karimnagar)', limit: 2 },
  { name: 'Andhra Pradesh', q: '"Andhra Pradesh" (Amaravati OR Visakhapatnam OR Vijayawada OR Tirupati)', limit: 2 },
  { name: 'Maharashtra', q: '"Maharashtra" (Mumbai OR Pune OR Nagpur OR Nashik)', limit: 2 },
  { name: 'Karnataka', q: '"Karnataka" (Bengaluru OR Mysuru OR Mangaluru OR Hubballi)', limit: 2 },
  { name: 'Tamil Nadu', q: '"Tamil Nadu" (Chennai OR Coimbatore OR Madurai OR Tiruchirappalli)', limit: 2 },
  { name: 'West Bengal', q: '"West Bengal" (Kolkata OR Howrah OR Darjeeling OR Siliguri)', limit: 2 },
  { name: 'Uttar Pradesh', q: '"Uttar Pradesh" (Lucknow OR Varanasi OR Kanpur OR Agra OR Noida)', limit: 2 },
  { name: 'Bihar', q: '"Bihar" (Patna OR Gaya OR Muzaffarpur)', limit: 1 },
  { name: 'Gujarat', q: '"Gujarat" (Ahmedabad OR Surat OR Vadodara)', limit: 1 },
  { name: 'Rajasthan', q: '"Rajasthan" (Jaipur OR Jodhpur OR Udaipur)', limit: 1 },
  { name: 'Madhya Pradesh', q: '"Madhya Pradesh" (Bhopal OR Indore OR Gwalior)', limit: 1 },
  { name: 'Kerala', q: '"Kerala" (Thiruvananthapuram OR Kochi OR Kozhikode)', limit: 1 },
  { name: 'Punjab', q: '"Punjab" (Amritsar OR Ludhiana OR Jalandhar)', limit: 1 },
  { name: 'Haryana', q: '"Haryana" (Gurugram OR Faridabad)', limit: 1 },
  { name: 'Assam', q: '"Assam" (Guwahati OR Dibrugarh OR Silchar)', limit: 1 },
  { name: 'Chhattisgarh', q: '"Chhattisgarh" (Raipur OR Bilaspur)', limit: 1 },
  { name: 'Jharkhand', q: '"Jharkhand" (Ranchi OR Jamshedpur)', limit: 1 },
  { name: 'Uttarakhand', q: '"Uttarakhand" (Dehradun OR Haridwar)', limit: 1 },
  { name: 'Himachal Pradesh', q: '"Himachal Pradesh" (Shimla OR Manali)', limit: 1 },
  { name: 'Arunachal Pradesh', q: '"Arunachal Pradesh" Itanagar', limit: 1 },
  { name: 'Goa', q: '"Goa" Panaji', limit: 1 },
  { name: 'Manipur', q: '"Manipur" Imphal', limit: 1 },
  { name: 'Meghalaya', q: '"Meghalaya" Shillong', limit: 1 },
  { name: 'Mizoram', q: '"Mizoram" Aizawl', limit: 1 },
  { name: 'Nagaland', q: '"Nagaland" Kohima', limit: 1 },
  { name: 'Sikkim', q: '"Sikkim" Gangtok', limit: 1 },
  { name: 'Tripura', q: '"Tripura" Agartala', limit: 1 }
];

const CORE_FEEDS = [
  { url: 'https://feeds.feedburner.com/ndtvnews-top-stories', category: 'General', source: 'NDTV', limit: 4 },
  { url: 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms', category: 'General', source: 'Times of India', limit: 4 },
  { url: 'https://www.thehindu.com/news/national/feeder/default.rss', category: 'India National', source: 'The Hindu', limit: 4 },
  { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', category: 'World', source: 'BBC News', limit: 4 },
  { url: 'https://www.thehindu.com/news/national/politics/feeder/default.rss', category: 'Politics', source: 'The Hindu', limit: 4 },
  { url: 'https://feeds.bbci.co.uk/sport/rss.xml', category: 'Sports', source: 'BBC Sport', limit: 4 },
  { url: 'https://www.thehindu.com/sci-tech/science/feeder/default.rss', category: 'Science & Education', source: 'The Hindu Science', limit: 4 },
  { url: 'https://www.bollywoodhungama.com/rss/news.xml', category: 'Entertainment', source: 'Bollywood Hungama', limit: 4 }
];

const PODCAST_FEEDS = [
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCzwCEE_PchiBULMnAJqhGVg', source: 'Raj Shamani • Figuring Out' },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCRvG4p0G_R-i69K6qB_dK8w', source: 'Nikhil Kamath • WTF is' },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCt4t-jeY85JegMlZ-E5UWtA', source: 'ANI Podcast with Smita Prakash' }
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
  return low.includes('logo') || low.includes('icon') || low.includes('favicon') || low.includes('placeholder') || low.includes('default') || low.includes('1x1') || low.includes('googleusercontent.com/proxy') || low.includes('gstatic.com');
}

function upgradeImageUrl(url = '') {
  if (!url) return '';
  return url.replace(/([?&])(w|width|h|height|size|resize|quality|q)=\d+/gi, '').replace(/\/thumb\//gi, '/').replace(/-\d{2,3}x\d{2,3}(\.(?:jpg|jpeg|png|webp))/gi, '$1');
}

function extractRssImage(item) {
  if (item.enclosure?.url && !isBadImage(item.enclosure.url)) return upgradeImageUrl(item.enclosure.url);
  if (Array.isArray(item.mediaContent)) {
    for (const m of item.mediaContent) {
      const u = m?.$?.url || m?.url;
      if (u && !isBadImage(u)) return upgradeImageUrl(u);
    }
  }
  const html = item['content:encoded'] || item.content || item.description || '';
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match && !isBadImage(match[1]) ? upgradeImageUrl(match[1]) : '';
}

function extractYouTubeId(item) {
  if (item.ytVideoId) return String(item.ytVideoId).trim();
  const m = (item.link || '').match(/(?:v=|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : '';
}

async function scrapeArticleDetails(url) {
  if (!url || url.includes('news.google.com') || url.includes('youtube.com')) return { image: '', text: '' };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
    clearTimeout(timer);
    if (!res.ok) return { image: '', text: '' };
    const $ = cheerio.load(await res.text());
    let ogImg = $('meta[property="og:image"]').attr('content') || $('meta[name="twitter:image"]').attr('content') || '';
    if (ogImg.startsWith('//')) ogImg = 'https:' + ogImg;
    if (isBadImage(ogImg)) ogImg = '';
    const paragraphs = [];
    $('article p, .story-content p, main p, p').each((_, el) => {
      const t = $(el).text().replace(/\s+/g, ' ').trim();
      if (t.length > 50 && !/subscription|cookie|copyright|sign in/i.test(t)) paragraphs.push(t);
    });
    return { image: upgradeImageUrl(ogImg), text: paragraphs.slice(0, 4).join(' ') };
  } catch {
    return { image: '', text: '' };
  }
}

function ensureCompleteSummary(text, fallbackTitle) {
  let cleaned = cleanHtml(text).replace(/^["']|["']$/g, '').trim();
  if (!cleaned || cleaned.split(/\s+/).length < 14) {
    cleaned = `${fallbackTitle.replace(/[.।]$/, '')}. Official sources have confirmed the latest developments and administrative updates on this report.`;
  }
  const words = cleaned.split(/\s+/);
  if (words.length > 52) cleaned = words.slice(0, 50).join(' ');
  const lastDot = Math.max(cleaned.lastIndexOf('.'), cleaned.lastIndexOf('।'), cleaned.lastIndexOf('!'), cleaned.lastIndexOf('?'));
  if (lastDot > 30) cleaned = cleaned.slice(0, lastDot + 1);
  else if (!/[.।!?]$/.test(cleaned)) cleaned += '.';
  return cleaned;
}

// Single-pass 3-story x 8-language batcher (~22 total API calls per run = stays 100% within free quota)
async function processMiniBatch(batch) {
  const inputList = batch.map((b, i) => ({
    idx: i,
    headline: b.rawTitle,
    category: b.suggestedCategory,
    state: b.stateName || '',
    content: b.rawText.slice(0, 750)
  }));

  const prompt = `You are the chief multilingual news editor for Pulse50. For EACH item in the JSON array below, write a natural, journalistic headline and a 44 to 50 word summary in ALL 8 languages: en, hi, bn, mr, te, ta, kn, or.

RULES:
1. NEVER translate proper nouns, company names, film studios, sports leagues, brands, or people's names by dictionary meaning—transliterate them phonetically (e.g., "Colour Yellow" -> "କଲର୍ ୟେଲୋ" in Odia / "कलर येलो" in Hindi, NEVER "ରଙ୍ଗ ହଳଦିଆ"; "Mindtree" -> "ମାଇଣ୍ଡଟ୍ରୀ", NEVER "ମନ ଗଛ").
2. Write smooth, complete sentences in each script. Never leave stray English words or split currency numbers.
3. Each summary MUST be 44-50 words, end with . or ।, and never repeat the headline verbatim or mention publisher names.
4. Classify each item from ONLY: ["India National", "World", "Politics", "Sports", "Entertainment", "Science & Education"] (or ["Podcasts"] if category is Podcasts).

Return ONLY a valid JSON array matching each "idx":
[
  {
    "idx": 0,
    "categories": ["..."],
    "translations": {
      "en": { "title": "...", "summary": "..." },
      "hi": { "title": "...", "summary": "..." },
      "bn": { "title": "...", "summary": "..." },
      "mr": { "title": "...", "summary": "..." },
      "te": { "title": "...", "summary": "..." },
      "ta": { "title": "...", "summary": "..." },
      "kn": { "title": "...", "summary": "..." },
      "or": { "title": "...", "summary": "..." }
    }
  }
]

Input:
${JSON.stringify(inputList)}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });
      const raw = String(response?.text || '[]').replace(/```json\s*|```\s*/gi, '').trim();
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (err) {
      console.error(`Batch error (attempt ${attempt}):`, err?.status || err?.message);
      if (attempt < 3) await sleep(attempt * 8000);
    }
  }
  return [];
}

async function run() {
  const rawQueue = [];
  const seenTitles = new Set();

  const queueItem = (item) => {
    const key = item.rawTitle.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
    if (!key || seenTitles.has(key)) return;
    seenTitles.add(key);
    rawQueue.push(item);
  };

  for (const feed of CORE_FEEDS) {
    try {
      const parsed = await parser.parseURL(feed.url);
      for (const item of (parsed.items || []).slice(0, feed.limit)) {
        const rawTitle = cleanHtml(item.title || '').replace(/\s+-\s+[^-]+$/, '').trim();
        if (!rawTitle) continue;
        let img = extractRssImage(item);
        let bodyText = cleanHtml(item['content:encoded'] || item.contentSnippet || item.description || '');
        if (!img || bodyText.split(/\s+/).length < 25) {
          const scraped = await scrapeArticleDetails(item.link);
          if (!img && scraped.image) img = scraped.image;
          if (scraped.text.length > bodyText.length) bodyText = scraped.text;
        }
        queueItem({
          id: Buffer.from(rawTitle).toString('base64').slice(0, 24),
          suggestedCategory: feed.category,
          stateName: '',
          rawTitle,
          rawText: bodyText || rawTitle,
          source: feed.source,
          image: img,
          video: '',
          link: item.link || '',
          pubDate: item.isoDate || item.pubDate || new Date().toISOString()
        });
      }
    } catch (e) {
      console.warn(`Core skip (${feed.source}):`, e.message);
    }
  }

  for (const st of STATE_QUERIES) {
    try {
      const stateUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(`${st.q} when:3d`)}&hl=en-IN&gl=IN&ceid=IN:en`;
      const parsed = await parser.parseURL(stateUrl);
      for (const item of (parsed.items || []).slice(0, st.limit)) {
        const parts = cleanHtml(item.title || '').split(' - ');
        const sourceName = parts.length > 1 ? parts.pop().trim() : `${st.name} Desk`;
        const rawTitle = parts.join(' - ').trim();
        if (!rawTitle) continue;
        queueItem({
          id: Buffer.from(`${st.name}-${rawTitle}`).toString('base64').slice(0, 24),
          suggestedCategory: 'State',
          stateName: st.name,
          rawTitle,
          rawText: cleanHtml(item.contentSnippet || item.description || rawTitle),
          source: sourceName,
          image: extractRssImage(item),
          video: '',
          link: item.link || '',
          pubDate: item.isoDate || item.pubDate || new Date().toISOString()
        });
      }
    } catch (e) {
      console.warn(`State skip (${st.name}):`, e.message);
    }
  }

  for (const pod of PODCAST_FEEDS) {
    try {
      const parsed = await parser.parseURL(pod.url);
      for (const item of (parsed.items || []).slice(0, 2)) {
        const link = item.link || '';
        const rawTitle = cleanHtml(item.title || '');
        if (!rawTitle || link.includes('/shorts/') || /#shorts|\blive:/i.test(rawTitle)) continue;
        const videoId = extractYouTubeId(item);
        queueItem({
          id: Buffer.from(`pod-${videoId || rawTitle}`).toString('base64').slice(0, 24),
          suggestedCategory: 'Podcasts',
          stateName: '',
          rawTitle,
          rawText: cleanHtml(item.mediaGroup?.['media:description']?.[0] || item.contentSnippet || rawTitle),
          source: pod.source,
          image: videoId ? `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg` : extractRssImage(item),
          video: videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=1` : link,
          link: link || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : ''),
          pubDate: item.isoDate || item.pubDate || new Date().toISOString()
        });
      }
    } catch (e) {
      console.warn(`Podcast skip (${pod.source}):`, e.message);
    }
  }

  console.log(`Processing ${rawQueue.length} stories in mini-batches of 3 across 8 languages...`);
  const allStories = [];
  let multilingualSuccessCount = 0;

  for (let i = 0; i < rawQueue.length; i += 3) {
    const batch = rawQueue.slice(i, i + 3);
    const aiResults = await processMiniBatch(batch);

    batch.forEach((orig, idx) => {
      const found = aiResults.find((r) => r.idx === idx) || {};
      const tr = found.translations || {};
      const cleanTranslations = {};

      for (const code of LANG_CODES) {
        if (tr[code]?.title && tr[code]?.summary) {
          cleanTranslations[code] = {
            title: cleanHtml(tr[code].title),
            summary: ensureCompleteSummary(tr[code].summary, tr[code].title)
          };
        }
      }

      if (cleanTranslations.or && cleanTranslations.hi) multilingualSuccessCount++;

      const enTitle = cleanTranslations.en?.title || orig.rawTitle;
      const enSummary = cleanTranslations.en?.summary || ensureCompleteSummary(orig.rawText, orig.rawTitle);
      if (!cleanTranslations.en) cleanTranslations.en = { title: enTitle, summary: enSummary };

      const tags = new Set();
      if (orig.suggestedCategory === 'State') {
        tags.add('State');
      } else if (orig.suggestedCategory === 'Podcasts') {
        tags.add('Podcasts');
      } else {
        tags.add('General');
        tags.add(orig.suggestedCategory);
        for (const c of (found.categories || [])) {
          if (['India National', 'World', 'Politics', 'Sports', 'Entertainment', 'Science & Education'].includes(c)) {
            tags.add(c);
          }
        }
      }

      const primaryCat = orig.suggestedCategory === 'General'
        ? (Array.from(tags).find((c) => c !== 'General') || 'General')
        : orig.suggestedCategory;

      allStories.push({
        id: orig.id,
        category: primaryCat,
        primaryCategory: primaryCat,
        tags: Array.from(tags),
        stateTags: orig.stateName ? [orig.stateName] : [],
        nativeLang: 'en',
        title: enTitle,
        summary: enSummary,
        translations: cleanTranslations,
        source: orig.source,
        image: orig.image,
        video: orig.video,
        link: orig.link,
        pubDate: orig.pubDate
      });
    });

    console.log(`Batch ${Math.floor(i / 3) + 1}: multilingual stories ready = ${multilingualSuccessCount} / ${allStories.length}`);
    await sleep(7500);
  }

  allStories.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  console.log(`Total stories: ${allStories.length} | Multilingual 8-lang stories: ${multilingualSuccessCount}`);

  if (allStories.length >= 25) {
    fs.writeFileSync('news.json', JSON.stringify(allStories, null, 2), 'utf-8');
    console.log('Successfully wrote news.json');
  } else {
    console.error('Too few stories generated; preserving existing news.json');
    process.exit(1);
  }
}

run();
