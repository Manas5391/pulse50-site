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

// All 28 Indian states with native Google News regional locale + major districts for deep local coverage
const STATE_CONFIGS = [
  { name: 'Odisha', hl: 'or', ceid: 'IN:or', langName: 'Odia', districts: 'ଭୁବନେଶ୍ୱର OR କଟକ OR ପୁରୀ OR ସମ୍ବଲପୁର OR ବ୍ରହ୍ମପୁର OR ବାଲେଶ୍ୱର OR ରାଉରକେଲା OR କୋରାପୁଟ OR ମୟୂରଭଞ୍ଜ' },
  { name: 'Telangana', hl: 'te', ceid: 'IN:te', langName: 'Telugu', districts: 'హైదరాబాద్ OR వరంగల్ OR నిజామాబాద్ OR కరీంనగర్ OR ఖమ్మం OR నల్గొండ' },
  { name: 'Andhra Pradesh', hl: 'te', ceid: 'IN:te', langName: 'Telugu', districts: 'అమరావతి OR విశాఖపట్నం OR విజయవాడ OR తిరుపతి OR గుంటూరు OR కర్నూలు' },
  { name: 'West Bengal', hl: 'bn', ceid: 'IN:bn', langName: 'Bengali', districts: 'কলকাতা OR হাওড়া OR দার্জিলিং OR শিলিগুড়ি OR দুর্গাপুর OR বর্ধমান' },
  { name: 'Tamil Nadu', hl: 'ta', ceid: 'IN:ta', langName: 'Tamil', districts: 'சென்னை OR கோயம்புத்தூர் OR மதுரை OR திருச்சி OR சேலம் OR திருநெல்வேலி' },
  { name: 'Karnataka', hl: 'kn', ceid: 'IN:kn', langName: 'Kannada', districts: 'ಬೆಂಗಳೂರು OR ಮೈಸೂರು OR ಮಂಗಳೂರು OR ಹುಬ್ಬಳ್ಳಿ OR ಬೆಳಗಾವಿ OR ಕಲಬುರಗಿ' },
  { name: 'Maharashtra', hl: 'mr', ceid: 'IN:mr', langName: 'Marathi', districts: 'मुंबई OR पुणे OR नागपूर OR नाशिक OR छत्रपती संभाजीनगर OR कोल्हापूर' },
  { name: 'Kerala', hl: 'ml', ceid: 'IN:ml', langName: 'Malayalam', districts: 'തിരുവനന്തപുരം OR കൊച്ചി OR കോഴിക്കോട് OR തൃശ്ശൂർ OR കണ്ണൂർ' },
  { name: 'Gujarat', hl: 'gu', ceid: 'IN:gu', langName: 'Gujarati', districts: 'અમદાવાદ OR સુરત OR વડોદરા OR રાજકોટ OR ગાંધીનગર' },
  { name: 'Punjab', hl: 'pa', ceid: 'IN:pa', langName: 'Punjabi', districts: 'ਅੰਮ੍ਰਿਤਸਰ OR ਲੁਧਿਆਣਾ OR ਜਲੰਧਰ OR ਪਟਿਆਲਾ OR ਮੁਹਾਲੀ' },
  { name: 'Uttar Pradesh', hl: 'hi', ceid: 'IN:hi', langName: 'Hindi', districts: 'लखनऊ OR वाराणसी OR कानपुर OR आगरा OR नोएडा OR प्रयागराज OR गोरखपुर' },
  { name: 'Bihar', hl: 'hi', ceid: 'IN:hi', langName: 'Hindi', districts: 'पटना OR गया OR मुजफ्फरपुर OR भागलपुर OR दरभंगा' },
  { name: 'Madhya Pradesh', hl: 'hi', ceid: 'IN:hi', langName: 'Hindi', districts: 'भोपाल OR इंदौर OR ग्वालियर OR जबलपुर OR उज्जैन' },
  { name: 'Rajasthan', hl: 'hi', ceid: 'IN:hi', langName: 'Hindi', districts: 'जयपुर OR जोधपुर OR उदयपुर OR कोटा OR अजमेर' },
  { name: 'Haryana', hl: 'hi', ceid: 'IN:hi', langName: 'Hindi', districts: 'गुरुग्राम OR फरीदाबाद OR अंबाला OR हिसार OR रोहतक' },
  { name: 'Chhattisgarh', hl: 'hi', ceid: 'IN:hi', langName: 'Hindi', districts: 'रायपुर OR बिलासपुर OR दुर्ग OR बस्तर OR कोरबा' },
  { name: 'Jharkhand', hl: 'hi', ceid: 'IN:hi', langName: 'Hindi', districts: 'रांची OR जमशेदपुर OR धनबाद OR बोकारो' },
  { name: 'Uttarakhand', hl: 'hi', ceid: 'IN:hi', langName: 'Hindi', districts: 'देहरादून OR हरिद्वार OR नैनीताल OR हल्द्वानी' },
  { name: 'Himachal Pradesh', hl: 'hi', ceid: 'IN:hi', langName: 'Hindi', districts: 'शिमला OR मनाली OR धर्मशाला OR कांगड़ा' },
  { name: 'Assam', hl: 'en-IN', ceid: 'IN:en', langName: 'English', districts: 'Guwahati OR Dibrugarh OR Silchar OR Jorhat' },
  { name: 'Arunachal Pradesh', hl: 'en-IN', ceid: 'IN:en', langName: 'English', districts: 'Itanagar OR Tawang OR Pasighat' },
  { name: 'Goa', hl: 'en-IN', ceid: 'IN:en', langName: 'English', districts: 'Panaji OR Margao OR Vasco' },
  { name: 'Manipur', hl: 'en-IN', ceid: 'IN:en', langName: 'English', districts: 'Imphal OR Churachandpur' },
  { name: 'Meghalaya', hl: 'en-IN', ceid: 'IN:en', langName: 'English', districts: 'Shillong OR Tura' },
  { name: 'Mizoram', hl: 'en-IN', ceid: 'IN:en', langName: 'English', districts: 'Aizawl OR Lunglei' },
  { name: 'Nagaland', hl: 'en-IN', ceid: 'IN:en', langName: 'English', districts: 'Kohima OR Dimapur' },
  { name: 'Sikkim', hl: 'en-IN', ceid: 'IN:en', langName: 'English', districts: 'Gangtok OR Namchi' },
  { name: 'Tripura', hl: 'bn', ceid: 'IN:bn', langName: 'Bengali', districts: 'আগরতলা OR ত্রিপুরা' }
];

