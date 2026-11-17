import fs from "fs";
import Parser from "rss-parser";
import * as cheerio from "cheerio";
import { GoogleGenAI } from "@google/genai";

const parser = new Parser({
  timeout: 15000,
  headers: { "User-Agent": "Mozilla/5.0 (compatible; Pulse50Bot/1.0)" },
  customFields: {
    item: ["media:group", "media:description", "media:content", "media:thumbnail", "enclosure"]
  }
});

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const FEEDS = [
  // General & National
  { category: "General", source: "Google News India", url: "https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en", limit: 6 },
  { category: "India National", source: "The Hindu", url: "https://www.thehindu.com/news/national/feeder/default.rss", limit: 6 },
  { category: "India National", source: "NDTV India", url: "https://feeds.feedburner.com/ndtvnews-india-news", limit: 6 },

  // World
  { category: "World", source: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", limit: 6 },
  { category: "World", source: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", limit: 5 },

  // Politics, Sports & Entertainment
  { category: "Politics", source: "India Politics Desk", url: "https://news.google.com/rss/search?q=India+parliament+cabinet+election+politics+when:2d&hl=en-IN&gl=IN&ceid=IN:en", limit: 7 },
  { category: "Sports", source: "BBC Sport", url: "https://feeds.bbci.co.uk/sport/rss.xml", limit: 5 },
  { category: "Sports", source: "India Sports Desk", url: "https://news.google.com/rss/search?q=India+cricket+BCCI+IPL+sports+when:2d&hl=en-IN&gl=IN&ceid=IN:en", limit: 5 },
  { category: "Entertainment", source: "Entertainment Desk", url: "https://news.google.com/rss/search?q=Bollywood+Tollywood+Indian+cinema+OTT+when:2d&hl=en-IN&gl=IN&ceid=IN:en", limit: 7 },

  // Verified YouTube Podcast Feeds + Guaranteed Podcast News RSS Fallback
  { category: "Podcasts", source: "Raj Shamani", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCneyi-aYq4VIBYIAQgWmk_w", limit: 3 },
  { category: "Podcasts", source: "Nikhil Kamath", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCRvG4p8_8J1s-vG2h5q9h-Q", limit: 3 },
  { category: "Podcasts", source: "ANI Podcast", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCtFQDgA8J8_iiwc5-KoAQlg", limit: 3 },
  { category: "Podcasts", source: "Lex Fridman", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCSHZKyawb77ixDdsGog4iWA", limit: 3 },
  { category: "Podcasts", source: "Huberman Lab", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UC2D2CMWXMOVWx7giW1n3LIg", limit: 3 },
  { category: "Podcasts", source: "Diary Of A CEO", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCGq-a57w-aPwyi3pW7XLiHw", limit: 3 },
  { category: "Podcasts", source: "Podcasts Desk", url: "https://news.google.com/rss/search?q=(podcast+episode+OR+%22Figuring+Out%22+OR+%22WTF+is%22+OR+%22ANI+Podcast%22+OR+%22Lex+Fridman%22)+when:7d&hl=en-IN&gl=IN&ceid=IN:en", limit: 8 }
];

// Domestic State-Specific Keywords (Capital + Major Cities + State Name)
const STATE_DOMESTIC_MAP = {
  "Andhra Pradesh": ["Andhra Pradesh", "Amaravati", "Visakhapatnam", "Vijayawada", "Tirupati"],
  "Arunachal Pradesh": ["Arunachal Pradesh", "Itanagar", "Tawang"],
  "Assam": ["Assam", "Guwahati", "Dispur", "Dibrugarh"],
  "Bihar": ["Bihar", "Patna", "Gaya", "Muzaffarpur"],
  "Chhattisgarh": ["Chhattisgarh", "Raipur", "Bilaspur", "Bastar"],
  "Goa": ["Goa", "Panaji", "Margao"],
  "Gujarat": ["Gujarat", "Ahmedabad", "Gandhinagar", "Surat", "Vadodara"],
  "Haryana": ["Haryana", "Gurugram", "Faridabad", "Panipat"],
  "Himachal Pradesh": ["Himachal Pradesh", "Shimla", "Manali", "Dharamshala"],
  "Jharkhand": ["Jharkhand", "Ranchi", "Jamshedpur", "Dhanbad"],
  "Karnataka": ["Karnataka", "Bengaluru", "Mysuru", "Mangaluru", "Hubballi"],
  "Kerala": ["Kerala", "Thiruvananthapuram", "Kochi", "Kozhikode"],
  "Madhya Pradesh": ["Madhya Pradesh", "Bhopal", "Indore", "Gwalior", "Jabalpur"],
  "Maharashtra": ["Maharashtra", "Mumbai", "Pune", "Nagpur", "Nashik"],
  "Manipur": ["Manipur", "Imphal"],
  "Meghalaya": ["Meghalaya", "Shillong"],
  "Mizoram": ["Mizoram", "Aizawl"],
  "Nagaland": ["Nagaland", "Kohima", "Dimapur"],
  "Odisha": ["Odisha", "Bhubaneswar", "Cuttack", "Puri", "Rourkela"],
  "Punjab": ["Punjab", "Amritsar", "Ludhiana", "Jalandhar", "Patiala"],
  "Rajasthan": ["Rajasthan", "Jaipur", "Jodhpur", "Udaipur", "Kota"],
  "Sikkim": ["Sikkim", "Gangtok"],
  "Tamil Nadu": ["Tamil Nadu", "Chennai", "Coimbatore", "Madurai"],
  "Telangana": ["Telangana", "Hyderabad", "Warangal", "Karimnagar", "Nizamabad"],
  "Tripura": ["Tripura", "Agartala"],
  "Uttar Pradesh": ["Uttar Pradesh", "Lucknow", "Kanpur", "Varanasi", "Noida", "Prayagraj"],
  "Uttarakhand": ["Uttarakhand", "Dehradun", "Haridwar", "Nainital"],
  "West Bengal": ["West Bengal", "Kolkata", "Howrah", "Darjeeling", "Siliguri"]
};

// Fetch dedicated domestic governance, civic & local news per state
for (const [state, places] of Object.entries(STATE_DOMESTIC_MAP)) {
  const domesticQuery = `("${state}" OR "${places[1]}") (government OR CM OR district OR police OR high court OR scheme OR civic) when:3d`;
  FEEDS.push({
    category: "India States",
    state,
    source: `${state} Desk`,
    url: `https://news.google.com/rss/search?q=${encodeURIComponent(domesticQuery)}&hl=en-IN&gl=IN&ceid=IN:en`,
    limit: 4
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Strict domestic state matcher: checks HEADLINE only so general national stories don't pollute state tabs
function detectDomesticStatesFromHeadline(headline, expectedState) {
  const matched = new Set();
  for (const [st, places] of Object.entries(STATE_DOMESTIC_MAP)) {
    const regex = new RegExp(`\\b(${places.join("|")})\\b`, "i");
    if (regex.test(headline)) {
      matched.add(st);
    }
  }
  // If fetched from a state's dedicated feed and no other state dominates the headline, keep expectedState
  if (matched.size === 0 && expectedState) {
    matched.add(expectedState);
  }
  return Array.from(matched);
}

async function fetchArticleContext(url, rawSnippet) {
  const cleanSnippet = cheerio.load(rawSnippet || "").text().replace(/\s+/g, " ").trim();
  if (!url || url.includes("news.google.com") || url.includes("youtube.com")) {
    return cleanSnippet;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Pulse50EditorialBot/1.0)" }
    });
    clearTimeout(timer);
    const html = await res.text();
    const $ = cheerio.load(html);
    $("script, style, nav, footer, header, aside, form").remove();
    const paras = $("p")
      .map((_, el) => $(el).text().trim())
      .get()
      .filter((p) => p.length > 50 && !/subscribe|cookie|sign in|all rights reserved|advertisement/i.test(p))
      .slice(0, 5)
      .join(" ");
    return paras.length > 120 ? paras.slice(0, 2000) : cleanSnippet;
  } catch {
    return cleanSnippet;
  }
}

function buildCleanFallback(title, rawContext, source) {
  let text = cheerio.load(rawContext || "").text().replace(/\s+/g, " ").trim();
  if (text.toLowerCase().startsWith(title.toLowerCase().slice(0, 25))) {
    text = text.slice(title.length).replace(/^[:\-–—.,|\s]+/, "").trim();
  }
  text = text.replace(/\b(Live Law|The Hindu|NDTV|Times of India|Indian Express|PTI|ANI)\b[:\s-]*/gi, "").trim();

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length >= 18) {
    return words.slice(0, 48).join(" ").replace(/[,;:\-–—]+$/, "") + ".";
  }
  return `Key developments and official updates regarding ${title.toLowerCase()} were reported by ${source}. Full background details and ongoing coverage are available via the source link below.`;
}

async function rewriteTo50Words(title, rawContext, source, isPodcast) {
  const prompt = isPodcast
    ? `Write an engaging, original 45 to 50-word podcast episode summary explaining the key topic, speaker insights, and main takeaway. Do NOT repeat the title. Output ONLY the 45-50 word paragraph.\nEpisode Title: ${title}\nNotes: ${rawContext}`
    : `Rewrite this news report into an original, factual 45 to 50-word summary in crisp English with complete sentences. Do NOT repeat the headline or mention publisher names. Output ONLY the 45-50 word paragraph.\nHeadline: ${title}\nArticle Facts: ${rawContext}`;

  try {
    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt
    });
    const out = (res.text || "").replace(/\s+/g, " ").trim();
    const wc = out.split(/\s+/).filter(Boolean).length;
    if (wc >= 28 && wc <= 60) return out;
  } catch (err) {
    console.warn("Gemini fallback used:", title.slice(0, 35), err.message);
  }

  return buildCleanFallback(title, rawContext, source);
}

async function run() {
  const results = [];
  const seen = new Set();

  for (const feed of FEEDS) {
    try {
      const parsed = await parser.parseURL(feed.url);
      const items = (parsed.items || []).slice(0, feed.limit || 5);

      for (const item of items) {
        const cleanTitle = (item.title || "")
          .replace(/\s+[-|–—]\s+[^-|–—]+$/, "")
          .replace(/#\w+/g, "")
          .trim();
        if (!cleanTitle || seen.has(cleanTitle.toLowerCase())) continue;
        seen.add(cleanTitle.toLowerCase());

        const isPodcast = feed.category === "Podcasts" || /\b(podcast|figuring out|wtf is|lex fridman|huberman)\b/i.test(cleanTitle);
        const isStateFeed = feed.category === "India States";

        const rawSnippet =
          item["media:group"]?.["media:description"]?.[0] ||
          item.contentSnippet ||
          item.content ||
          item.summary ||
          "";

        const context = isPodcast ? rawSnippet : await fetchArticleContext(item.link, rawSnippet);
        const summary = await rewriteTo50Words(cleanTitle, context, feed.source, isPodcast);

        // Only assign domestic stateTags for dedicated State feeds (keeps States distinct from General)
        const stateTags = isStateFeed ? detectDomesticStatesFromHeadline(cleanTitle, feed.state) : [];
        const tags = new Set([feed.category]);

        if (isPodcast) tags.add("Podcasts");
        if (isStateFeed && stateTags.length > 0) {
          tags.add("India States");
        } else if (!isStateFeed) {
          // Keep General focused on top national/world/general stories rather than flooding with every district story
          tags.add("General");
        }

        const ytMatch = (item.link || "").match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        const video = ytMatch ? `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1` : "";
        const image = ytMatch
          ? `https://i.ytimg.com/vi/${ytMatch[1]}/hqdefault.jpg`
          : (item["media:content"]?.["$"]?.url || item["media:thumbnail"]?.["$"]?.url || item.enclosure?.url || "");

        results.push({
          id: Buffer.from(cleanTitle).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 22),
          primaryCategory: isPodcast ? "Podcasts" : feed.category,
          tags: Array.from(tags),
          stateTags,
          title: cleanTitle,
          summary,
          source: feed.source,
          image,
          video,
          link: item.link || "https://news.google.com",
          pubDate: item.pubDate || new Date().toISOString()
        });

        await sleep(1400);
      }
    } catch (e) {
      console.warn(`Feed skipped (${feed.source}):`, e.message);
    }
  }

  console.log(`Total stories prepared: ${results.length}`);
  if (results.length >= 25) {
    fs.writeFileSync("news.json", JSON.stringify(results, null, 2));
    console.log("Successfully wrote news.json");
  } else {
    console.error("Too few stories fetched; keeping existing news.json intact.");
    process.exit(1);
  }
}

run();
