import fs from "fs";
import Parser from "rss-parser";
import * as cheerio from "cheerio";
import { GoogleGenAI } from "@google/genai";

const parser = new Parser({
  timeout: 15000,
  headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36" },
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
      ["media:group", "mediaGroup"],
      ["content:encoded", "contentEncoded"]
    ]
  }
});

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Upgraded limits to generate ~85-100 AI-rewritten 50-word stories per run
const FEEDS = [
  // General & India National
  { category: "General", source: "Times of India", url: "https://timesofindia.indiatimes.com/rssfeedstopstories.cms", limit: 10 },
  { category: "General", source: "NDTV Top Stories", url: "https://feeds.feedburner.com/ndtvnews-top-stories", limit: 10 },
  { category: "India National", source: "The Hindu", url: "https://www.thehindu.com/news/national/feeder/default.rss", limit: 10 },
  { category: "India National", source: "NDTV India", url: "https://feeds.feedburner.com/ndtvnews-india-news", limit: 10 },
  { category: "India National", source: "Times of India", url: "https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms", limit: 8 },

  // World
  { category: "World", source: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", limit: 10 },
  { category: "World", source: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", limit: 8 },
  { category: "World", source: "NDTV World", url: "https://feeds.feedburner.com/ndtvnews-world-news", limit: 8 },

  // Politics
  { category: "Politics", source: "The Hindu Politics", url: "https://www.thehindu.com/news/national/feeder/default.rss", limit: 8 },
  { category: "Politics", source: "NDTV Politics", url: "https://feeds.feedburner.com/ndtvnews-india-news", limit: 8 },
  { category: "Politics", source: "India Politics", url: "https://news.google.com/rss/search?q=Indian+politics+parliament+cabinet+BJP+Congress+when:2d&hl=en-IN&gl=IN&ceid=IN:en", limit: 10 },

  // Sports
  { category: "Sports", source: "BBC Sport", url: "https://feeds.bbci.co.uk/sport/rss.xml", limit: 8 },
  { category: "Sports", source: "NDTV Sports", url: "https://feeds.feedburner.com/ndtvsports-latest", limit: 10 },
  { category: "Sports", source: "TOI Sports", url: "https://timesofindia.indiatimes.com/rssfeeds/4719148.cms", limit: 8 },

  // Entertainment
  { category: "Entertainment", source: "NDTV Movies", url: "https://feeds.feedburner.com/ndtvmovies-latest", limit: 10 },
  { category: "Entertainment", source: "TOI Entertainment", url: "https://timesofindia.indiatimes.com/rssfeeds/1081479906.cms", limit: 10 },
  { category: "Entertainment", source: "Bollywood Hungama", url: "https://www.bollywoodhungama.com/rss/news.xml", limit: 8 },

  // Priority States (Direct Publisher Feeds with HD Photos)
  { category: "India States", state: "Telangana", source: "The Hindu Telangana", url: "https://www.thehindu.com/news/national/telangana/feeder/default.rss", limit: 10 },
  { category: "India States", state: "Telangana", source: "TOI Hyderabad", url: "https://timesofindia.indiatimes.com/rssfeeds/-2128816011.cms", limit: 8 },
  { category: "India States", state: "Andhra Pradesh", source: "The Hindu AP", url: "https://www.thehindu.com/news/national/andhra-pradesh/feeder/default.rss", limit: 8 },
  { category: "India States", state: "Karnataka", source: "The Hindu Karnataka", url: "https://www.thehindu.com/news/national/karnataka/feeder/default.rss", limit: 8 },
  { category: "India States", state: "Tamil Nadu", source: "The Hindu Tamil Nadu", url: "https://www.thehindu.com/news/national/tamil-nadu/feeder/default.rss", limit: 8 },
  { category: "India States", state: "Maharashtra", source: "TOI Mumbai", url: "https://timesofindia.indiatimes.com/rssfeeds/-2128838597.cms", limit: 8 },
  { category: "India States", state: "Kerala", source: "The Hindu Kerala", url: "https://www.thehindu.com/news/national/kerala/feeder/default.rss", limit: 8 },

  // Podcasts (YouTube Official Feeds with HD Thumbnails + Video Embeds)
  { category: "Podcasts", source: "Raj Shamani", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCneyi-aYq4VIBYIAQgWmk_w", limit: 5 },
  { category: "Podcasts", source: "Lex Fridman", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCSHZKyawb77ixDdsGog4iWA", limit: 5 },
  { category: "Podcasts", source: "Huberman Lab", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UC2D2CMWXMOVWx7giW1n3LIg", limit: 5 },
  { category: "Podcasts", source: "Diary Of A CEO", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCGq-a57w-aPwyi3pW7XLiHw", limit: 5 }
];

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand",
  "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal"
];

// Add remaining states so every single one of the 28 states has dedicated coverage
const DIRECT_STATES = new Set(["Telangana", "Andhra Pradesh", "Karnataka", "Tamil Nadu", "Maharashtra", "Kerala"]);
for (const state of INDIAN_STATES) {
  if (!DIRECT_STATES.has(state)) {
    FEEDS.push({
      category: "India States",
      state,
      source: `${state} News`,
      url: `https://news.google.com/rss/search?q=${encodeURIComponent(state + " India news when:3d")}&hl=en-IN&gl=IN&ceid=IN:en`,
      limit: 3
    });
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function upgradeImageUrl(url) {
  if (!url || typeof url !== "string" || !url.startsWith("http")) return "";
  const lower = url.toLowerCase();
  if (lower.includes("googleusercontent") || lower.includes("gstatic") || lower.includes("logo") || lower.includes("icon") || lower.includes("1x1")) {
    return "";
  }
  return url
    .replace(/([?&])(w|width|h|height|quality|q)=\d+/gi, "")
    .replace(/resize=\d+[,x]\d+/gi, "resize=1200,675")
    .replace(/-\d{2,3}x\d{2,3}(\.(?:jpg|jpeg|png|webp))/gi, "$1")
    .replace(/[?&]+$/, "");
}

function extractFeedImage(item) {
  const ytMatch = (item.link || "").match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) return `https://i.ytimg.com/vi/${ytMatch[1]}/hqdefault.jpg`;

  const mediaUrl =
    item.mediaContent?.[0]?.$?.url ||
    item.mediaThumbnail?.[0]?.$?.url ||
    item.enclosure?.url ||
    "";
  if (upgradeImageUrl(mediaUrl)) return upgradeImageUrl(mediaUrl);

  const html = `${item.contentEncoded || ""} ${item.content || ""} ${item.summary || ""}`;
  const imgMatch = html.match(/<img[^>]+src=["']([^"'>]+)["']/i);
  if (imgMatch && upgradeImageUrl(imgMatch[1])) return upgradeImageUrl(imgMatch[1]);

  return "";
}

async function scrapeArticleAndImage(url, fallbackText, existingImg) {
  const cleanFallback = cheerio.load(fallbackText || "").text().replace(/\s+/g, " ").trim();
  if (!url || url.includes("news.google.com") || url.includes("youtube.com")) {
    return { text: cleanFallback, image: existingImg };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5500);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36" }
    });
    clearTimeout(timer);
    const html = await res.text();
    const $ = cheerio.load(html);

    let pageImg = existingImg;
    if (!pageImg) {
      const ogImg =
        $('meta[property="og:image"]').attr("content") ||
        $('meta[name="twitter:image"]').attr("content") ||
        $('meta[property="og:image:secure_url"]').attr("content") ||
        "";
      pageImg = upgradeImageUrl(ogImg);
    }

    $("script, style, nav, footer, header, aside, form").remove();
    const paras = $("article p, .article-body p, .story-content p, p")
      .map((_, el) => $(el).text().trim())
      .get()
      .filter((p) => p.length > 55 && !/subscribe|cookie|sign in|all rights reserved|also read|advertisement/i.test(p))
      .slice(0, 6)
      .join(" ");

    return {
      text: paras.length > 140 ? paras.slice(0, 2400) : cleanFallback,
      image: pageImg
    };
  } catch {
    return { text: cleanFallback, image: existingImg };
  }
}

async function writeEditorial50WordGist(title, articleText, isPodcast) {
  const prompt = isPodcast
    ? `You are a senior editor for Pulse50. Write a compelling, grammatically complete 45 to 50-word gist of this podcast episode explaining what the host and guest discuss and the main insight.
Rules:
- MUST be between 45 and 50 words.
- MUST end with a complete sentence and proper punctuation.
- Do NOT repeat the title word-for-word.
- Do NOT include hashtags, emojis, or "click link below".
Output ONLY the 45-50 word paragraph.

Episode Title: ${title}
Episode Notes: ${articleText}`
    : `You are a senior news editor for Pulse50 (like Inshorts). Write an informative, crystal-clear, grammatically complete 45 to 50-word news gist summarizing the key facts (who, what, where, why, and key outcomes).
Example style:
Headline: Modi on a visit to USA will be meeting President Donald Trump
Gist: Prime Minister Narendra Modi will hold one-on-one talks with President Donald Trump during his three-day visit to the United States. The leaders will discuss bilateral economic and financial growth, new defense equipment acquisitions, and deeper cultural cooperation between both nations.

Rules:
- MUST be strictly between 45 and 50 words.
- MUST be complete, well-formed sentences ending with a period.
- Do NOT repeat the headline at the start.
- Do NOT mention the newspaper/publisher name inside the gist.
- Do NOT use filler phrases like "full details available in the article".
Output ONLY the 45-50 word paragraph.

Headline: ${title}
Article Facts: ${articleText}`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt
      });
      const out = (res.text || "").replace(/\s+/g, " ").trim();
      const words = out.split(/\s+/).filter(Boolean);
      if (words.length >= 38 && words.length <= 55 && /[.!?]$/.test(out)) {
        return out;
      }
    } catch (err) {
      console.warn(`Gemini retry ${attempt} for "${title.slice(0, 35)}":`, err.message);
      await sleep(2500);
    }
  }

  let clean = cheerio.load(articleText || "").text().replace(/\s+/g, " ").trim();
  if (clean.toLowerCase().startsWith(title.toLowerCase().slice(0, 24))) {
    clean = clean.slice(title.length).replace(/^[:\-–—.,|\s]+/, "").trim();
  }
  const sentences = clean.split(/(?<=[.!?])\s+/).filter((s) => s.length > 20);
  let selected = [];
  let count = 0;
  for (const s of sentences) {
    const wc = s.split(/\s+/).length;
    if (count + wc <= 50) {
      selected.push(s);
      count += wc;
      if (count >= 40) break;
    }
  }
  return selected.length ? selected.join(" ") : "";
}

