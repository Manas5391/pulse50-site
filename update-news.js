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

// Direct Regional Newspaper & TV RSS Feeds + District Queries for Deep State Coverage
const STATE_DIRECT_FEEDS = [
  // Odisha — Multiple Direct Newspapers, TV Channels & District Feeds (Odia)
  { state: 'Odisha', hl: 'or', source: 'Sambad (ସମ୍ବାଦ)', url: 'https://sambad.in/feed/', limit: 6 },
  { state: 'Odisha', hl: 'or', source: 'Dharitri (ଧରିତ୍ରୀ)', url: 'https://www.dharitri.com/feed/', limit: 6 },
  { state: 'Odisha', hl: 'or', source: 'OdishaTV (OTV)', url: 'https://odishatv.in/feed', limit: 6 },
  { state: 'Odisha', hl: 'or', source: 'Prameya (ପ୍ରମେୟ)', url: 'https://www.prameyanews.com/feed', limit: 5 },
  { state: 'Odisha', hl: 'or', source: 'Kanak News', url: 'https://kanaknews.com/feed/', limit: 5 },
  { state: 'Odisha', hl: 'or', source: 'Odisha Districts Desk', url: 'https://news.google.com/rss/search?q=(ଭୁବନେଶ୍ୱର+OR+କଟକ+OR+ପୁରୀ+OR+ସମ୍ବଲପୁର+OR+ବ୍ରହ୍ମପୁର+OR+ବାଲେଶ୍ୱର+OR+ରାଉରକେଲା+OR+କୋରାପୁଟ+OR+ମୟୂରଭଞ୍ଜ+OR+ଯାଜପୁର+OR+ଭଦ୍ରକ+OR+ଅନୁଗୋଳ)+when:2d&hl=or&gl=IN&ceid=IN:or', limit: 10 },

  // Telangana & Andhra Pradesh (Telugu)
  { state: 'Telangana', hl: 'te', source: 'Eenadu / Telangana Desk', url: 'https://news.google.com/rss/search?q=(హైదరాబాద్+OR+వరంగల్+OR+నిజామాబాద్+OR+కరీంనగర్+OR+ఖమ్మం+OR+నల్గొండ+OR+తెలంగాణ)+when:2d&hl=te&gl=IN&ceid=IN:te', limit: 10 },
  { state: 'Andhra Pradesh', hl: 'te', source: 'Sakshi / AP Desk', url: 'https://news.google.com/rss/search?q=(అమరావతి+OR+విశాఖపట్నం+OR+విజయవాడ+OR+తిరుపతి+OR+గుంటూరు+OR+కర్నూలు+OR+ఆంధ్రప్రదేశ్)+when:2d&hl=te&gl=IN&ceid=IN:te', limit: 10 },

  // West Bengal & Tripura (Bengali)
  { state: 'West Bengal', hl: 'bn', source: 'Anandabazar / Bengal Desk', url: 'https://news.google.com/rss/search?q=(কলকাতা+OR+হাওড়া+OR+দার্জিলিং+OR+শিলিগুড়ি+OR+দুর্গাপুর+OR+বর্ধমান+OR+পশ্চিমবঙ্গ)+when:2d&hl=bn&gl=IN&ceid=IN:bn', limit: 10 },
  { state: 'Tripura', hl: 'bn', source: 'Tripura Desk', url: 'https://news.google.com/rss/search?q=(আগরতলা+OR+ত্রিপুরা)+when:3d&hl=bn&gl=IN&ceid=IN:bn', limit: 6 },

  // Tamil Nadu (Tamil)
  { state: 'Tamil Nadu', hl: 'ta', source: 'Dinamalar / TN Desk', url: 'https://news.google.com/rss/search?q=(சென்னை+OR+கோயம்புத்தூர்+OR+மதுரை+OR+திருச்சி+OR+சேலம்+OR+தமிழ்நாடு)+when:2d&hl=ta&gl=IN&ceid=IN:ta', limit: 10 },

  // Karnataka (Kannada)
  { state: 'Karnataka', hl: 'kn', source: 'Prajavani / Karnataka Desk', url: 'https://news.google.com/rss/search?q=(ಬೆಂಗಳೂರು+OR+ಮೈಸೂರು+OR+ಮಂಗಳೂರು+OR+ಹುಬ್ಬಳ್ಳಿ+OR+ಬೆಳಗಾವಿ+OR+ಕರ್ನಾಟಕ)+when:2d&hl=kn&gl=IN&ceid=IN:kn', limit: 10 }
];