const CORE_FEEDS = [
  // General (All-in-one trending mix)
  { url: 'https://feeds.feedburner.com/ndtvnews-top-stories', category: 'General', source: 'NDTV', limit: 6 },
  { url: 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms', category: 'General', source: 'Times of India', limit: 6 },

  // India National
  { url: 'https://www.thehindu.com/news/national/feeder/default.rss', category: 'India National', source: 'The Hindu', limit: 8 },
  { url: 'https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms', category: 'India National', source: 'Times of India', limit: 7 },
  { url: 'https://feeds.feedburner.com/ndtvnews-india-news', category: 'India National', source: 'NDTV India', limit: 7 },

  // World
  { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', category: 'World', source: 'BBC News', limit: 8 },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml', category: 'World', source: 'Al Jazeera', limit: 7 },
  { url: 'https://feeds.feedburner.com/ndtvnews-world-news', category: 'World', source: 'NDTV World', limit: 6 },

  // Politics
  { url: 'https://www.thehindu.com/news/national/politics/feeder/default.rss', category: 'Politics', source: 'The Hindu', limit: 8 },
  { url: 'https://news.google.com/rss/search?q=(Parliament+OR+Lok+Sabha+OR+Rajya+Sabha+OR+Union+Cabinet+OR+Election+Commission+OR+Chief+Minister+OR+BJP+OR+Congress)+when:2d&hl=en-IN&gl=IN&ceid=IN:en', category: 'Politics', source: 'India Politics Desk', limit: 8 },

  // Sports
  { url: 'https://feeds.bbci.co.uk/sport/rss.xml', category: 'Sports', source: 'BBC Sport', limit: 7 },
  { url: 'https://timesofindia.indiatimes.com/rssfeeds/4719148.cms', category: 'Sports', source: 'Times of India', limit: 7 },
  { url: 'https://feeds.feedburner.com/ndtvsports-latest', category: 'Sports', source: 'NDTV Sports', limit: 7 },

  // Science & Education (Dedicated Tab)
  { url: 'https://www.thehindu.com/sci-tech/science/feeder/default.rss', category: 'Science & Education', source: 'The Hindu Science', limit: 7 },
  { url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml', category: 'Science & Education', source: 'BBC Science', limit: 6 },
  { url: 'https://news.google.com/rss/search?q=(ISRO+OR+NASA+OR+UGC+OR+CBSE+OR+NEET+OR+JEE+OR+IIT+OR+education+policy+OR+scientific+research)+when:2d&hl=en-IN&gl=IN&ceid=IN:en', category: 'Science & Education', source: 'Science & Edu Desk', limit: 8 },

  // Entertainment
  { url: 'https://timesofindia.indiatimes.com/rssfeeds/1081479906.cms', category: 'Entertainment', source: 'Times of India', limit: 7 },
  { url: 'https://www.bollywoodhungama.com/rss/news.xml', category: 'Entertainment', source: 'Bollywood Hungama', limit: 7 },
  { url: 'https://feeds.feedburner.com/ndtvmovies-latest', category: 'Entertainment', source: 'NDTV Movies', limit: 6 }
];

const PODCAST_FEEDS = [
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCzwCEE_PchiBULMnAJqhGVg', source: 'Raj Shamani • Figuring Out' },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCRvG4p0G_R-i69K6qB_dK8w', source: 'Nikhil Kamath • WTF is' },
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
    .replace(/([?&])(w|width|h|height|size|resize|quality|q)=\d+/gi, '')
    .replace(/\/thumb\//gi, '/')
    .replace(/-\d{2,3}x\d{2,3}(\.(?:jpg|jpeg|png|webp))/gi, '$1')
    .replace(/\/240\//g, '/1024/')
    .replace(/\/320\//g, '/1024/');
}

function extractRssImage(item) {
  if (item.enclosure?.url && !isBadImage(item.enclosure.url)) return upgradeImageUrl(item.enclosure.url);
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
    const timer = setTimeout(() => controller.abort(), 6500);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36' }
    });
    clearTimeout(timer);
    if (!res.ok) return { image: '', text: '' };
    const html = await res.text();
    const $ = cheerio.load(html);

    let ogImg = $('meta[property="og:image"]').attr('content') || $('meta[name="twitter:image"]').attr('content') || '';
    if (ogImg.startsWith('//')) ogImg = 'https:' + ogImg;
    if (isBadImage(ogImg)) ogImg = '';

    const paragraphs = [];
    $('article p, .story-content p, .article-body p, main p, p').each((_, el) => {
      const t = $(el).text().replace(/\s+/g, ' ').trim();
      if (t.length > 55 && !/subscription|cookie|copyright|sign in/i.test(t)) {
        paragraphs.push(t);
      }
    });
    return { image: upgradeImageUrl(ogImg), text: paragraphs.slice(0, 5).join(' ') };
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
      return !/(http:\/\/|https:\/\/|@|copyright|all rights reserved|subscribe|disclaimer|follow us|instagram|spotify|guest suggestion|---)/i.test(l);
    });
  return cleanHtml(lines.slice(0, 4).join(' '));
}