function detectStates(text, forcedState) {
  const found = new Set(forcedState ? [forcedState] : []);
  const lower = text.toLowerCase();
  for (const st of INDIAN_STATES) {
    if (lower.includes(st.toLowerCase())) found.add(st);
  }
  return Array.from(found);
}

async function run() {
  const results = [];
  const seen = new Set();

  for (const feed of FEEDS) {
    if (results.length >= 100) break; // Cap each batch at 100 fresh stories

    try {
      const parsed = await parser.parseURL(feed.url);
      const items = (parsed.items || []).slice(0, feed.limit || 8);

      for (const item of items) {
        if (results.length >= 100) break;

        const cleanTitle = (item.title || "")
          .replace(/\s+[-|–—]\s+[^-|–—]+$/, "")
          .replace(/#\w+/g, "")
          .trim();
        if (!cleanTitle || seen.has(cleanTitle.toLowerCase())) continue;
        seen.add(cleanTitle.toLowerCase());

        const isPodcast = feed.category === "Podcasts";
        const rssImg = extractFeedImage(item);
        const rawSnippet = item.mediaGroup?.["media:description"]?.[0] || item.contentSnippet || item.content || item.summary || "";

        const { text: richText, image: finalImage } = isPodcast
          ? { text: rawSnippet, image: rssImg }
          : await scrapeArticleAndImage(item.link, rawSnippet, rssImg);

        const summary = await writeEditorial50WordGist(cleanTitle, richText, isPodcast);
        if (!summary || summary.split(/\s+/).length < 22) continue;

        const stateTags = detectStates(`${cleanTitle} ${summary}`, feed.state);
        const tags = Array.from(new Set(["General", feed.category, ...(stateTags.length ? ["India States"] : [])]));

        const ytMatch = (item.link || "").match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        const video = ytMatch ? `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1` : "";

        results.push({
          id: Buffer.from(cleanTitle).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 22),
          primaryCategory: feed.category,
          tags,
          stateTags,
          title: cleanTitle,
          summary,
          source: feed.source,
          image: finalImage,
          video,
          link: item.link || "https://news.google.com",
          pubDate: item.pubDate || new Date().toISOString()
        });

        await sleep(1600);
      }
    } catch (e) {
      console.warn(`Feed skipped (${feed.source}):`, e.message);
    }
  }

  console.log(`Total 50-word stories with images prepared: ${results.length}`);
  if (results.length >= 25) {
    fs.writeFileSync("news.json", JSON.stringify(results, null, 2));
    console.log("Successfully wrote news.json");
  } else {
    console.error("Too few stories fetched; keeping existing news.json intact.");
    process.exit(1);
  }
}

run();