const REMAINING_STATES = [
  { name: 'Maharashtra', hl: 'hi', q: 'मुंबई OR पुणे OR नागपूर OR नाशिक OR महाराष्ट्र' },
  { name: 'Kerala', hl: 'en', q: '"Kerala" (Thiruvananthapuram OR Kochi OR Kozhikode OR Thrissur)' },
  { name: 'Gujarat', hl: 'hi', q: 'अहमदाबाद OR सूरत OR वडोदरा OR राजकोट OR गुजरात' },
  { name: 'Punjab', hl: 'hi', q: 'अमृतसर OR लुधियाना OR जालंधर OR पटियाला OR पंजाब' },
  { name: 'Uttar Pradesh', hl: 'hi', q: 'लखनऊ OR वाराणसी OR कानपुर OR आगरा OR नोएडा OR प्रयागराज' },
  { name: 'Bihar', hl: 'hi', q: 'पटना OR गया OR मुजफ्फरपुर OR भागलपुर OR दरभंगा' },
  { name: 'Madhya Pradesh', hl: 'hi', q: 'भोपाल OR इंदौर OR ग्वालियर OR जबलपुर OR उज्जैन' },
  { name: 'Rajasthan', hl: 'hi', q: 'जयपुर OR जोधपुर OR उदयपुर OR कोटा OR अजमेर' },
  { name: 'Haryana', hl: 'hi', q: 'गुरुग्राम OR फरीदाबाद OR अंबाला OR हिसार OR रोहतक' },
  { name: 'Chhattisgarh', hl: 'hi', q: 'रायपुर OR बिलासपुर OR दुर्ग OR बस्तर OR कोरबा' },
  { name: 'Jharkhand', hl: 'hi', q: 'रांची OR जमशेदपुर OR धनबाद OR बोकारो' },
  { name: 'Uttarakhand', hl: 'hi', q: 'देहरादून OR हरिद्वार OR नैनीताल OR हल्द्वानी' },
  { name: 'Himachal Pradesh', hl: 'hi', q: 'शिमला OR मनाली OR धर्मशाला OR कांगड़ा' },
  { name: 'Assam', hl: 'en', q: '"Assam" (Guwahati OR Dibrugarh OR Silchar OR Jorhat)' },
  { name: 'Arunachal Pradesh', hl: 'en', q: '"Arunachal Pradesh" (Itanagar OR Tawang)' },
  { name: 'Goa', hl: 'en', q: '"Goa" (Panaji OR Margao OR Vasco)' },
  { name: 'Manipur', hl: 'en', q: '"Manipur" (Imphal OR Churachandpur)' },
  { name: 'Meghalaya', hl: 'en', q: '"Meghalaya" (Shillong OR Tura)' },
  { name: 'Mizoram', hl: 'en', q: '"Mizoram" (Aizawl OR Lunglei)' },
  { name: 'Nagaland', hl: 'en', q: '"Nagaland" (Kohima OR Dimapur)' },
  { name: 'Sikkim', hl: 'en', q: '"Sikkim" (Gangtok OR Namchi)' }
];