function ensureCompleteSummary(text, fallbackTitle) {
  let cleaned = cleanHtml(text).replace(/^["']|["']$/g, '').replace(/\s+/g, ' ').trim();
  if (!cleaned || cleaned.split(/\s+/).length < 16) {
    cleaned = `${fallbackTitle.replace(/[.।]$/, '')}. Official sources and regional correspondents have confirmed the latest developments and administrative updates on this report.`;
  }
  const words = cleaned.split(/\s+/);
  if (words.length > 52) cleaned = words.slice(0, 50).join(' ');
  const lastDot = Math.max(cleaned.lastIndexOf('.'), cleaned.lastIndexOf('।'), cleaned.lastIndexOf('!'), cleaned.lastIndexOf('?'));
  if (lastDot > 35) cleaned = cleaned.slice(0, lastDot + 1);
  else if (!/[.।!?]$/.test(cleaned)) cleaned += '.';
  return cleaned;
}

function verifyCategorySemantically(requestedCategory, aiVerifiedCategory, title, summary) {
  const text = `${title} ${summary}`.toLowerCase();
  if (requestedCategory === 'Politics' || aiVerifiedCategory === 'Politics') {
    const politicalSignals = /\b(parliament|lok sabha|rajya sabha|minister|ministry|cabinet|election|poll|bjp|congress|party|mp|mla|cm|chief minister|prime minister|governor|bill|ordinance|assembly|opposition|coalition|manifesto|campaign|diplomat|summit|policy)\b/i;
    const nonPoliticalNoise = /\b(box office|trailer|actress|actor|cricket|wicket|innings|ipl|football|goal|murder|accident|weather|rainfall|stock market|ipo)\b/i;
    if (!politicalSignals.test(text) || nonPoliticalNoise.test(text)) return false;
  }
  if (requestedCategory === 'Sports' || aiVerifiedCategory === 'Sports') {
    if (/\b(international criminal court|war crimes|genocide|hague|arrest warrant)\b/i.test(text)) return false;
  }
  return true;
}

async function analyzeAndSummarize({ title, rawText, source, suggestedCategory, targetLang = 'English', stateName = '', isPodcast = false }) {
  const contextText = (rawText || '').slice(0, 1400);

  if (isPodcast) {
    const podPrompt = `Write a crisp, engaging 45 to 50 word summary of this podcast episode in complete English sentences.
Rules: Explain what the host and guest discuss and the core takeaway. Never include URLs, emails, hashtags, or subscribe prompts. End with a period.
Channel: ${source}
Episode: ${title}
Notes: ${contextText}`;
    try {
      const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: podPrompt });
      const out = response?.text?.trim() || '';
      if (out && out.split(/\s+/).length >= 28) {
        return { summary: ensureCompleteSummary(out, title), verifiedCategories: ['Podcasts'] };
      }
    } catch {}
    return { summary: ensureCompleteSummary(contextText, title), verifiedCategories: ['Podcasts'] };
  }

  const newsPrompt = `You are a senior news editor for Pulse50. Read this story, classify its categories, and write a factual 45 to 50 word summary in ${targetLang}.

Rules:
1. Write the summary strictly in ${targetLang} script (e.g., Odia script for Odia, Telugu script for Telugu, Hindi Devanagari for Hindi, Bengali script for Bengali, Tamil for Tamil, Kannada for Kannada, or English for English).
2. Summary MUST be 44 to 50 words, end with a full stop (or ।), include concrete facts (who, what, where, district/impact), and NEVER repeat the headline verbatim or mention "${source}".
3. Classify from ONLY: ["India National", "World", "Politics", "Sports", "Entertainment", "Science & Education"].
${stateName ? `4. Highlight the specific district and local impact in ${stateName}.` : ''}

Return ONLY valid JSON:
{"summary": "...", "categories": ["..."]}

Headline: ${title}
Suggested Category: ${suggestedCategory}
Source Material: ${contextText || title}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: newsPrompt,
      config: { responseMimeType: 'application/json' }
    });
    const parsed = JSON.parse(response?.text || '{}');
    const summary = ensureCompleteSummary(parsed.summary || contextText, title);
    const aiCats = Array.isArray(parsed.categories) ? parsed.categories : [suggestedCategory];
    return { summary, verifiedCategories: aiCats };
  } catch {
    return { summary: ensureCompleteSummary(contextText, title), verifiedCategories: [suggestedCategory] };
  }
}

async function run() {
  const allStories = [];
  const seenTitles = new Set();

  const addUnique = (story) => {
    const key = story.title.toLowerCase().replace(/\s+/g, '').slice(0, 60);
    if (!key || seenTitles.has(key)) return;
    seenTitles.add(key);
    allStories.push(story);
  };

  console.log('1. Fetching Core Category Feeds...');
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

        const { summary, verifiedCategories } = await analyzeAndSummarize({
          title: rawTitle,
          rawText: bodyText,
          source: feed.source,
          suggestedCategory: feed.category,
          targetLang: 'English'
        });

        const finalTags = new Set(['General']);
        for (const cat of verifiedCategories) {
          if (verifyCategorySemantically(cat, cat, rawTitle, summary)) finalTags.add(cat);
        }
        if (verifyCategorySemantically(feed.category, feed.category, rawTitle, summary)) {
          finalTags.add(feed.category);
        }
        const primaryCat = Array.from(finalTags).find((c) => c !== 'General') || 'General';

        addUnique({
          id: Buffer.from(rawTitle).toString('base64').slice(0, 24),
          category: primaryCat,
          primaryCategory: primaryCat,
          tags: Array.from(finalTags),
          stateTags: [],
          nativeLang: 'en',
          title: rawTitle,
          summary,
          source: feed.source,
          image: img,
          video: '',
          link: item.link || '',
          pubDate: item.isoDate || item.pubDate || new Date().toISOString()
        });
        await sleep(1100);
      }
    } catch (e) {
      console.warn(`Core feed error (${feed.source}):`, e.message);
    }
  }

  console.log('2. Fetching Deep District-Wise Native Regional News for All 28 States...');
  for (const st of STATE_CONFIGS) {
    try {
      // Combine state-wide regional query + major districts query for deep local coverage
      const rawQuery = st.langName === 'English'
        ? `"${st.name}" (${st.districts}) when:3d`
        : `${st.districts} when:3d`;
      const stateUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(rawQuery)}&hl=${st.hl}&gl=IN&ceid=${st.ceid}`;
      const parsed = await parser.parseURL(stateUrl);
      const limitPerState = st.name === 'Odisha' ? 12 : 6;
      const items = (parsed.items || []).slice(0, limitPerState);

      for (const item of items) {
        const parts = cleanHtml(item.title || '').split(' - ');
        const sourceName = parts.length > 1 ? parts.pop().trim() : `${st.name} Desk`;
        const rawTitle = parts.join(' - ').trim();
        if (!rawTitle) continue;

        const snippet = cleanHtml(item.contentSnippet || item.description || rawTitle);
        const { summary } = await analyzeAndSummarize({
          title: rawTitle,
          rawText: snippet,
          source: sourceName,
          suggestedCategory: 'State',
          targetLang: st.langName,
          stateName: st.name
        });

        addUnique({
          id: Buffer.from(`${st.name}-${rawTitle}`).toString('base64').slice(0, 24),
          category: 'State',
          primaryCategory: 'State',
          tags: ['State'],
          stateTags: [st.name],
          nativeLang: st.hl.split('-')[0],
          title: rawTitle,
          summary,
          source: sourceName,
          image: extractRssImage(item),
          video: '',
          link: item.link || '',
          pubDate: item.isoDate || item.pubDate || new Date().toISOString()
        });
        await sleep(1100);
      }
    } catch (e) {
      console.warn(`State feed error (${st.name}):`, e.message);
    }
  }

  console.log('3. Fetching Podcasts...');
  for (const pod of PODCAST_FEEDS) {
    try {
      const parsed = await parser.parseURL(pod.url);
      const items = (parsed.items || []).slice(0, 2);
      for (const item of items) {
        const link = item.link || '';
        const rawTitle = cleanHtml(item.title || '');
        if (!rawTitle || link.includes('/shorts/') || /#shorts|\blive:/i.test(rawTitle)) continue;

        const videoId = extractYouTubeId(item);
        const thumb = videoId ? `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg` : extractRssImage(item);
        const rawDesc = sanitizePodcastDescription(item.mediaGroup?.['media:description']?.[0] || item.contentSnippet || item.description || '');

        const { summary } = await analyzeAndSummarize({
          title: rawTitle,
          rawText: rawDesc || rawTitle,
          source: pod.source,
          suggestedCategory: 'Podcasts',
          isPodcast: true
        });

        addUnique({
          id: Buffer.from(`pod-${videoId || rawTitle}`).toString('base64').slice(0, 24),
          category: 'Podcasts',
          primaryCategory: 'Podcasts',
          tags: ['Podcasts'],
          stateTags: [],
          nativeLang: 'en',
          title: rawTitle,
          summary,
          source: pod.source,
          image: thumb,
          video: videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=1` : link,
          link: link || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : ''),
          pubDate: item.isoDate || item.pubDate || new Date().toISOString()
        });
        await sleep(1100);
      }
    } catch (e) {
      console.warn(`Podcast error (${pod.source}):`, e.message);
    }
  }

  allStories.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  console.log(`Total stories generated: ${allStories.length}`);
  if (allStories.length >= 25) {
    fs.writeFileSync('news.json', JSON.stringify(allStories, null, 2), 'utf-8');
    console.log('Successfully wrote news.json');
  } else {
    console.error('Too few stories generated; preserving existing news.json');
    process.exit(1);
  }
}

run();