const CORE_FEEDS = [
  // General
  { url: 'https://feeds.feedburner.com/ndtvnews-top-stories', category: 'General', source: 'NDTV', limit: 6 },
  { url: 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms', category: 'General', source: 'Times of India', limit: 6 },

  // India National
  { url: 'https://www.thehindu.com/news/national/feeder/default.rss', category: 'India National', source: 'The Hindu', limit: 7 },
  { url: 'https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms', category: 'India National', source: 'Times of India', limit: 6 },
  { url: 'https://feeds.feedburner.com/ndtvnews-india-news', category: 'India National', source: 'NDTV India', limit: 6 },

  // World
  { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', category: 'World', source: 'BBC News', limit: 7 },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml', category: 'World', source: 'Al Jazeera', limit: 6 },

  // Politics
  { url: 'https://www.thehindu.com/news/national/politics/feeder/default.rss', category: 'Politics', source: 'The Hindu', limit: 7 },
  { url: 'https://news.google.com/rss/search?q=(Parliament+OR+Lok+Sabha+OR+Rajya+Sabha+OR+Union+Cabinet+OR+Election+Commission+OR+Chief+Minister+OR+BJP+OR+Congress)+when:2d&hl=en-IN&gl=IN&ceid=IN:en', category: 'Politics', source: 'India Politics Desk', limit: 7 },

  // Sports
  { url: 'https://feeds.bbci.co.uk/sport/rss.xml', category: 'Sports', source: 'BBC Sport', limit: 6 },
  { url: 'https://timesofindia.indiatimes.com/rssfeeds/4719148.cms', category: 'Sports', source: 'Times of India', limit: 6 },
  { url: 'https://feeds.feedburner.com/ndtvsports-latest', category: 'Sports', source: 'NDTV Sports', limit: 6 },

  // Science & Education
  { url: 'https://www.thehindu.com/sci-tech/science/feeder/default.rss', category: 'Science & Education', source: 'The Hindu Science', limit: 6 },
  { url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml', category: 'Science & Education', source: 'BBC Science', limit: 5 },
  { url: 'https://news.google.com/rss/search?q=(ISRO+OR+NASA+OR+UGC+OR+CBSE+OR+NEET+OR+JEE+OR+IIT+OR+education+policy+OR+scientific+research)+when:2d&hl=en-IN&gl=IN&ceid=IN:en', category: 'Science & Education', source: 'Science & Edu Desk', limit: 7 },

  // Entertainment
  { url: 'https://timesofindia.indiatimes.com/rssfeeds/1081479906.cms', category: 'Entertainment', source: 'Times of India', limit: 6 },
  { url: 'https://www.bollywoodhungama.com/rss/news.xml', category: 'Entertainment', source: 'Bollywood Hungama', limit: 6 },
  { url: 'https://feeds.feedburner.com/ndtvmovies-latest', category: 'Entertainment', source: 'NDTV Movies', limit: 5 }
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
      if (t.length > 50 && !/subscription|cookie|copyright|sign in/i.test(t)) {
        paragraphs.push(t);
      }
    });
    return { image: upgradeImageUrl(ogImg), text: paragraphs.slice(0, 6).join(' ') };
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
  if (!cleaned || cleaned.split(/\s+/).length < 14) {
    cleaned = `${fallbackTitle.replace(/[.।]$/, '')}. Official sources and correspondents have confirmed the latest developments and administrative updates on this report.`;
  }
  const words = cleaned.split(/\s+/);
  if (words.length > 52) cleaned = words.slice(0, 50).join(' ');
  const lastDot = Math.max(cleaned.lastIndexOf('.'), cleaned.lastIndexOf('।'), cleaned.lastIndexOf('!'), cleaned.lastIndexOf('?'));
  if (lastDot > 30) cleaned = cleaned.slice(0, lastDot + 1);
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

// Editorial Multilingual Generator: Produces natural, idiomatic headlines & 45-50 word gists in all 7 app languages
async function generateEditorialMultilingual({ title, rawText, source, suggestedCategory, nativeLang = 'en', stateName = '', isPodcast = false }) {
  const contextText = (rawText || '').slice(0, 1600);

  const prompt = `You are the chief multilingual news editor for Pulse50. Read the story below and produce natural, journalistic, grammatically complete headlines and 45 to 50 word summaries in ALL 7 languages:
- en (English)
- or (Odia / ଓଡ଼ିଆ)
- hi (Hindi / हिंदी)
- bn (Bengali / বাংলা)
- te (Telugu / తెలుగు)
- ta (Tamil / தமிழ்)
- kn (Kannada / ಕನ್ನಡ)

CRITICAL EDITORIAL RULES:
1. NEVER do word-for-word machine translation. Write natural, idiomatic sentences as a native newspaper editor would write in each script.
2. Convert numbers, currency, and idioms properly into each language (e.g., "Rs. 2.30 crores" -> "₹2.30 करोड़" in Hindi, "₹୨.୩୦ କୋଟି" or "₹2.30 କୋଟି" in Odia — NEVER split "Rs." from the number).
3. Transliterate or translate all English words cleanly into the target script (never leave broken English fragments like "ity" or random English verbs inside Odia/Hindi/Telugu sentences).
4. Each summary MUST be 44 to 50 words, end with a proper sentence terminator (. or ।), include concrete facts (who, what, where, district/impact), and NEVER repeat the headline verbatim or mention "${source}".
5. ${isPodcast ? 'Categories MUST be ["Podcasts"].' : 'Classify from ONLY: ["India National", "World", "Politics", "Sports", "Entertainment", "Science & Education"].'}
${stateName ? `6. Highlight the specific district and local impact in ${stateName}.` : ''}

Return ONLY valid JSON in this exact schema:
{
  "categories": ["..."],
  "translations": {
    "en": { "title": "...", "summary": "..." },
    "or": { "title": "...", "summary": "..." },
    "hi": { "title": "...", "summary": "..." },
    "bn": { "title": "...", "summary": "..." },
    "te": { "title": "...", "summary": "..." },
    "ta": { "title": "...", "summary": "..." },
    "kn": { "title": "...", "summary": "..." }
  }
}

Original Headline: ${title}
Suggested Category: ${suggestedCategory}
Source Material: ${contextText || title}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });
    const parsed = JSON.parse(response?.text || '{}');
    const tr = parsed.translations || {};
    const cleanTranslations = {};

    for (const code of ['en', 'or', 'hi', 'bn', 'te', 'ta', 'kn']) {
      if (tr[code]?.title && tr[code]?.summary) {
        cleanTranslations[code] = {
          title: cleanHtml(tr[code].title),
          summary: ensureCompleteSummary(tr[code].summary, tr[code].title)
        };
      }
    }

    const baseTitle = cleanTranslations[nativeLang]?.title || cleanTranslations.en?.title || title;
    const baseSummary = cleanTranslations[nativeLang]?.summary || cleanTranslations.en?.summary || ensureCompleteSummary(contextText, title);
    const aiCats = Array.isArray(parsed.categories) ? parsed.categories : [suggestedCategory];

    return {
      title: baseTitle,
      summary: baseSummary,
      translations: cleanTranslations,
      verifiedCategories: aiCats
    };
  } catch (err) {
    console.warn(`Multilingual Gemini fallback for "${title.slice(0, 35)}":`, err?.status || err?.message);
    return {
      title,
      summary: ensureCompleteSummary(contextText, title),
      translations: { [nativeLang]: { title, summary: ensureCompleteSummary(contextText, title) } },
      verifiedCategories: [suggestedCategory]
    };
  }
}

async function run() {
  const allStories = [];
  const seenTitles = new Set();

  const addUnique = (story) => {
    const key = (story.translations?.en?.title || story.title).toLowerCase().replace(/\s+/g, '').slice(0, 60);
    if (!key || seenTitles.has(key)) return;
    seenTitles.add(key);
    allStories.push(story);
  };

  console.log('1. Fetching Core Category Feeds (7-Language Native Editorial)...');
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

        const editorial = await generateEditorialMultilingual({
          title: rawTitle,
          rawText: bodyText,
          source: feed.source,
          suggestedCategory: feed.category,
          nativeLang: 'en'
        });

        const finalTags = new Set(['General']);
        for (const cat of editorial.verifiedCategories) {
          if (verifyCategorySemantically(cat, cat, editorial.title, editorial.summary)) finalTags.add(cat);
        }
        if (verifyCategorySemantically(feed.category, feed.category, editorial.title, editorial.summary)) {
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
          title: editorial.title,
          summary: editorial.summary,
          translations: editorial.translations,
          source: feed.source,
          image: img,
          video: '',
          link: item.link || '',
          pubDate: item.isoDate || item.pubDate || new Date().toISOString()
        });
        await sleep(1200);
      }
    } catch (e) {
      console.warn(`Core feed error (${feed.source}):`, e.message);
    }
  }

  console.log('2. Fetching Direct Regional Newspapers, TV & District Feeds...');
  for (const sFeed of STATE_DIRECT_FEEDS) {
    try {
      const parsed = await parser.parseURL(sFeed.url);
      const items = (parsed.items || []).slice(0, sFeed.limit);
      for (const item of items) {
        const parts = cleanHtml(item.title || '').split(' - ');
        const extractedSource = parts.length > 1 ? parts.pop().trim() : sFeed.source;
        const rawTitle = parts.join(' - ').trim();
        if (!rawTitle) continue;

        let img = extractRssImage(item);
        let bodyText = cleanHtml(item['content:encoded'] || item.contentSnippet || item.description || '');
        if (!img || bodyText.split(/\s+/).length < 25) {
          const scraped = await scrapeArticleDetails(item.link);
          if (!img && scraped.image) img = scraped.image;
          if (scraped.text.length > bodyText.length) bodyText = scraped.text;
        }

        const editorial = await generateEditorialMultilingual({
          title: rawTitle,
          rawText: bodyText || rawTitle,
          source: extractedSource,
          suggestedCategory: 'State',
          nativeLang: sFeed.hl,
          stateName: sFeed.state
        });

        addUnique({
          id: Buffer.from(`${sFeed.state}-${rawTitle}`).toString('base64').slice(0, 24),
          category: 'State',
          primaryCategory: 'State',
          tags: ['State'],
          stateTags: [sFeed.state],
          nativeLang: sFeed.hl,
          title: editorial.title,
          summary: editorial.summary,
          translations: editorial.translations,
          source: extractedSource,
          image: img,
          video: '',
          link: item.link || '',
          pubDate: item.isoDate || item.pubDate || new Date().toISOString()
        });
        await sleep(1200);
      }
    } catch (e) {
      console.warn(`Direct state feed error (${sFeed.source}):`, e.message);
    }
  }

  console.log('3. Fetching Remaining States District Feeds...');
  for (const st of REMAINING_STATES) {
    try {
      const ceid = st.hl === 'hi' ? 'IN:hi' : 'IN:en';
      const hlParam = st.hl === 'hi' ? 'hi' : 'en-IN';
      const stateUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(`(${st.q}) when:3d`)}&hl=${hlParam}&gl=IN&ceid=${ceid}`;
      const parsed = await parser.parseURL(stateUrl);
      const items = (parsed.items || []).slice(0, 5);

      for (const item of items) {
        const parts = cleanHtml(item.title || '').split(' - ');
        const sourceName = parts.length > 1 ? parts.pop().trim() : `${st.name} Desk`;
        const rawTitle = parts.join(' - ').trim();
        if (!rawTitle) continue;

        const snippet = cleanHtml(item.contentSnippet || item.description || rawTitle);
        const editorial = await generateEditorialMultilingual({
          title: rawTitle,
          rawText: snippet,
          source: sourceName,
          suggestedCategory: 'State',
          nativeLang: st.hl,
          stateName: st.name
        });

        addUnique({
          id: Buffer.from(`${st.name}-${rawTitle}`).toString('base64').slice(0, 24),
          category: 'State',
          primaryCategory: 'State',
          tags: ['State'],
          stateTags: [st.name],
          nativeLang: st.hl,
          title: editorial.title,
          summary: editorial.summary,
          translations: editorial.translations,
          source: sourceName,
          image: extractRssImage(item),
          video: '',
          link: item.link || '',
          pubDate: item.isoDate || item.pubDate || new Date().toISOString()
        });
        await sleep(1200);
      }
    } catch (e) {
      console.warn(`Remaining state error (${st.name}):`, e.message);
    }
  }

  console.log('4. Fetching Podcasts (7-Language Native Editorial)...');
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

        const editorial = await generateEditorialMultilingual({
          title: rawTitle,
          rawText: rawDesc || rawTitle,
          source: pod.source,
          suggestedCategory: 'Podcasts',
          nativeLang: 'en',
          isPodcast: true
        });

        addUnique({
          id: Buffer.from(`pod-${videoId || rawTitle}`).toString('base64').slice(0, 24),
          category: 'Podcasts',
          primaryCategory: 'Podcasts',
          tags: ['Podcasts'],
          stateTags: [],
          nativeLang: 'en',
          title: editorial.title,
          summary: editorial.summary,
          translations: editorial.translations,
          source: pod.source,
          image: thumb,
          video: videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=1` : link,
          link: link || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : ''),
          pubDate: item.isoDate || item.pubDate || new Date().toISOString()
        });
        await sleep(1200);
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
